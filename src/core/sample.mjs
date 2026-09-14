// 示例工作区：一份竖排右至左的青铜簋铭文（含合文、缺字、缺损、候选释读、跨字/跨行批注、行间对应），
// 另附两份横排抄本用于逐字校勘。id 固定，便于测试引用。
import { makeCarrier, makeSurface, makeLine, makeSlot, makeDocument } from "./model.mjs";
import { makeAnnotation, makeLineLink } from "./annotations.mjs";

function char(id, face, extra = {}) {
  return makeSlot({ id, type: "char", face, reading: face, ...extra });
}

function bronzeDoc() {
  const l1 = makeLine({
    id: "bronze-l1",
    name: "第一列（右）",
    slots: [
      char("b1", "隹", { reading: "惟" }),
      makeSlot({ id: "b2", type: "ligature", face: "玟", reading: "文王", note: "合文" }),
      char("b3", "才", {
        reading: "在",
        candidates: [
          { text: "在", note: "通假", confidence: 0.8, chosen: true },
          { text: "哉", note: "或释", confidence: 0.2 },
        ],
      }),
      makeSlot({ id: "b4", type: "missing", expectedGraphemes: 1, defect: "泐", face: "" }),
      char("b5", "宗"),
    ],
  });
  const l2 = makeLine({
    id: "bronze-l2",
    name: "第二列（中）",
    slots: [
      char("b6", "周"),
      char("b7", "王"),
      char("b8", "易", { reading: "锡", note: "赐" }),
      char("b9", "貝", { defect: "残", candidates: [{ text: "貝", chosen: true }] }),
      char("b10", "朋", { defect: "残" }),
    ],
  });
  const l3 = makeLine({
    id: "bronze-l3",
    name: "第三列（左）",
    slots: [char("b11", "用"), char("b12", "乍", { reading: "作" }), char("b13", "寶"), char("b14", "彝")],
  });
  const surface = makeSurface({ id: "bronze-f1", name: "腹内铭文", mode: "verticalRl", lines: [l1, l2, l3] });
  const carrier = makeCarrier({ id: "bronze-c1", name: "□叔簋", kind: "青铜", surfaces: [surface] });
  const doc = makeDocument({ carriers: [carrier] });
  doc.annotations = [
    makeAnnotation({
      id: "ann-cross-char",
      kind: "question",
      anchorIds: ["b3", "b4"],
      scopeLineId: "bronze-l1",
      text: "「才」与下缺字连读，疑为「在宗」，缺字泐尽不可辨。",
    }),
    makeAnnotation({
      id: "ann-cross-line",
      kind: "note",
      anchorIds: ["b6", "b11"],
      text: "自「周」至「用」跨列对读，记册命与作器之事。（参 M12 号拓本）",
    }),
  ];
  doc.lineLinks = [
    makeLineLink({ id: "ll-1", aLine: "bronze-l2", bLine: "bronze-l3", note: "锡贝 → 作器", pairs: [{ a: "b8", b: "b12" }] }),
  ];
  return doc;
}

function manuscript(id, name, text, mode = "horizontalLr") {
  const slots = [...text].map((ch, i) =>
    makeSlot({ id: `${id}-s${i + 1}`, type: ch === "□" ? "missing" : "char", face: ch === "□" ? "" : ch, reading: ch === "□" ? "" : ch, defect: ch === "□" ? "缺" : "" })
  );
  const line = makeLine({ id: `${id}-l1`, name: "第一行", slots });
  const surface = makeSurface({ id: `${id}-f1`, name: "抄本面", mode, lines: [line] });
  const carrier = makeCarrier({ id: `${id}-c1`, name, kind: "抄本", surfaces: [surface] });
  return makeDocument({ carriers: [carrier] });
}

export function buildSampleWorkspace() {
  return {
    version: 1,
    docs: [
      { id: "doc-bronze", name: "《□叔簋》器铭", doc: bronzeDoc() },
      { id: "doc-jia", name: "抄本甲", doc: manuscript("jia", "抄本甲", "隹王元年春正月吉日") },
      { id: "doc-yi", name: "抄本乙", doc: manuscript("yi", "抄本乙", "隹王二祀春二月吉") },
    ],
  };
}
