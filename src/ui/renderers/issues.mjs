// 校验面板：悬空引用 / 互斥释读 / 越界批注 / 非法校勘符号等逐项定位，点击跳转到锚点。
import { state, emit } from "../state.mjs";
import { validateDocument } from "../../core/annotations.mjs";

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

export function issuesForCurrentDoc() {
  const doc = state.workspace.docs.find((d) => d.id === state.docId).doc;
  return validateDocument(doc);
}

// 供顶栏徽标统计
export function allIssueCounts() {
  let errors = 0;
  let warnings = 0;
  for (const entry of state.workspace.docs) {
    for (const issue of validateDocument(entry.doc)) {
      if (issue.level === "warning") warnings++;
      else errors++;
    }
  }
  return { errors, warnings };
}

function locate(issue) {
  const loc = issue.loc || {};
  if (loc.slot != null && loc.line != null) {
    const doc = state.workspace.docs.find((d) => d.id === state.docId).doc;
    const carrier = doc.carriers[loc.carrier];
    const surface = carrier?.surfaces[loc.surface];
    const line = surface?.lines[loc.line];
    const slot = line?.slots[loc.slot];
    if (slot) {
      state.surfaceId = surface.id;
      state.selectedSlotId = slot.id;
      state.activeTab = "inspector";
      emit("goto-issue");
      return;
    }
  }
  if (loc.annotationId) {
    state.activeTab = "annotations";
    emit("goto-issue");
  }
}

export function renderIssues(root) {
  root.innerHTML = "";
  const issues = issuesForCurrentDoc();
  root.appendChild(h("h3", { text: `校验结果（${issues.length}）` }));
  if (!issues.length) {
    root.appendChild(h("p", { class: "ok-text", text: "✓ 未发现悬空引用、越界批注、互斥释读或非法校勘符号。" }));
    return;
  }
  issues.forEach((issue) => {
    const where = issue.loc
      ? issue.loc.annotationId
        ? `批注 ${issue.loc.annotationId}${issue.loc.ordinal != null ? ` · 第 ${issue.loc.ordinal + 1} 锚点` : ""}${issue.loc.charIndex != null ? ` · 第 ${issue.loc.charIndex + 1} 字素簇` : ""}`
        : [issue.loc.carrierName, issue.loc.surfaceName, issue.loc.lineName, issue.loc.slot != null ? `第 ${issue.loc.slot + 1} 字位` : null].filter(Boolean).join(" / ")
      : "";
    root.appendChild(h("div", {
      class: "issue " + (issue.level === "warning" ? "warning" : "error"),
      "data-code": issue.code,
      "data-testid": "issueItem",
      onclick: () => locate(issue),
    }, [
      h("div", { class: "code", text: issue.code }),
      h("div", { text: issue.message }),
      where ? h("div", { class: "muted", text: "定位：" + where }) : null,
    ]));
  });
}
