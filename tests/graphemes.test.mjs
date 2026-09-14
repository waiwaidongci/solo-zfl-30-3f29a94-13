import { test } from "node:test";
import assert from "node:assert/strict";
import { graphemes, graphemeCount, graphemeSpans } from "../src/core/graphemes.mjs";

test("ASCII 与汉字按字素簇计 1", () => {
  assert.deepEqual(graphemes("abc字"), ["a", "b", "c", "字"]);
  assert.equal(graphemeCount(""), 0);
});

test("组合字符：基本字母 + 组合重音是一个字素簇", () => {
  const s = "e\u{301}"; // e + U+0301
  assert.equal(graphemeCount(s), 1);
  assert.deepEqual(graphemes(s), [s]);
  // 基本字母 + 两个组合记号也只占一个字位
  assert.equal(graphemeCount("o\u{323}\u{302}"), 1);
});

test("ZWJ emoji 序列与 Variation Selector 为一个字素簇", () => {
  const family = "\u{1F468}‍\u{1F469}‍\u{1F467}"; // man ZWJ woman ZWJ girl
  assert.equal(graphemeCount(family), 1);
  assert.equal(graphemeCount("𠂤\u{E0100}"), 1); // 異體字選擇符
});

test("代理对单字（U+23A98）不被拆成两个码元", () => {
  const s = "\u{23A98}";
  assert.equal(graphemeCount(s), 1);
  assert.equal(s.length, 2, "对照：UTF-16 码元长度确为 2");
  assert.equal([...s].length, 1, "对照：码点数为 1");
});

test("谚文音节按一个字素簇计（含初声中声终声）", () => {
  assert.equal(graphemeCount("한"), 1); // L+V+T
  assert.equal(graphemeCount("하"), 1); // L+V
  // 预组与 NFD 分解都算一个字素簇
  assert.equal(graphemeCount("한".normalize("NFD")), 1);
});

test("graphemeSpans 返回码元偏移", () => {
  const spans = graphemeSpans("ae\u{301}\u{23A98}");
  assert.equal(spans.length, 3);
  assert.equal(spans[1].cluster, "e\u{301}");
  assert.equal(spans[1].end, 3);
  assert.equal(spans[2].start, 3); // a + e + U+0301 之后（码元偏移）
});
