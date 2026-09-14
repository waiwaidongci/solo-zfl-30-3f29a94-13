// 字位检视器：原貌字（限 1 字素簇）、通读字、缺损、类型、合文、候选释读（互斥采纳）。
import { state, emit, removeSelectedSlot, moveSelected } from "../state.mjs";
import { graphemeCount } from "../../core/graphemes.mjs";
import { allLines } from "../../core/model.mjs";

function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) if (child) node.appendChild(child);
  return node;
}

function field(labelText, input) {
  return h("div", { class: "field" }, [h("label", { text: labelText }), input]);
}

export function renderInspector(root) {
  root.innerHTML = "";
  const doc = state.workspace.docs.find((d) => d.id === state.docId).doc;
  const hit = state.selectedSlotId
    ? allLines(doc).flatMap(({ line }) => line.slots.map((slot, index) => ({ slot, line, index }))).find((x) => x.slot.id === state.selectedSlotId)
    : null;

  if (!hit) {
    root.appendChild(h("p", { class: "muted", text: "点击转录区的字位进行编辑；＋ 在行中插入新字位，字位可拖拽移位。" }));
    root.appendChild(h("div", { class: "card", html: "录入约定：<ul><li>每个字位只容一个 <b>Unicode 字素簇</b>（组合字符、谚文、代理对单字都算一位）。</li><li>合文一位多字，通读字写全。</li><li>缺字用缺字占位并标注应有字数。</li><li>删除字位后，引用它的批注会在「校验」中报悬空。</li></ul>" }));
    return;
  }
  const { slot, line, index } = hit;

  const faceInput = h("input", {
    type: "text", value: slot.face, "data-testid": "faceInput",
    oninput: (e) => { slot.face = e.target.value; updateFaceHint(e.target); emit("inspect"); },
  });
  const faceHint = h("div", { class: "muted", style: "margin-top:3px", "data-testid": "faceHint" });
  function updateFaceHint(node) {
    const n = graphemeCount(node.value);
    faceHint.textContent = node.value === "" ? "空" : `字素簇数：${n}${n === 1 ? " ✓" : "（须恰为 1）"}`;
    faceHint.className = n === 1 || node.value === "" ? "muted" : "error-text";
  }
  updateFaceHint(faceInput);

  root.appendChild(h("h3", { text: "字位检视器" }));
  const TYPE_LABELS = { char: "普通字", ligature: "合文", missing: "缺字占位" };
  const typeSelect = h("select", {
    "data-testid": "typeSelect",
    onchange: (e) => { slot.type = e.target.value; emit("inspect"); },
  }, ["char", "ligature", "missing"].map((t) =>
    h("option", { value: t, text: TYPE_LABELS[t], ...(slot.type === t ? { selected: "selected" } : {}) })));
  root.appendChild(field("类型", typeSelect));

  root.appendChild(field("原貌字（一位＝一字素簇）", faceInput));
  root.appendChild(faceHint);

  if (slot.type === "missing") {
    root.appendChild(field("应有字数（字素簇）", h("input", {
      type: "number", min: "1", step: "1", value: slot.expectedGraphemes ?? 1,
      "data-testid": "expectedInput",
      oninput: (e) => { slot.expectedGraphemes = Number(e.target.value); emit("inspect"); },
    })));
  } else {
    root.appendChild(field("通读字 / 释文（可含〔〕（）〈〉）", h("textarea", {
      text: slot.reading, "data-testid": "readingInput",
      oninput: (e) => { slot.reading = e.target.value; emit("inspect"); },
    })));
  }

  root.appendChild(h("div", { class: "row2" }, [
    field("缺损", h("select", {
      "data-testid": "defectSelect",
      onchange: (e) => { slot.defect = e.target.value; emit("inspect"); },
    }, ["", "残", "泐", "蚀", "漫漶"].map((d) => h("option", { value: d, text: d || "完好", ...(slot.defect === d ? { selected: "selected" } : {}) })))),
    field("所在行内位置", h("input", { type: "text", value: `${line.name} · 第 ${index + 1} 位`, disabled: "disabled" })),
  ]));

  root.appendChild(field("字位备注", h("textarea", {
    text: slot.note,
    oninput: (e) => { slot.note = e.target.value; emit("inspect"); },
  })));

  // 候选释读
  root.appendChild(h("h4", { text: "候选释读（至多一个采纳，互斥）" }));
  const candList = h("div", { "data-testid": "candidateList" });
  slot.candidates = slot.candidates || [];
  slot.candidates.forEach((cand, ci) => {
    const row = h("div", { class: "cand-row card" });
    const txt = h("input", {
      type: "text", placeholder: "候选字", value: cand.text,
      oninput: (e) => { cand.text = e.target.value; emit("inspect"); },
    });
    const chosen = h("input", {
      type: "radio", name: "chosen-candidate", title: "采纳（互斥）",
      ...(cand.chosen ? { checked: "checked" } : {}),
      onchange: () => { slot.candidates.forEach((c, j) => (c.chosen = j === ci)); emit("inspect"); },
    });
    const del = h("button", { class: "btn mini danger", text: "删", onclick: () => { slot.candidates.splice(ci, 1); emit("inspect"); } });
    const conf = h("input", {
      type: "number", min: "0", max: "1", step: "0.05", value: cand.confidence ?? "", placeholder: "把握",
      style: "width:70px",
      oninput: (e) => { cand.confidence = e.target.value === "" ? undefined : Number(e.target.value); },
    });
    row.append(chosen, txt, conf, del);
    candList.appendChild(row);
  });
  candList.appendChild(h("button", {
    class: "btn mini", text: "＋ 添加候选", "data-testid": "addCandidate",
    onclick: () => { slot.candidates.push({ text: "", note: "", confidence: undefined, chosen: false }); emit("inspect"); },
  }));
  root.appendChild(candList);

  // 移位与删除
  root.appendChild(h("h4", { text: "移位 / 删除" }));
  const moveRow = h("div", { class: "row2" });
  const lines = allLines(doc);
  const targetLine = h("select", {}, lines.map(({ line: l }) => h("option", { value: l.id, text: l.name || l.id, ...(l.id === line.id ? { selected: "selected" } : {}) })));
  const targetIndex = h("input", { type: "number", min: "0", step: "1", value: "0", title: "插入位置（0=行首）" });
  moveRow.append(
    field("目标行", targetLine),
    field("位置", targetIndex),
  );
  root.appendChild(moveRow);
  root.appendChild(h("div", { style: "display:flex;gap:8px" }, [
    h("button", {
      class: "btn", text: "移动", "data-testid": "moveBtn",
      onclick: () => moveSelected(targetLine.value, Number(targetIndex.value)),
    }),
    h("button", {
      class: "btn danger", text: "删除此字位", "data-testid": "deleteSlotBtn",
      onclick: () => removeSelectedSlot(),
    }),
  ]));
}