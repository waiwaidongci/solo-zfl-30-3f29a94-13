import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDocument, makeCarrier, makeSurface, makeLine, makeSlot, moveSlot, deleteSlot } from "../src/core/model.mjs";
import { makeAnnotation, makeLineLink, validateDocument, lintCollationText } from "../src/core/annotations.mjs";

function docWith() {
  const l1 = makeLine({
    id: "l1", name: "行一",
    slots: [
      makeSlot({ id: "s1", type: "char", face: "甲", reading: "甲" }),
      makeSlot({ id: "s2", type: "char", face: "乙", reading: "乙" }),
      makeSlot({ id: "s3", type: "char", face: "丙", reading: "丙" }),
    ],
  });
  const l2 = makeLine({ id: "l2", name: "行二", slots: [makeSlot({ id: "s4", type: "char", face: "丁", reading: "丁" })] });
  const f = makeSurface({ id: "f1", mode: "horizontalLr", lines: [l1, l2] });
  const c = makeCarrier({ id: "c1", surfaces: [f] });
  const doc = makeDocument({ carriers: [c] });
  doc.annotations = [];
  doc.lineLinks = [];
  return doc;
}
const codes = (issues) => issues.map((i) => i.code);

test("干净文档无错误", () => {
  assert.deepEqual(validateDocument(docWith()), []);
});

test("字位原貌须恰为 1 个字素簇（组合字符算 1，双字报错）", () => {
  const doc = docWith();
  findMutate(doc, "s1").face = "é"; // e+U+0301：一个字素簇
  findMutate(doc, "s2").face = "兩字";
  const issues = validateDocument(doc);
  assert.equal(issues.some((i) => i.code === "SLOT_GRAPHEME_COUNT" && i.loc.slot === 0), false);
  const bad = issues.find((i) => i.code === "SLOT_GRAPHEME_COUNT");
  assert.equal(bad.loc.slot, 1);
  assert.match(bad.message, /实际 2 个/);
});

test("互斥释读：两个采纳候选被定位到字位", () => {
  const doc = docWith();
  findMutate(doc, "s1").candidates = [
    { text: "X", chosen: true },
    { text: "Y", chosen: true },
  ];
  const issues = validateDocument(doc);
  assert.equal(issues.filter((i) => i.code === "MUTEX_READINGS").length, 1);
  assert.equal(issues[0].loc.slot, 0);
});

test("悬空批注：引用不存在或已删除字位须逐项报告 missingSlotId 与序号", () => {
  const doc = docWith();
  doc.annotations.push(makeAnnotation({ id: "a0", anchorIds: ["ghost"], text: "幽灵" }));
  doc.annotations.push(makeAnnotation({ id: "a1", anchorIds: ["s1", "s2"], text: "批" }));
  let issues = validateDocument(doc);
  assert.deepEqual(issues.filter((i) => i.code === "DANGLING_ANNOTATION_REF").map((i) => i.loc.missingSlotId), ["ghost"]);
  deleteSlot(doc, "s1");
  issues = validateDocument(doc);
  const dangling = issues.filter((i) => i.code === "DANGLING_ANNOTATION_REF");
  assert.deepEqual(dangling.map((d) => d.loc.missingSlotId).sort(), ["ghost", "s1"]);
  const onA1 = dangling.find((d) => d.loc.annotationId === "a1");
  assert.equal(onA1.loc.ordinal, 0);
});

test("越界批注：锚点跨行却声明行范围，以及行内锚点不连续", () => {
  const doc = docWith();
  doc.annotations.push(makeAnnotation({ id: "a1", anchorIds: ["s1", "s4"], scopeLineId: "l1", text: "跨" }));
  doc.annotations.push(makeAnnotation({ id: "a2", anchorIds: ["s1", "s3"], scopeLineId: "l1", text: "跳字" }));
  const issues = validateDocument(doc);
  assert.ok(issues.some((i) => i.code === "OUT_OF_BOUNDS_ANNOTATION" && i.loc.annotationId === "a1"));
  assert.ok(issues.some((i) => i.code === "OUT_OF_BOUNDS_ANNOTATION" && i.loc.annotationId === "a2"));
});

test("锚点随移位保持有效（移入他行后原批注不再悬空）", () => {
  const doc = docWith();
  doc.annotations.push(makeAnnotation({ id: "a1", anchorIds: ["s2"], text: "随字移动" }));
  moveSlot(doc, "s2", { lineId: "l2", index: 0 });
  assert.deepEqual(validateDocument(doc), []);
});

test("行间对应：删行后悬空；字位对悬空逐对报告", () => {
  const doc = docWith();
  doc.lineLinks.push(makeLineLink({ id: "ll1", aLine: "l1", bLine: "ghost", pairs: [] }));
  doc.lineLinks.push(makeLineLink({ id: "ll2", aLine: "l1", bLine: "l2", pairs: [{ a: "s1", b: "ghost-s" }] }));
  const issues = validateDocument(doc);
  assert.ok(codes(issues).includes("DANGLING_LINE_LINK"));
  assert.ok(codes(issues).includes("DANGLING_LINK_PAIR"));
});

test("缺字占位规则：空 face 合法、有字报错、应有字数非法报错", () => {
  const doc = docWith();
  const m = makeSlot({ id: "m1", type: "missing", expectedGraphemes: 1 });
  doc.carriers[0].surfaces[0].lines[0].slots.push(m);
  assert.deepEqual(validateDocument(doc), []);
  m.face = "誤";
  let issues = validateDocument(doc);
  assert.ok(codes(issues).includes("MISSING_HAS_FACE"));
  m.face = "";
  m.expectedGraphemes = 0;
  issues = validateDocument(doc);
  assert.ok(codes(issues).includes("BAD_EXPECTED_COUNT"));
});

test("非法校勘符号逐项定位；合法成对符号与空括号报告", () => {
  assert.deepEqual(lintCollationText("甲】乙").map((i) => i.code), ["ILLEGAL_COLLATION_MARK"]);
  assert.equal(lintCollationText("甲】乙")[0].charIndex, 1);
  const empty = lintCollationText("〔〕");
  assert.deepEqual(empty.map((i) => i.code), ["EMPTY_COLLATION_MARK"]);
  const unbal = lintCollationText("〔甲");
  assert.deepEqual(unbal.map((i) => i.code), ["UNBALANCED_COLLATION_MARK"]);
  assert.equal(lintCollationText("〔甲〕（乙）〈丙〉□○").length, 0);
  const nested = lintCollationText("〔甲（乙）〕");
  assert.ok(nested.some((i) => i.code === "NESTED_COLLATION_MARK"));
  const stray = lintCollationText("甲〕");
  assert.ok(stray.some((i) => i.code === "UNBALANCED_COLLATION_MARK"));
  // 中文引号、书名号是普通标点，不报非法
  assert.equal(lintCollationText("「参」《拓本》").length, 0);
  // charIndex 是字素簇序号：组合字不串位
  const located = lintCollationText("e\u{301}】");
  assert.equal(located[0].charIndex, 1);
});

test("合文通读不足两字给出警告；普通字位通读多字提示", () => {
  const doc = docWith();
  findMutate(doc, "s1").type = "ligature";
  findMutate(doc, "s1").reading = "一";
  findMutate(doc, "s2").reading = "兩字";
  const issues = validateDocument(doc);
  assert.ok(issues.some((i) => i.code === "LIGATURE_READING"));
  assert.ok(issues.some((i) => i.code === "CHAR_READING_COUNT"));
});

function findMutate(doc, id) {
  return doc.carriers[0].surfaces[0].lines.flatMap((l) => l.slots).find((s) => s.id === id);
}
