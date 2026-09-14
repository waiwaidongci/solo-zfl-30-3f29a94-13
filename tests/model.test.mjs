import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeDocument, makeCarrier, makeSurface, makeLine, makeSlot, slotsFromText,
  insertSlot, deleteSlot, moveSlot, findSlot, iterSlots, allLines,
} from "../src/core/model.mjs";

function miniDoc() {
  const l1 = makeLine({
    id: "l1", name: "行一",
    slots: [makeSlot({ id: "s1", face: "甲" }), makeSlot({ id: "s2", face: "乙" }), makeSlot({ id: "s3", face: "丙" })],
  });
  const l2 = makeLine({ id: "l2", name: "行二", slots: [makeSlot({ id: "s4", face: "丁" })] });
  const f = makeSurface({ id: "f1", mode: "horizontalLr", lines: [l1, l2] });
  const c = makeCarrier({ id: "c1", surfaces: [f] });
  return makeDocument({ carriers: [c] });
}

test("slotsFromText：每字素簇一位，□成为缺字占位", () => {
  const slots = slotsFromText("ab□");
  assert.equal(slots.length, 3);
  assert.equal(slots[0].face, "a");
  assert.equal(slots[2].type, "missing");
  assert.equal(slots[2].expectedGraphemes, 1);
  // 组合字符只造一个字位
  assert.equal(slotsFromText("éx").length, 2);
});

test("插入不改变既有字位 id", () => {
  const doc = miniDoc();
  insertSlot(doc, { lineId: "l1", index: 1, slot: makeSlot({ id: "s9", face: "子" }) });
  assert.deepEqual(doc.carriers[0].surfaces[0].lines[0].slots.map((s) => s.id), ["s1", "s9", "s2", "s3"]);
  assert.equal(findSlot(doc, "s2").slot.face, "乙");
});

test("删除后批注锚点对象消失（校验器负责报告悬空），其余 id 不动", () => {
  const doc = miniDoc();
  const removed = deleteSlot(doc, "s2");
  assert.equal(removed.id, "s2");
  assert.equal(findSlot(doc, "s2"), null);
  assert.deepEqual(doc.carriers[0].surfaces[0].lines[0].slots.map((s) => s.id), ["s1", "s3"]);
});

test("同行移位：抽出后重插，uid 保持", () => {
  const doc = miniDoc();
  moveSlot(doc, "s3", { lineId: "l1", index: 0 });
  assert.deepEqual(doc.carriers[0].surfaces[0].lines[0].slots.map((s) => s.id), ["s3", "s1", "s2"]);
});

test("跨行移位：字位携带原 uid 到新行，批注锚点跟随", () => {
  const doc = miniDoc();
  moveSlot(doc, "s2", { lineId: "l2", index: 0 });
  assert.equal(findSlot(doc, "s2").line.id, "l2");
  assert.deepEqual(doc.carriers[0].surfaces[0].lines[1].slots.map((s) => s.id), ["s2", "s4"]);
  assert.deepEqual(doc.carriers[0].surfaces[0].lines[0].slots.map((s) => s.id), ["s1", "s3"]);
});

test("iterSlots 覆盖所有字位", () => {
  const doc = miniDoc();
  assert.deepEqual(iterSlots(doc).map((x) => x.slot.id), ["s1", "s2", "s3", "s4"]);
  assert.equal(allLines(doc).length, 2);
});
