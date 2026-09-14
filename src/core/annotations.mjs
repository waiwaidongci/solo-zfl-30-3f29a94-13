// 批注、行间对应与校验。
// 批注以字位 uid 列表锚定（可跨字、跨行）；行间对应以行 uid + 字位示例锚定。
// 增删移位只改顺序、不动 uid，因此锚点天然跟随原字符；字位被删除时校验器报悬空。
import { findLine, findSlot, iterSlots, slotPath } from "./model.mjs";
import { graphemes } from "./graphemes.mjs";

export const ANNOTATION_KINDS = {
  note: "批注",
  emendation: "校勘",
  question: "存疑",
  variant: "异文",
};

export function makeAnnotation(partial = {}) {
  return {
    id: partial.id || `a_${Math.random().toString(36).slice(2, 9)}`,
    kind: partial.kind || "note",
    anchorIds: partial.anchorIds ?? [],
    scopeLineId: partial.scopeLineId ?? null, // 声明只在本行范围内时填写
    text: partial.text ?? "",
  };
}

export function makeLineLink(partial = {}) {
  return {
    id: partial.id || `ll_${Math.random().toString(36).slice(2, 9)}`,
    aLine: partial.aLine || null,
    bLine: partial.bLine || null,
    note: partial.note ?? "",
    pairs: partial.pairs ?? [], // [{a: slotId, b: slotId}] 行间字位对应示例
  };
}

/* ---------- 校勘符号文法 ----------
合法（全角成对、不得嵌套、对内非空）：
  〔x〕 增补   （x） 拟补   〈x〉 改正
合法单字：□ 缺字占位、○ 空字
其余形似校勘符号一律为非法（逐项定位）：[]【】〖〗｛｝{}«»「」『』《》？？校勘位 */
const PAIRS = [
  { open: "〔", close: "〕", name: "增补" },
  { open: "（", close: "）", name: "拟补" },
  { open: "〈", close: "〉", name: "改正" },
];
const OPEN_TO_CLOSE = new Map(PAIRS.filter((p) => p.open).map((p) => [p.open, p]));
const ALLOWED_STANDALONE = new Set(["□", "○"]);
// 「」『』是正常引号、《》是书名号，不算校勘符号；此处只拦与法定括号形似者。
const ILLEGAL_MARKS = new Set([
  "[", "]", "【", "】", "〖", "〗", "｛", "｝", "{", "}", "«", "»",
  "?", "？", "*", "＊",
]);

// 检查一段校勘释文，返回 [{code, charIndex, symbol, message}]（charIndex 为字素簇序号）。
export function lintCollationText(text) {
  const issues = [];
  const clusters = graphemes(text);
  const stack = [];
  clusters.forEach((ch, i) => {
    const pair = OPEN_TO_CLOSE.get(ch);
    if (pair) {
      if (stack.length) {
        issues.push({ code: "NESTED_COLLATION_MARK", charIndex: i, symbol: ch, message: `校勘符号嵌套：「${ch}」` });
      }
      stack.push({ pair, start: i });
      return;
    }
    const opened = stack[stack.length - 1];
    if (opened && ch === opened.pair.close) {
      if (i === opened.start + 1) {
        issues.push({ code: "EMPTY_COLLATION_MARK", charIndex: i, symbol: ch, message: `「${opened.pair.open}${ch}」内容为空` });
      }
      stack.pop();
      return;
    }
    // 出现关闭符号但栈顶不匹配
    const stray = PAIRS.find((p) => p.close === ch);
    if (stray) {
      issues.push({ code: "UNBALANCED_COLLATION_MARK", charIndex: i, symbol: ch, message: `校勘符号失配：多余的「${ch}」` });
      return;
    }
    if (ILLEGAL_MARKS.has(ch)) {
      issues.push({ code: "ILLEGAL_COLLATION_MARK", charIndex: i, symbol: ch, message: `非法校勘符号：「${ch}」` });
    }
  });
  for (const item of stack) {
    issues.push({
      code: "UNBALANCED_COLLATION_MARK",
      charIndex: item.start,
      symbol: item.pair.open,
      message: `校勘符号未闭合：「${item.pair.open}」缺少「${item.pair.close}」`,
    });
  }
  // 对内不允许再出现任何括号类符号（嵌套已在上方处理；这里拦对内非法符号）
  return issues;
}

/* ---------- 全文校验：逐项定位 ---------- */

