// 入口：装配顶栏、转录区与五个侧栏面板，订阅状态变更后整体重渲染（数据规模小，渲染直接）。
import {
  state, on, load, selectDoc, selectSurface, addSurface, addLine, setMode,
  prependSlotToLine, appendSlotToLine, resetToSample, importWorkspace, currentSurface,
} from "./state.mjs";
import { WRITING_MODES, slotsFromText, makeCarrier, makeSurface, makeLine, makeDocument as makeDoc } from "../core/model.mjs";
import { renderTranscription } from "./renderers/transcription.mjs";
import { renderInspector } from "./renderers/inspector.mjs";
import { renderAnnotations } from "./renderers/annotations.mjs";
import { renderCollate } from "./renderers/collate.mjs";
import { renderGlyph } from "./renderers/glyph.mjs";
import { renderIssues, allIssueCounts } from "./renderers/issues.mjs";

const $ = (sel) => document.querySelector(sel);

function renderDocSelect() {
  const sel = $("#docSelect");
  sel.innerHTML = "";
  for (const entry of state.workspace.docs) {
    const opt = document.createElement("option");
    opt.value = entry.id;
    opt.textContent = entry.name;
    if (entry.id === state.docId) opt.selected = true;
    sel.appendChild(opt);
  }
}

function renderSurfaceTabs() {
  const wrap = $("#surfaceTabs");
  wrap.innerHTML = "";
  const entry = state.workspace.docs.find((d) => d.id === state.docId);
  entry.doc.carriers.forEach((carrier) => {
    carrier.surfaces.forEach((surface) => {
      const btn = document.createElement("button");
      btn.textContent = surface.name;
      btn.dataset.surfaceId = surface.id;
      if (surface.id === state.surfaceId) btn.classList.add("active");
      btn.onclick = () => selectSurface(surface.id);
      wrap.appendChild(btn);
    });
  });
}

function renderModeSelect() {
  const sel = $("#modeSelect");
  const surface = currentSurface();
  sel.innerHTML = "";
  for (const [k, v] of Object.entries(WRITING_MODES)) {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = v;
    if (surface && k === surface.mode) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.disabled = !surface;
}

function renderTabs() {
  document.querySelectorAll("#sideTabs .tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === state.activeTab);
  });
  document.querySelectorAll(".panels .panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === state.activeTab);
  });
}

function renderBadge() {
  const { errors, warnings } = allIssueCounts();
  const badge = $("#issueBadge");
  const total = errors + warnings;
  badge.textContent = total;
  badge.classList.toggle("hidden", total === 0);
  badge.classList.toggle("warn", errors === 0 && warnings > 0);
}

function renderActivePanel() {
  const panels = {
    inspector: () => renderInspector($("#panelInspector")),
    annotations: () => renderAnnotations($("#panelAnnotations")),
    collate: () => renderCollate($("#panelCollate")),
    glyph: () => renderGlyph($("#panelGlyph")),
    issues: () => renderIssues($("#panelIssues")),
  };
  panels[state.activeTab]?.();
}

function renderAll() {
  renderDocSelect();
  renderSurfaceTabs();
  renderModeSelect();
  renderTabs();
  renderTranscription($("#transcription"));
  renderActivePanel();
  renderBadge();
}

function wire() {
  $("#docSelect").addEventListener("change", (e) => selectDoc(e.target.value));
  $("#addSurfaceBtn").addEventListener("click", addSurface);
  $("#addLineBtn").addEventListener("click", addLine);
  $("#modeSelect").addEventListener("change", (e) => setMode(e.target.value));
  $("#prependSlotBtn").addEventListener("click", () => {
    const surface = currentSurface();
    const line = surface?.lines[0];
    if (line) prependSlotToLine(line.id);
  });
  $("#appendSlotBtn").addEventListener("click", () => {
    const surface = currentSurface();
    const line = surface?.lines[surface.lines.length - 1];
    if (line) appendSlotToLine(line.id);
  });

  document.querySelectorAll("#sideTabs .tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeTab = btn.dataset.tab;
      state.anchoring = null;
      state.linking = null;
      renderAll();
    });
  });

  $("#exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state.workspace, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "mingwen-workspace.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $("#importBtn").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      importWorkspace(JSON.parse(await file.text()));
    } catch (err) {
      alert("导入失败：" + err.message);
    }
    e.target.value = "";
  });
  $("#resetBtn").addEventListener("click", () => {
    if (confirm("恢复示例工作区？当前未导出的修改将丢失。")) resetToSample();
  });

  // 任何状态变更后重渲染。批注点选模式切换时也保留在原面板。
  on(() => renderAll());
}

load();
wire();
renderAll();

// 供浏览器测试读取状态、重置工作区与快速构造抄本
window.__mingwen = {
  state,
  renderAll,
  reset: () => { resetToSample(); },
  quickDoc(id, name, text, mode = "horizontalLr") {
    const line = makeLine({ id: `${id}-l1`, name: "第一行", slots: slotsFromText(text, { readings: true }) });
    const doc = makeDoc({ carriers: [makeCarrier({ id: `${id}-c1`, name, surfaces: [makeSurface({ id: `${id}-f1`, name: "面", mode, lines: [line] })] })] });
    state.workspace.docs.push({ id, name, doc });
    renderAll();
    return id;
  },
};
