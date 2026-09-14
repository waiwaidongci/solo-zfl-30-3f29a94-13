// 字形索引面板：按字素簇检索，列出每处出现（原貌/通读/候选），点击跳转到字位。
import { state, emit } from "../state.mjs";
import { buildGlyphIndex, searchGlyphIndex } from "../../core/index.mjs";

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

const FIELD_NAME = { face: "原貌", reading: "通读", candidate: "候选" };

export function renderGlyph(root) {
  root.innerHTML = "";
  const doc = state.workspace.docs.find((d) => d.id === state.docId).doc;
  const index = buildGlyphIndex(doc);

  root.appendChild(h("h3", { text: "字形索引" }));
  root.appendChild(h("p", { class: "muted", text: `共 ${index.entries.length} 个不同字素簇。缺字占位不入索引。` }));
  const search = h("input", {
    type: "text", placeholder: "输入字素簇检索（组合字符按整簇匹配）", value: state.glyphQuery,
    "data-testid": "glyphSearch",
    oninput: (e) => { state.glyphQuery = e.target.value; emit("glyph-search"); },
  });
  const defectSel = h("select", {
    onchange: (e) => { state.glyphDefect = e.target.value; emit("glyph-search"); },
  }, ["", "残", "泐", "蚀", "漫漶"].map((d) => h("option", { value: d, text: d ? `仅看${d}损` : "全部缺损", ...((state.glyphDefect || "") === d ? { selected: "selected" } : {}) })));
  root.appendChild(h("div", { class: "glyph-search" }, [search, defectSel]));

  const hits = searchGlyphIndex(index, state.glyphQuery, { defect: state.glyphDefect || "" });
  const grid = h("div", { class: "glyph-grid", "data-testid": "glyphGrid" });
  hits.forEach((entry) => {
    const picked = state.glyphPicked === entry.glyph;
    grid.appendChild(h("button", {
      class: "glyph-chip " + (picked ? "picked" : ""),
      title: `${entry.count} 处`,
      onclick: () => { state.glyphPicked = picked ? null : entry.glyph; emit("glyph-pick"); },
    }, [document.createTextNode(entry.glyph), h("small", { text: String(entry.count) })]));
  });
  root.appendChild(grid);

  if (state.glyphPicked) {
    const entry = index.byGlyph.get(state.glyphPicked);
    root.appendChild(h("h4", { text: `「${state.glyphPicked}」的出现（${entry.length}）` }));
    const list = h("ul", { class: "plain occ-list", "data-testid": "occurrenceList" });
    entry.forEach((o) => {
      const li = h("li", { class: "clickable", onclick: () => { state.selectedSlotId = o.slotId; emit("select-goto"); } });
      li.append(
        h("span", { class: "tag field-" + o.field, text: FIELD_NAME[o.field] }),
        document.createTextNode(` ${o.carrier || ""} / ${o.surface} / ${o.line} · 第 ${o.slotIndex + 1} 位`),
        o.defect ? h("span", { class: "tag", text: o.defect }) : document.createTextNode(""),
      );
      list.appendChild(li);
    });
    root.appendChild(list);
  }
}
