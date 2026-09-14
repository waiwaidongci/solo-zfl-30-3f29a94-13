import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDocument, makeCarrier, makeSurface, makeLine, makeSlot } from "../src/core/model.mjs";
import { buildGlyphIndex, searchGlyphIndex } from "../src/core/index.mjs";

function doc() {
  const l = makeLine({
    id: "l1",
    slots: [
      makeSlot({ id: "s1", type: "char", face: "易", reading: "錫" }),
      makeSlot({ id: "s2", type: "ligature", face: "玟", reading: "文王" }),
      makeSlot({ id: "s3", type: "char", face: "王", reading: "王", defect: "残", candidates: [{ text: "玉", chosen: false }] }),
      makeSlot({ id: "s4", type: "missing", expectedGraphemes: 1 }),
    ],
  });
  const f = makeSurface({ mode: "verticalRl", lines: [l] });
  return makeDocument({ carriers: [makeCarrier({ name: "器", surfaces: [f] })] });
}

test("索引收录原貌字、通读字、候选字，并标注出处字位", () => {
  const idx = buildGlyphIndex(doc());
  const wang = idx.byGlyph.get("王");
  assert.equal(wang.length, 3); // 合文通读中的「王」+ s3 原貌 + s3 通读
  assert.ok(wang.some((o) => o.slotId === "s2" && o.field === "reading"));
  assert.ok(wang.some((o) => o.slotId === "s3" && o.field === "face"));
  assert.ok(wang.some((o) => o.slotId === "s3" && o.field === "reading"));
  // 候选字也入索引
  assert.ok(idx.byGlyph.has("玉"));
  // 原貌「易」与通读「錫」分别可查
  assert.ok(idx.byGlyph.has("易"));
  assert.ok(idx.byGlyph.has("錫"));
});

test("缺字占位不以 □ 入索引", () => {
  assert.equal(buildGlyphIndex(doc()).byGlyph.has("□"), false);
});

test("检索：精确命中优先，其次前缀、包含；缺损过滤", () => {
  const idx = buildGlyphIndex(doc());
  const hits = searchGlyphIndex(idx, "王");
  assert.equal(hits[0].glyph, "王");
  const onlyCan = searchGlyphIndex(idx, "玉");
  assert.equal(onlyCan[0].occurrences[0].field, "candidate");
  const residual = searchGlyphIndex(idx, "", { defect: "残" });
  assert.deepEqual(residual.map((e) => e.glyph), ["王", "玉"]); // 候选「玉」同属残字字位
});

test("组合字可作为独立索引键", () => {
  const d = makeDocument({
    carriers: [
      makeCarrier({
        surfaces: [
          makeSurface({
            lines: [
              makeLine({
                slots: [makeSlot({ id: "x1", type: "char", face: "é", reading: "é" })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
  const idx = buildGlyphIndex(d);
  assert.equal(idx.byGlyph.size, 1);
  assert.ok(idx.byGlyph.has("é"));
});
