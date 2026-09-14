// 转录区渲染：按版面方向排列列/行与字位格；锚点高亮；点击选择或追加批注锚点；拖拽移位。
import { state, emit, addSlot, moveSelected } from "../state.mjs";
import { graphemeCount } from "../../core/graphemes.mjs";

const ANCHOR_COLORS = ["#2b7fb0", "#8a54b8", "#b0672b", "#2e8b6f", "#b83b6a", "#5a6fb0"];

export function annotationColorMap() {
  const map = new Map();
  const anns = state.workspace.docs.find((d) => d.id === state.docId)?.doc.annotations || [];
  anns.forEach((a, i) => map.set(a.id, ANCHOR_COLORS[i % ANCHOR_COLORS.length]));
  return map;
}

function el(tag, attrs = {}, children = []) {
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

function anchorOrdinal(slotId) {
  const doc = state.workspace.docs.find((d) => d.id === state.docId)?.doc;
  const out = [];
  (doc.annotations || []).forEach((a) => {
    const ord = a.anchorIds.indexOf(slotId);
    if (ord >= 0) out.push({ color: annotationColorMap().get(a.id), ord: ord + 1, kind: a.kind });
  });
  return out;
}

function slotGlyph(slot) {
  if (slot.type === "missing") {
    const n = Math.max(1, Number(slot.expectedGraphemes) || 1);
    return "□".repeat(Math.min(n, 3)) + (n > 3 ? `×${n}` : "");
  }
  return slot.face || "·";
}

function renderSlot(line, slot, index) {
  const anns = anchorOrdinal(slot.id);
  const cell = el("div", {
    class: [
      "slot",
      slot.type,
      state.selectedSlotId === slot.id ? "selected" : "",
      anns.length ? "anchored" : "",
      isPreviewAnchor(slot.id) ? "anchor-preview" : "",
    ].join(" ").trim(),
    "data-slot-id": slot.id,
    "data-line-id": line.id,
    "data-index": index,
    "data-testid": "slot",
    "data-defect": slot.defect || "",
    draggable: "true",
    title: slotTitle(slot),
    onclick: () => onSlotClick(line, slot, index),
  });
  if (anns.length) cell.style.setProperty("--anchor-color", anns[0].color);
  cell.appendChild(el("span", { class: "glyph", "data-testid": "glyph", text: slotGlyph(slot) }));
  if (slot.type === "ligature" && slot.reading) {
    cell.appendChild(el("span", { class: "reading-tag", text: slot.reading }));
  }
  anns.slice(0, 2).forEach((a) => cell.appendChild(el("span", { class: "ord", style: `background:${a.color}`, text: String(a.ord) })));
  // 拖拽移位
  cell.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/slot-id", slot.id);
    e.dataTransfer.effectAllowed = "move";
  });
  return cell;
}

function slotTitle(slot) {
  const parts = [`类型：${slot.type}`, `原貌：${slot.face || "（空）"}`];
  if (slot.reading) parts.push(`通读：${slot.reading}`);
  if (slot.defect) parts.push(`缺损：${slot.defect}`);
  if (slot.note) parts.push(slot.note);
  return parts.join("\n");
}

function isPreviewAnchor(slotId) {
  if (!state.anchoring) return false;
  const ann = currentAnnotations().find((a) => a.id === state.anchoring.annotationId);
  return ann?.anchorIds.includes(slotId);
}

function currentAnnotations() {
  return state.workspace.docs.find((d) => d.id === state.docId)?.doc.annotations || [];
}

function onSlotClick(line, slot) {
  if (state.anchoring) {
    const ann = currentAnnotations().find((a) => a.id === state.anchoring.annotationId);
    if (!ann) return;
    const at = ann.anchorIds.indexOf(slot.id);
    if (at >= 0) ann.anchorIds.splice(at, 1); // 再点取消
    else ann.anchorIds.push(slot.id);
    emit("anchor");
    return;
  }
  if (state.linking) {
    toggleLinkPair(slot);
    emit("link-pair");
    return;
  }
  state.selectedSlotId = slot.id;
  emit("select");
}

