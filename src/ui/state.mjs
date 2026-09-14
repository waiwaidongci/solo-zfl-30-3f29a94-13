// 前端全局状态：工作区（多份抄本）+ 当前选择。纯数据，localStorage 持久化。
import { makeSurface, makeLine, makeSlot, insertSlot, moveSlot, deleteSlot, findSlot } from "../core/model.mjs";
import { buildSampleWorkspace } from "../core/sample.mjs";

const KEY = "mingwenTai.workspace.v1";

export const state = {
  workspace: null,
  docId: null,
  surfaceId: null,
  selectedSlotId: null,
  activeTab: "inspector",
  // 批注锚定模式：{annotationId} 表示正在为该批注追加锚点；null 表示普通选择
  anchoring: null,
  // 行间对应配对模式：{linkId, side: "a"|"b"}
  linking: null,
  // 字形索引选中的字
  glyphQuery: "",
  glyphPicked: null,
  // 校勘选择
  collateA: null,
  collateB: null,
  collateField: "reading",
  // 监听器
  listeners: new Set(),
};

export function on(fn) {
  state.listeners.add(fn);
  return () => state.listeners.delete(fn);
}

export function emit(reason) {
  persist();
  for (const fn of [...state.listeners]) fn(reason);
}

export function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state.workspace));
  } catch {
    /* 配额满时本次不持久化 */
  }
}

export function load() {
  let ws = null;
  try {
    ws = JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    ws = null;
  }
  if (!ws || !Array.isArray(ws.docs) || !ws.docs.length) ws = buildSampleWorkspace();
  state.workspace = ws;
  state.docId = ws.docs[0].id;
  state.surfaceId = currentDoc().carriers[0].surfaces[0].id;
  state.collateA = ws.docs[0].id;
  state.collateB = ws.docs[Math.min(1, ws.docs.length - 1)].id;
}

export function resetToSample() {
  state.workspace = buildSampleWorkspace();
  state.docId = state.workspace.docs[0].id;
  state.surfaceId = currentDoc().carriers[0].surfaces[0].id;
  state.selectedSlotId = null;
  state.collateA = state.workspace.docs[0].id;
  state.collateB = state.workspace.docs[Math.min(1, state.workspace.docs.length - 1)].id;
  emit("reset");
}

export function importWorkspace(ws) {
  if (!ws || !Array.isArray(ws.docs)) throw new Error("工作区格式错误：缺少 docs 数组");
  state.workspace = ws;
  state.docId = ws.docs[0]?.id || null;
  state.surfaceId = ws.docs[0]?.doc.carriers[0]?.surfaces[0]?.id || null;
  emit("import");
}

export function currentDocEntry() {
  return state.workspace.docs.find((d) => d.id === state.docId) || state.workspace.docs[0];
}
export function currentDoc() {
  return currentDocEntry().doc;
}
export function currentSurface() {
  const doc = currentDoc();
  for (const c of doc.carriers) {
    const f = c.surfaces.find((s) => s.id === state.surfaceId);
    if (f) return f;
  }
  return doc.carriers[0]?.surfaces[0] || null;
}
export function currentLine() {
  const surface = currentSurface();
  return surface?.lines[surface.lines.length - 1] || null;
}

export function selectDoc(docId) {
  state.docId = docId;
  const doc = currentDoc();
  state.surfaceId = doc.carriers[0]?.surfaces[0]?.id || null;
  state.selectedSlotId = null;
  emit("doc");
}

export function selectSurface(surfaceId) {
  state.surfaceId = surfaceId;
  state.selectedSlotId = null;
  emit("surface");
}

export function selectSlot(slotId) {
  state.selectedSlotId = slotId;
  emit("select");
}

export function addSurface() {
  const doc = currentDoc();
  const f = makeSurface({ name: `版面${doc.carriers[0].surfaces.length + 1}` });
  doc.carriers[0].surfaces.push(f);
  state.surfaceId = f.id;
  emit("surface-add");
}

export function addLine() {
  const surface = currentSurface();
  const line = makeLine({ name: `第${["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"][surface.lines.length] || surface.lines.length + 1}${surface.mode.startsWith("vertical") ? "列" : "行"}` });
  surface.lines.push(line);
  emit("line-add");
}

export function setMode(mode) {
  currentSurface().mode = mode;
  emit("mode");
}

export function addSlot(lineId, index, slot = {}) {
  const s = insertSlot(currentDoc(), { lineId, index, slot: makeSlot(slot) });
  state.selectedSlotId = s.id;
  emit("slot-add");
  return s;
}

export function appendSlotToLine(lineId) {
  return addSlot(lineId, lineById(lineId).slots.length);
}

export function prependSlotToLine(lineId) {
  return addSlot(lineId, 0);
}

export function removeSelectedSlot() {
  if (!state.selectedSlotId) return;
  deleteSlot(currentDoc(), state.selectedSlotId);
  state.selectedSlotId = null;
  emit("slot-delete");
}

export function moveSelected(lineId, index) {
  if (!state.selectedSlotId) return;
  moveSlot(currentDoc(), state.selectedSlotId, { lineId, index });
  emit("slot-move");
}

export function lineById(lineId) {
  const doc = currentDoc();
  for (const c of doc.carriers) for (const f of c.surfaces) {
    const l = f.lines.find((x) => x.id === lineId);
    if (l) return l;
  }
  return null;
}

export function selectedSlot() {
  return state.selectedSlotId ? findSlot(currentDoc(), state.selectedSlotId) : null;
}

export function docById(id) {
  return state.workspace.docs.find((d) => d.id === id) || null;
}
