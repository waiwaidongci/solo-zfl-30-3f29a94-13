import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDocument, makeCarrier, makeSurface, makeLine, makeSlot } from "../src/core/model.mjs";
import { collate, tokenize } from "../src/core/collation.mjs";

function oneLineDoc(id, chars, mode = "horizontalLr") {
  const slots = chars.map((ch, i) =>
    makeSlot({ id: `${id}-${i}`, type: "char", face: ch, reading: ch })
  );
  const line = makeLine({ id: `${id}-l`, name: "行", slots });
  const surface = makeSurface({ id: `${id}-f`, name: "面", mode, lines: [line] });
  const carrier = makeCarrier({ id: `${id}-c`, name: id, surfaces: [surface] });
  return makeDocument({ carriers: [carrier] });
}

test("完全相同：全部 same", () => {
  const r = collate(oneLineDoc("a", "甲乙丙".split("")), oneLineDoc("b", "甲乙丙".split("")));
  assert.equal(r.summary.same, 3);
  assert.deepEqual(r.summary, { same: 3, replace: 0, insert: 0, delete: 0 });
});

test("替换：同位置异字识别为 replace 而非增+脱", () => {
  const r = collate(oneLineDoc("a", "甲乙丙".split("")), oneLineDoc("b", "甲丁丙".split("")));
  assert.equal(r.summary.replace, 1);
  const rep = r.rows.find((x) => x.status === "replace");
  assert.equal(rep.a.text, "乙");
  assert.equal(rep.b.text, "丁");
});

test("增补：B 多出的字为 insert", () => {
  const r = collate(oneLineDoc("a", "甲乙".split("")), oneLineDoc("b", "甲卯乙".split("")));
  assert.equal(r.summary.insert, 1);
  assert.equal(r.rows.find((x) => x.status === "insert").b.text, "卯");
});

test("脱文：A 有 B 无为 delete，且行定位随行", () => {
  const r = collate(oneLineDoc("a", "甲乙丙".split("")), oneLineDoc("b", "甲丙".split("")));
  assert.equal(r.summary.delete, 1);
  assert.equal(r.rows.find((x) => x.status === "delete").a.text, "乙");
});

test("混合：相同+两处替换，差异分成两个块", () => {
  const r = collate(oneLineDoc("a", ["甲", "乙", "丙", "丁"]), oneLineDoc("b", ["甲", "戊", "丙", "己"]));
  assert.equal(r.summary.same, 2);
  assert.equal(r.summary.replace, 2);
  assert.deepEqual(r.rows.filter((x) => x.status === "replace").map((x) => [x.a.text, x.b.text]), [["乙", "戊"], ["丁", "己"]]);
  assert.equal(r.blocks.length, 2);
});

test("不等长时余字分别落为脱文与增补", () => {
  const r = collate(oneLineDoc("a", ["甲", "乙", "丙"]), oneLineDoc("b", ["甲", "丁", "戊", "丙"]));
  assert.equal(r.summary.replace, 1); // 乙↔丁
  assert.equal(r.summary.insert, 1); // 戊
});

test("缺字占位展开为 □ token，可与他本实字校出脱/替", () => {
  const a = oneLineDoc("a", ["甲", "乙"]);
  const b = oneLineDoc("a", ["甲", "乙"]);
  b.carriers[0].surfaces[0].lines[0].slots[1] = makeSlot({ id: "m1", type: "missing", expectedGraphemes: 1 });
  const r = collate(a, b);
  assert.equal(r.rows.find((x) => x.status === "replace").b.text, "□");
});

test("组合字按字素簇对齐，不被拆成码元", () => {
  const r = collate(oneLineDoc("a", ["a", "é"]), oneLineDoc("b", ["a", "é"]));
  assert.equal(r.lengthA, 2);
  assert.equal(r.summary.same, 2);
});

test("竖排右至左：数组顺序即阅读顺序（右列最先录入），几何反转归 CSS", () => {
  const doc = makeDocument({
    carriers: [
      makeCarrier({
        surfaces: [
          makeSurface({
            mode: "verticalRl",
            lines: [
              makeLine({ id: "L", name: "右列", slots: [makeSlot({ face: "a", reading: "a" })] }),
              makeLine({ id: "M", name: "中列", slots: [makeSlot({ face: "b", reading: "b" })] }),
              makeLine({ id: "R", name: "左列", slots: [makeSlot({ face: "c", reading: "c" })] }),
            ],
          }),
        ],
      }),
    ],
  });
  assert.deepEqual(tokenize(doc).map((t) => t.text), ["a", "b", "c"]);
  assert.deepEqual(tokenize(doc).map((t) => t.line), ["右列", "中列", "左列"]);
});

test("横排右至左：同样按数组（阅读）顺序校勘", () => {
  const doc = makeDocument({
    carriers: [
      makeCarrier({
        surfaces: [
          makeSurface({
            mode: "horizontalRl",
            lines: [makeLine({ id: "l", slots: [makeSlot({ face: "a", reading: "a" }), makeSlot({ face: "b", reading: "b" })] })],
          }),
        ],
      }),
    ],
  });
  assert.deepEqual(tokenize(doc).map((t) => t.text), ["a", "b"]);
});

test("首选释读：采纳候选优先于通读字", () => {
  const doc = oneLineDoc("a", ["甲"]);
  doc.carriers[0].surfaces[0].lines[0].slots[0].reading = "假";
  doc.carriers[0].surfaces[0].lines[0].slots[0].candidates = [{ text: "嘉", chosen: true }];
  assert.deepEqual(tokenize(doc).map((t) => t.text), ["嘉"]);
});
