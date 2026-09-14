// 数据模型：载体 → 版面 → 行 → 字位。
// 关键约定：
//   - 每个字位有终身稳定 id（uid），文字增删/移位后，批注、行间对应仍按 uid 锚定原字符。
//   - 字位文本按字素簇计数与校验（一个字位恰为一个字素簇）。
//   - 序列化只保留数据；DOM 仅由 model 渲染。
import { graphemes } from "./graphemes.mjs";

export const SLOT_TYPES = {
  char: "字",
  ligature: "合文", // 合文：两个以上字素合写为一个字位（外观一位，通读多字）
  missing: "缺字", // 缺字占位：位在而字缺，expectedGraphemes 记应有字数
};

export const WRITING_MODES = {
  horizontalLr: "横排·左至右",
  horizontalRl: "横排·右至左",
  verticalRl: "竖排·右至左",
  verticalLr: "竖排·左至右",
};

let counter = 0;
export function uid(prefix = "u") {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}
// 测试可重置 id 序列，保证断言稳定。
export function resetUidCounter() {
  counter = 0;
}

export function makeSlot(partial = {}) {
  const type = partial.type || "char";
  return {
    id: partial.id || uid("s"),
    type,
    face: partial.face ?? "", // 原貌字（一个字素簇；缺字可空）
    reading: partial.reading ?? "", // 通读字/释文（合文可多字素）
    expectedGraphemes: partial.expectedGraphemes ?? (type === "missing" ? 1 : null),
    defect: partial.defect ?? "", // 缺损：完好|残|泐|蚀|漫漶|空
    candidates: partial.candidates ?? [], // 候选释读 [{text, note, confidence}]
    note: partial.note ?? "",
  };
}

export function makeLine(partial = {}) {
  return {
    id: partial.id || uid("l"),
    name: partial.name ?? "",
    direction: partial.direction || "", // 行内方向覆盖，空则随版面
    slots: partial.slots ?? [],
  };
}

export function makeSurface(partial = {}) {
  return {
    id: partial.id || uid("f"),
    name: partial.name ?? "版面",
    mode: partial.mode || "verticalRl",
    lines: partial.lines ?? [],
  };
}

export function makeCarrier(partial = {}) {
  return {
    id: partial.id || uid("c"),
    name: partial.name ?? "载体",
    kind: partial.kind ?? "", // 青铜|石碑|简牍|陶片|……
    surfaces: partial.surfaces ?? [],
  };
}

export function makeDocument(partial = {}) {
  return { version: 1, carriers: partial.carriers ?? [] };
}

// 由一行“原貌串”快速造字位：每个字素簇一个 char 字位；□ 直接成为缺字占位。
export function slotsFromText(text, opts = {}) {
  const slots = [];
  for (const cluster of graphemes(text)) {
    if (cluster === "□" || cluster === "〼") {
      slots.push(makeSlot({ type: "missing", expectedGraphemes: opts.missingCount ?? 1, defect: "缺" }));
    } else {
      slots.push(
        makeSlot({
          face: cluster,
          reading: opts.readings ? cluster : "",
          defect: opts.defect || "",
        })
      );
    }
  }
  return slots;
}

/* ---------- 结构遍历 ---------- */

export function iterSlots(doc) {
  const out = [];
  for (const carrier of doc.carriers || []) {
    for (const surface of carrier.surfaces || []) {
      for (const line of surface.lines || []) {
        for (const slot of line.slots || []) {
          out.push({ carrier, surface, line, slot });
        }
      }
    }
  }
  return out;
}

export function findSlot(doc, slotId) {
  return iterSlots(doc).find((x) => x.slot.id === slotId) || null;
}

export function slotPath(doc, slotId) {
  const hit = findSlot(doc, slotId);
  if (!hit) return null;
  const ci = doc.carriers.indexOf(hit.carrier);
  const fi = hit.carrier.surfaces.indexOf(hit.surface);
  const li = hit.surface.lines.indexOf(hit.line);
  const si = hit.line.slots.indexOf(hit.slot);
  return { carrier: ci, surface: fi, line: li, slot: si };
}

/* ---------- 增删移位（保留 uid，锚定随之移动） ---------- */

export function insertSlot(doc, { lineId, index, slot }) {
  const line = findLine(doc, lineId);
  const s = slot && slot.id ? slot : makeSlot(slot || {});
  line.slots.splice(index, 0, s);
  return s;
}

export function deleteSlot(doc, slotId) {
  const hit = findSlot(doc, slotId);
  if (!hit) return null;
  const [removed] = hit.line.slots.splice(hit.line.slots.indexOf(hit.slot), 1);
  return removed;
}

// 移动到同/跨行的 index 之前；index 省略表示行尾。源位置与目标同处一行时按“抽出后重插”计算。
export function moveSlot(doc, slotId, { lineId, index } = {}) {
  const src = findSlot(doc, slotId);
  if (!src) return false;
  const dst = findLine(doc, lineId);
  if (!dst) return false;
  const [slot] = src.line.slots.splice(src.line.slots.indexOf(src.slot), 1);
  const to = index == null ? dst.slots.length : Math.max(0, Math.min(index, dst.slots.length));
  dst.slots.splice(to, 0, slot);
  return true;
}

export function findLine(doc, lineId) {
  for (const c of doc.carriers || []) {
    for (const f of c.surfaces || []) {
      const l = (f.lines || []).find((x) => x.id === lineId);
      if (l) return l;
    }
  }
  return null;
}

export function allLines(doc) {
  const out = [];
  for (const c of doc.carriers || []) {
    for (const f of c.surfaces || []) {
      for (const l of f.lines || []) out.push({ carrier: c, surface: f, line: l });
    }
  }
  return out;
}