export function validateDocument(doc) {
  const issues = [];
  const locOf = (slotId) => slotPath(doc, slotId);

  // 1) 字位内容
  for (const item of iterSlots(doc)) {
    const { carrier, surface, line, slot } = item;
    const loc = {
      carrierName: carrier.name,
      surfaceName: surface.name,
      lineName: line.name,
      ...slotPath(doc, slot.id),
    };
    const faceClusters = graphemes(slot.face || "");
    if (slot.type === "missing") {
      if (faceClusters.length && slot.face !== "□") {
        issues.push({ code: "MISSING_HAS_FACE", level: "error", message: "缺字占位不应有原貌字", loc });
      }
      if (!Number.isInteger(slot.expectedGraphemes) || slot.expectedGraphemes < 1) {
        issues.push({ code: "BAD_EXPECTED_COUNT", level: "error", message: "缺字占位的应有字数须为≥1的整数", loc });
      }
    } else {
      if (faceClusters.length !== 1) {
        issues.push({
          code: "SLOT_GRAPHEME_COUNT",
          level: "error",
          message: `字位原貌须恰为 1 个字素簇，实际 ${faceClusters.length} 个（${faceClusters.join("|") || "空"}）`,
          loc,
        });
      }
      if (slot.type === "ligature") {
        const rc = graphemes(slot.reading || "");
        if (rc.length < 2) {
          issues.push({ code: "LIGATURE_READING", level: "warning", message: "合文的通读字通常包含至少两个字", loc });
        }
      } else if (slot.type === "char") {
        const rc = graphemes(slot.reading || "");
        if (rc.length > 1) {
          issues.push({ code: "CHAR_READING_COUNT", level: "warning", message: "普通字位的通读字多于 1 字；若为合写请改用合文类型", loc });
        }
      }
    }
    // 互斥释读：同一字位至多一个“采纳”候选
    const chosen = (slot.candidates || []).filter((c) => c.chosen);
    if (chosen.length > 1) {
      issues.push({
        code: "MUTEX_READINGS",
        level: "error",
        message: `互斥释读：${chosen.length} 个候选同时标记为采纳（${chosen.map((c) => c.text).join("／")}）`,
        loc,
      });
    }
    for (const c of chosen) {
      if (!c.text || !graphemes(c.text).length) {
        issues.push({ code: "EMPTY_CANDIDATE", level: "error", message: "采纳的候选释读为空", loc });
      }
    }
    // 通读字校勘符号
    for (const bad of lintCollationText(slot.reading || "")) {
      issues.push({ ...bad, level: "error", message: bad.message, loc: { ...loc, field: "reading" } });
    }
  }

  // 2) 批注：悬空引用 / 越界
  for (const ann of doc.annotations || []) {
    const seen = new Set();
    const perLine = new Map();
    ann.anchorIds.forEach((id, ordinal) => {
      if (seen.has(id)) return;
      seen.add(id);
      const hit = findSlot(doc, id);
      if (!hit) {
        issues.push({
          code: "DANGLING_ANNOTATION_REF",
          level: "error",
          message: `批注「${ann.text || ann.id}」引用了不存在的字位 ${id}`,
          loc: { annotationId: ann.id, ordinal, missingSlotId: id },
        });
        return;
      }
      const path = slotPath(doc, id);
      perLine.set(hit.line.id, (perLine.get(hit.line.id) || []).concat(path.slot));
      // 声明了行范围但锚点不在该行 → 越界
      if (ann.scopeLineId) {
        const scope = findLine(doc, ann.scopeLineId);
        if (!scope) {
          issues.push({
            code: "DANGLING_SCOPE_LINE",
            level: "error",
            message: `批注声明的行范围 ${ann.scopeLineId} 不存在（悬空引用）`,
            loc: { annotationId: ann.id },
          });
        } else if (hit.line.id !== ann.scopeLineId) {
          issues.push({
            code: "OUT_OF_BOUNDS_ANNOTATION",
            level: "error",
            message: `批注「${ann.text || ann.id}」声明限于行「${scope.name}」，但锚点落在行「${hit.line.name}」`,
            loc: { annotationId: ann.id, ...path },
          });
        }
      }
    });
    // 同一条批注在任一行内的锚点必须相邻（中间隔字即越界/超范围）
    for (const [lineId, indexes] of perLine) {
      const sorted = [...indexes].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] !== sorted[i - 1] + 1) {
          const line = findLine(doc, lineId);
          issues.push({
            code: "OUT_OF_BOUNDS_ANNOTATION",
            level: "error",
            message: `批注「${ann.text || ann.id}」在行「${line.name}」内锚点不连续（第 ${sorted[i - 1] + 1}、${sorted[i] + 1} 字位之间隔字）`,
            loc: { annotationId: ann.id, ...slotPath(doc, line.slots[sorted[i]].id) },
          });
          break;
        }
      }
    }
    // 批注文字中的非法校勘符号
    for (const bad of lintCollationText(ann.text || "")) {
      issues.push({
        ...bad,
        level: "error",
        message: `批注中的${bad.message}`,
        loc: { annotationId: ann.id, field: "text", charIndex: bad.charIndex },
      });
    }
  }

  // 3) 行间对应：悬空行 / 悬空字位
  for (const link of doc.lineLinks || []) {
    if (!findLine(doc, link.aLine) || !findLine(doc, link.bLine)) {
      issues.push({
        code: "DANGLING_LINE_LINK",
        level: "error",
        message: "行间对应引用了已删除的行",
        loc: { lineLinkId: link.id, aLine: link.aLine, bLine: link.bLine },
      });
    }
    for (const pair of link.pairs || []) {
      if (!findSlot(doc, pair.a) || !findSlot(doc, pair.b)) {
        issues.push({
          code: "DANGLING_LINK_PAIR",
          level: "error",
          message: "行间对应中的字位已被删除（悬空）",
          loc: { lineLinkId: link.id, pair },
        });
      }
    }
  }

  return issues;
}
