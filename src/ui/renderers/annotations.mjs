// 批注与行间对应面板。锚点按字位 uid 记录；点击「点选锚点」后在转录区逐字点选（可跨行）。
import { state, emit } from "../state.mjs";
import { findSlot, allLines } from "../../core/model.mjs";
import { makeAnnotation, makeLineLink, ANNOTATION_KINDS } from "../../core/annotations.mjs";

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

function currentDoc() {
  return state.workspace.docs.find((d) => d.id === state.docId).doc;
}

function anchorChips(doc, ids, onClick) {
  const wrap = h("div", { style: "margin:4px 0" });
  ids.forEach((id, ordinal) => {
    const hit = findSlot(doc, id);
    const chip = h("span", {
      class: "tag clickable " + (hit ? "" : "error-text"),
      title: hit ? "点击跳转到该字位" : "悬空引用：字位已不存在",
      style: hit ? "" : "border-color:var(--danger)",
      text: hit ? `${ordinal + 1}. ${hit.slot.face || hit.slot.reading || "□"}` : `${ordinal + 1}. ✗${id.slice(0, 6)}`,
      onclick: () => onClick?.(id, hit),
    });
    wrap.appendChild(chip);
  });
  return wrap;
}

export function renderAnnotations(root) {
  root.innerHTML = "";
  const doc = currentDoc();
  doc.annotations = doc.annotations || [];
  doc.lineLinks = doc.lineLinks || [];

  root.appendChild(h("h3", { text: "批注" }));
  root.appendChild(h("p", { class: "muted", text: "批注以字位编号锚定；字位增删移位后锚点跟随原字符，删除字位则报悬空。" }));

  const addBtn = h("button", {
    class: "btn mini", text: "＋ 新批注",
    onclick: () => { doc.annotations.push(makeAnnotation({ anchorIds: state.selectedSlotId ? [state.selectedSlotId] : [] })); emit("ann-add"); },
  });
  root.appendChild(addBtn);

  doc.annotations.forEach((ann, ai) => {
    const card = h("div", { class: "card " + (state.anchoring?.annotationId === ann.id ? "picked" : ""), "data-annotation-id": ann.id });
    const head = h("div", { style: "display:flex;gap:6px;align-items:center;flex-wrap:wrap" });
    const kindSel = h("select", {
      class: "tag",
      onchange: (e) => { ann.kind = e.target.value; emit("ann-edit"); },
    }, Object.entries(ANNOTATION_KINDS).map(([k, v]) => h("option", { value: k, text: v, ...(ann.kind === k ? { selected: "selected" } : {}) })));
    head.append(kindSel, h("span", { class: "tag kind-" + ann.kind, text: `锚点 ${ann.anchorIds.length}` }));
    card.appendChild(head);

    const chips = anchorChips(doc, ann.anchorIds, (id, hit) => {
      if (hit) { state.selectedSlotId = id; emit("select-goto"); }
    });
    card.appendChild(chips);

    card.appendChild(h("textarea", {
      text: ann.text, placeholder: "批注内容（校勘符号仅可用〔〕（）〈〉且须成对）",
      "data-testid": "annotationText",
      oninput: (e) => { ann.text = e.target.value; },
    }));

    const scopeSel = h("select", {
      onchange: (e) => { ann.scopeLineId = e.target.value || null; emit("ann-edit"); },
    }, [
      h("option", { value: "", text: "范围：不限行（可跨行）", ...(!ann.scopeLineId ? { selected: "selected" } : {}) }),
      ...allLines(doc).map(({ line }) => h("option", { value: line.id, text: `限：${line.name}`, ...(ann.scopeLineId === line.id ? { selected: "selected" } : {}) })),
    ]);
    card.appendChild(scopeSel);

    const actions = h("div", { style: "display:flex;gap:6px;margin-top:6px" });
    const picking = state.anchoring?.annotationId === ann.id;
    actions.appendChild(h("button", {
      class: "btn mini " + (picking ? "" : "ghost"),
      text: picking ? "完成点选" : "点选锚点",
      "data-testid": "pickAnchors",
      onclick: () => {
        state.anchoring = picking ? null : { annotationId: ann.id };
        state.linking = null;
        emit("anchor-mode");
      },
    }));
    actions.appendChild(h("button", {
      class: "btn mini danger", text: "删除批注",
      onclick: () => { doc.annotations.splice(ai, 1); if (picking) state.anchoring = null; emit("ann-del"); },
    }));
    card.appendChild(actions);
    root.appendChild(card);
  });

  root.appendChild(h("h3", { text: "行间对应" }));
  root.appendChild(h("button", {
    class: "btn mini", text: "＋ 新行间对应",
    onclick: () => { doc.lineLinks.push(makeLineLink({})); emit("link-add"); },
  }));
  doc.lineLinks.forEach((link, li) => {
    const card = h("div", { class: "card", "data-link-id": link.id });
    const lines = allLines(doc);
    const lineOpt = (id) => h("option", { value: "", text: "—", ...(!id ? { selected: "selected" } : {}) });
    const selA = h("select", { onchange: (e) => { link.aLine = e.target.value || null; emit("link-edit"); } },
      [lineOpt(), ...lines.map(({ line }) => h("option", { value: line.id, text: line.name, ...(link.aLine === line.id ? { selected: "selected" } : {}) }))]);
    const selB = h("select", { onchange: (e) => { link.bLine = e.target.value || null; emit("link-edit"); } },
      [lineOpt(), ...lines.map(({ line }) => h("option", { value: line.id, text: line.name, ...(link.bLine === line.id ? { selected: "selected" } : {}) }))]);
    card.appendChild(h("div", { class: "row2" }, [
      (() => { const w = h("div", {}); w.append(h("label", { class: "muted", text: "甲行" }), selA); return w; })(),
      (() => { const w = h("div", {}); w.append(h("label", { class: "muted", text: "乙行" }), selB); return w; })(),
    ]));
    // 字位配对
    (link.pairs || []).forEach((pair, pi) => {
      const aHit = pair.a ? findSlot(doc, pair.a) : null;
      const bHit = pair.b ? findSlot(doc, pair.b) : null;
      card.appendChild(h("div", { class: "pair-row" }, [
        h("span", { class: "tag " + (aHit ? "field-face" : "error-text"), text: aHit ? aHit.slot.face || "□" : "（待配）" }),
        h("span", { class: "arrow", text: "↔" }),
        h("span", { class: "tag " + (bHit ? "field-face" : "error-text"), text: bHit ? bHit.slot.face || "□" : "（待配）" }),
        h("span", {}),
        h("button", { class: "btn mini danger", text: "×", style: "padding:0 6px", onclick: () => { link.pairs.splice(pi, 1); emit("link-edit"); } }),
        h("span", {}),
      ]));
    });
    const pairBtns = h("div", { style: "display:flex;gap:6px;margin-top:6px" });
    ["a", "b"].forEach((side) => {
      const active = state.linking?.linkId === link.id && state.linking.side === side;
      pairBtns.appendChild(h("button", {
        class: "btn mini " + (active ? "" : "ghost"),
        text: active ? `点选${side === "a" ? "甲" : "乙"}侧…` : `配${side === "a" ? "甲" : "乙"}侧字位`,
        onclick: () => { state.linking = active ? null : { linkId: link.id, side }; state.anchoring = null; emit("link-mode"); },
      }));
    });
    pairBtns.appendChild(h("button", { class: "btn mini danger", text: "删除对应", onclick: () => { doc.lineLinks.splice(li, 1); emit("link-del"); } }));
    card.appendChild(pairBtns);
    card.appendChild(h("input", {
      type: "text", placeholder: "对应说明", value: link.note, style: "margin-top:6px",
      oninput: (e) => (link.note = e.target.value),
    }));
    root.appendChild(card);
  });
}
