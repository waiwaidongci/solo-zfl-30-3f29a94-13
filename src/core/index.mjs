// 可检索字形索引：以字素簇为键，汇总原貌字 / 通读字 / 候选释读中的每一次出现。
import { iterSlots, slotPath } from "./model.mjs";
import { graphemes } from "./graphemes.mjs";

export function buildGlyphIndex(doc) {
  const map = new Map(); // glyph -> occurrence[]

  const add = (glyph, occ) => {
    if (!map.has(glyph)) map.set(glyph, []);
    map.get(glyph).push(occ);
  };

  for (const item of iterSlots(doc)) {
    const { carrier, surface, line, slot } = item;
    const path = slotPath(doc, slot.id);
    const base = {
      slotId: slot.id,
      lineId: line.id,
      carrier: carrier.name,
      surface: surface.name,
      line: line.name,
      slotIndex: path.slot,
      slotType: slot.type,
      defect: slot.defect || "",
    };
    if (slot.type !== "missing") {
      for (const glyph of graphemes(slot.face || "")) add(glyph, { ...base, field: "face" });
      for (const glyph of graphemes(slot.reading || "")) add(glyph, { ...base, field: "reading" });
      for (const cand of slot.candidates || []) {
        for (const glyph of graphemes(cand.text || "")) {
          add(glyph, { ...base, field: "candidate", chosen: !!cand.chosen });
        }
      }
    }
  }

  const entries = [...map.entries()]
    .map(([glyph, occurrences]) => ({
      glyph,
      count: occurrences.length,
      occurrences,
    }))
    .sort((a, b) => b.count - a.count || (a.glyph < b.glyph ? -1 : a.glyph > b.glyph ? 1 : 0));

  return { entries, byGlyph: map };
}

// 检索：精确字 > 前缀 > 包含（均按字素簇），可选缺损过滤。
export function searchGlyphIndex(index, query, { defect = "" } = {}) {
  const q = graphemes(query || "");
  if (!q.length) return filterDefect(index.entries, defect);
  const exact = [];
  const prefix = [];
  const contains = [];
  for (const entry of index.entries) {
    const key = graphemes(entry.glyph);
    let match = false;
    if (q.length === 1) {
      if (entry.glyph === q[0]) exact.push(entry), (match = true);
      else if (key[0] === q[0]) prefix.push(entry), (match = true);
      else if (key.includes(q[0])) contains.push(entry), (match = true);
    } else {
      if (entry.glyph === query) exact.push(entry), (match = true);
      else if (entry.glyph.startsWith(query)) prefix.push(entry), (match = true);
      else if (entry.glyph.includes(query)) contains.push(entry), (match = true);
    }
    void match;
  }
  return filterDefect([...exact, ...prefix, ...contains], defect);
}

function filterDefect(entries, defect) {
  if (!defect) return entries;
  return entries
    .map((e) => ({ ...e, occurrences: e.occurrences.filter((o) => o.defect === defect) }))
    .filter((e) => e.occurrences.length)
    .map((e) => ({ ...e, count: e.occurrences.length }));
}
