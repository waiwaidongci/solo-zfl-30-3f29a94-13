// 两份抄本逐字校勘。
// 约定：lines / slots 的数组顺序即阅读顺序（竖排右至左时，录入者仍从右列第一列开始依次录入；
// 几何上的右至左完全由 CSS 的 row-reverse / direction:rtl 负责），故对齐直接按数组顺序进行。
// 再做字素簇级 Myers(LCS) 对齐，输出 相同 / 替换 / 增补（B 有 A 无）/ 脱文（B 无 A 有）。

// 字位首选释读文本：采纳候选 > 通读字 > 原貌字。
export function slotPreferredText(slot) {
  const chosen = (slot.candidates || []).find((c) => c.chosen);
  if (chosen && chosen.text) return chosen.text;
  if (slot.reading) return slot.reading;
  return slot.face || "";
}

import { graphemes } from "./graphemes.mjs";

// 将抄本展平为字素 token 序列。
// field: "reading"（默认，按首选释读）| "face"（只比原貌）
export function tokenize(doc, { field = "reading" } = {}) {
  const tokens = [];
  for (const carrier of doc.carriers || []) {
    for (const surface of carrier.surfaces || []) {
      for (const line of surface.lines || []) {
        line.slots.forEach((slot, si) => {
          if (slot.type === "missing") {
            const n = Math.max(1, Number(slot.expectedGraphemes) || 1);
            for (let k = 0; k < n; k++) {
              tokens.push({ text: "□", missing: true, slotId: slot.id, lineId: line.id, carrier: carrier.name, surface: surface.name, line: line.name, slotIndex: si });
            }
            return;
          }
          const raw = field === "face" ? slot.face || "" : slotPreferredText(slot);
          for (const cluster of graphemes(raw)) {
            tokens.push({ text: cluster, missing: false, slotId: slot.id, lineId: line.id, carrier: carrier.name, surface: surface.name, line: line.name, slotIndex: si });
          }
        });
      }
    }
  }
  return tokens;
}

function lcsTable(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i].text === b[j].text ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  return dp;
}

// 回溯得到 same/delete/insert 原始操作。
// 平局时用前看启发式消歧：若 a[i] 还会在乙后段出现而 b[j] 不会在甲后段出现，则取 insert（保留 a[i] 待后配），
// 反之取 delete；这样「乙段中插入整段」会判为增补，而不是把后字错配成替换。
function backtrack(a, b, dp) {
  const lastInB = new Map();
  const lastInA = new Map();
  for (let k = 0; k < b.length; k++) lastInB.set(b[k].text, k);
  for (let k = 0; k < a.length; k++) lastInA.set(a[k].text, k);

  const ops = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i].text === b[j].text) {
      ops.push({ status: "same", a: a[i++], b: b[j++] });
    } else {
      const goDelete = dp[i + 1][j];
      const goInsert = dp[i][j + 1];
      let pick;
      if (goDelete > goInsert) pick = "delete";
      else if (goInsert > goDelete) pick = "insert";
      else {
        const aLater = (lastInB.get(a[i].text) ?? -1) >= j + 1;
        const bLater = (lastInA.get(b[j].text) ?? -1) >= i + 1;
        pick = aLater && !bLater ? "insert" : bLater && !aLater ? "delete" : "delete";
      }
      if (pick === "delete") ops.push({ status: "delete", a: a[i++], b: null });
      else ops.push({ status: "insert", a: null, b: b[j++] });
    }
  }
  while (i < a.length) ops.push({ status: "delete", a: a[i++], b: null });
  while (j < b.length) ops.push({ status: "insert", a: null, b: b[j++] });
  return ops;
}

// 相邻 脱文+增补 合并为“替换”（按位置就近配对，余者单列）。
function pairReplacements(ops) {
  const rows = [];
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].status === "delete") {
      const dels = [];
      while (i < ops.length && ops[i].status === "delete") dels.push(ops[i++]);
      const inss = [];
      while (i < ops.length && ops[i].status === "insert") inss.push(ops[i++]);
      i--;
      const pairs = Math.max(dels.length, inss.length);
      for (let k = 0; k < pairs; k++) {
        if (dels[k] && inss[k]) rows.push({ status: "replace", a: dels[k].a, b: inss[k].b });
        else if (dels[k]) rows.push({ status: "delete", a: dels[k].a, b: null });
        else rows.push({ status: "insert", a: null, b: inss[k].b });
      }
    } else if (ops[i].status === "insert") {
      // 前无脱文的增补整段保留
      rows.push(ops[i]);
    } else {
      rows.push(ops[i]);
    }
  }
  return rows;
}

export function collate(docA, docB, opts = {}) {
  const a = tokenize(docA, opts);
  const b = tokenize(docB, opts);
  const dp = lcsTable(a, b);
  const rows = pairReplacements(backtrack(a, b, dp));
  const summary = { same: 0, replace: 0, insert: 0, delete: 0 };
  for (const row of rows) summary[row.status]++;
  // 分块（连续非相同为一个差异块），便于报告与跳转
  const blocks = [];
  rows.forEach((row, index) => {
    if (row.status === "same") return;
    const last = blocks[blocks.length - 1];
    if (last && last.end === index - 1) last.end = index;
    else blocks.push({ start: index, end: index });
  });
  return { rows, summary, blocks, lengthA: a.length, lengthB: b.length };
}