function toggleLinkPair(slot) {
  const doc = state.workspace.docs.find((d) => d.id === state.docId).doc;
  const link = doc.lineLinks.find((l) => l.id === state.linking.linkId);
  if (!link) return;
  const key = state.linking.side;
  const existing = link.pairs.find((p) => p[key] === slot.id);
  if (existing) link.pairs.splice(link.pairs.indexOf(existing), 1);
  else {
    const other = key === "a" ? "b" : "a";
    // 同侧改选：替换最后一个未配对项
    const open = [...link.pairs].reverse().find((p) => !p[key]);
    if (open && (key === "a" ? !open.a : !open.b)) {
      open[key] = slot.id;
    } else {
      link.pairs.push({ a: key === "a" ? slot.id : null, b: key === "b" ? slot.id : null });
    }
    void other;
  }
}

function plusButton(lineId, index) {
  return el("button", {
    class: "add-slot-here",
    title: "在此插入字位",
    "data-insert-index": index,
    text: "＋",
    onclick: () => addSlot(lineId, index),
  });
}

export function renderTranscription(root) {
  const docEntry = state.workspace.docs.find((d) => d.id === state.docId);
  const doc = docEntry.doc;
  const surface = doc.carriers.flatMap((c) => c.surfaces).find((f) => f.id === state.surfaceId) || doc.carriers[0]?.surfaces[0];
  if (!surface) {
    root.className = "transcription";
    root.replaceChildren(el("p", { class: "muted", text: "尚无版面，请点击「新版面」。" }));
    return;
  }
  root.className = `transcription mode-${surface.mode}`;
  root.innerHTML = "";

  let totalGraphemes = 0;
  for (const line of surface.lines) {
    totalGraphemes += line.slots.reduce((n, s) => n + (s.type === "missing" ? Number(s.expectedGraphemes) || 1 : graphemeCount(s.face || "")), 0);
    const block = el("div", { class: "line-block", "data-line-id": line.id });
    const slotsWrap = el("div", { class: "line-slots", "data-testid": "line-slots" });
    // 行首插入
    slotsWrap.appendChild(plusButton(line.id, 0));
    line.slots.forEach((slot, index) => {
      slotsWrap.appendChild(renderSlot(line, slot, index));
      slotsWrap.appendChild(plusButton(line.id, index + 1));
    });
    // 行间/列间放置
    slotsWrap.addEventListener("dragover", (e) => {
      if (e.dataTransfer.types.includes("text/slot-id")) {
        e.preventDefault();
        slotsWrap.classList.add("drop-target");
      }
    });
    slotsWrap.addEventListener("dragleave", () => slotsWrap.classList.remove("drop-target"));
    slotsWrap.addEventListener("drop", (e) => {
      e.preventDefault();
      slotsWrap.classList.remove("drop-target");
      const slotId = e.dataTransfer.getData("text/slot-id");
      if (!slotId) return;
      const targetCell = e.target.closest(".slot");
      const plus = e.target.closest(".add-slot-here");
      let index = line.slots.length;
      if (plus && plus.dataset.insertIndex !== undefined) {
        index = Number(plus.dataset.insertIndex);
      } else if (targetCell && targetCell.dataset.lineId === line.id) {
        const rect = targetCell.getBoundingClientRect();
        const after = surface.mode.includes("horizontal")
          ? e.clientX > rect.left + rect.width / 2
          : e.clientY > rect.top + rect.height / 2;
        index = Number(targetCell.dataset.index) + (after ? 1 : 0);
      }
      const currentIndex = line.slots.findIndex((s) => s.id === slotId);
      if (currentIndex >= 0 && currentIndex < index) index -= 1; // 抽出后索引回退
      state.selectedSlotId = slotId;
      moveSelected(line.id, Math.max(0, index));
    });
    block.appendChild(slotsWrap);
    block.appendChild(el("div", { class: "line-name", text: line.name || "（未命名行）" }));
    root.appendChild(block);
  }
  if (!surface.lines.length) {
    root.appendChild(el("p", { class: "muted", text: "尚无行/列，请点击「新行」。" }));
  }
  const counter = document.querySelector("#graphemeCounter");
  if (counter) counter.textContent = `字素簇总数（含缺字）：${totalGraphemes}`;
}
