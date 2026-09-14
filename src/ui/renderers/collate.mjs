// 逐字校勘面板：任选两份抄本，输出相同/替换/增补/脱文表与差异统计。
import { state, docById, emit } from "../state.mjs";
import { collate } from "../../core/collation.mjs";

function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) if (child) node.appendChild(child);
  return node;
}

const STATUS = { same: ["相同", "same"], replace: ["替换", "replace"], insert: ["增补", "insert"], delete: ["脱文", "delete"] };

export function renderCollate(root) {
  root.innerHTML = "";
  const docs = state.workspace.docs;
  const sel = (id, onchange) => h("select", { onchange }, docs.map((d) => h("option", { value: d.id, text: d.name, ...(id === d.id ? { selected: "selected" } : {}) })));

  root.appendChild(h("h3", { text: "两份抄本逐字校勘" }));
  root.appendChild(h("div", { class: "collate-controls" }, [
    (() => { const w = h("label", { class: "inline" }, []); w.append(h("span", { text: "甲（底本）" }), sel(state.collateA, (e) => { state.collateA = e.target.value; emit("collate"); })); return w; })(),
    (() => { const w = h("label", { class: "inline" }, []); w.append(h("span", { text: "乙（校本）" }), sel(state.collateB, (e) => { state.collateB = e.target.value; emit("collate"); })); return w; })(),
    (() => {
      const w = h("label", { class: "inline" }, []);
      const fs = h("select", {
        onchange: (e) => { state.collateField = e.target.value; emit("collate"); },
      }, [
        h("option", { value: "reading", text: "按首选释读（采纳候选＞通读＞原貌）", ...(state.collateField === "reading" ? { selected: "selected" } : {}) }),
        h("option", { value: "face", text: "仅按原貌字", ...(state.collateField === "face" ? { selected: "selected" } : {}) }),
      ]);
      w.append(h("span", { text: "比字口径" }), fs);
      return w;
    })(),
  ]));

  const entryA = docById(state.collateA);
  const entryB = docById(state.collateB);
  if (!entryA || !entryB || entryA.id === entryB.id) {
    root.appendChild(h("p", { class: "muted error-text", text: "请选择两份不同的抄本。" }));
    return;
  }

  const result = collate(entryA.doc, entryB.doc, { field: state.collateField });
  const summary = h("div", { class: "summary", "data-testid": "collateSummary" });
  Object.entries(STATUS).forEach(([k, [name]]) => {
    summary.appendChild(h("span", { class: "st " + k, text: `${name} ${result.summary[k]}` }));
  });
  root.appendChild(summary);

  const table = h("div", { "data-testid": "collateTable" });
  result.rows.forEach((row, i) => {
    const [name, cls] = STATUS[row.status];
    const locOf = (tok) => tok ? h("span", { class: "loc", text: `${tok.line || ""}${tok.slotIndex != null ? "·" + (tok.slotIndex + 1) : ""}` }) : null;
    table.appendChild(h("div", { class: "diff-row " + cls, "data-status": row.status, "data-testid": "diff-row" }, [
      h("span", { class: "st " + cls, text: name }),
      h("span", { class: "diff-cell acell" }, [document.createTextNode(row.a ? row.a.text : "—"), locOf(row.a)]),
      h("span", { class: "diff-cell bcell" }, [document.createTextNode(row.b ? row.b.text : "—"), locOf(row.b)]),
    ]));
    void i;
  });
  root.appendChild(table);
}
