import type { ActionEdge } from "../schema/index.js";
import { byId, D, featById, realTitle, routeOf, routeTitle, storyFeature, storyPath } from "./data-model.js";
import type { Story } from "./types.js";
import { iconHtml } from "./icons.js";

export interface PlayerPanelHandlers { step: (index: number) => void; view: (focus: boolean) => void }

const evidenceFor = (story: Story, id: string): ActionEdge | undefined => D.graph.edges.filter((edge) => edge.scope === "screen" && edge.target === id && story.screens.includes(edge.source)).sort((a, b) => ({ high: 3, medium: 2, low: 1 }[b.confidence] - { high: 3, medium: 2, low: 1 }[a.confidence]))[0];

/** Right-side evidence panel for a walkthrough step. */
export function renderPlayerPanel(panel: HTMLElement, story: Story, index: number, focus: boolean, h: PlayerPanelHandlers): void {
  panel.replaceChildren(); const path = storyPath(story); const step = path[index]; if (!step) return;
  const viewSeg = document.createElement("div"); viewSeg.className = "player-view-seg seg";
  ([{ focus: false, icon: "squares-four" as const, title: "Grid view" }, { focus: true, icon: "corners-out" as const, title: "Focus view" }]).forEach((item) => { const button = document.createElement("button"); button.type = "button"; button.title = item.title; button.setAttribute("aria-label", item.title); button.classList.toggle("on", focus === item.focus); button.innerHTML = iconHtml(item.icon, item.title); button.addEventListener("click", () => h.view(item.focus)); viewSeg.append(button); }); panel.append(viewSeg);
  const screen = byId.get(step.screen); const edge = evidenceFor(story, step.screen); const title = screen ? (screen.kind === "route" ? routeTitle(screen.id) : realTitle(screen.id)) : "Missing screen";
  const add = (tag: string, className: string, value: string): void => { const el = document.createElement(tag); el.className = className; el.textContent = value; panel.append(el); };
  add("p", "player-eyebrow-label", featById[storyFeature(story)]?.title ?? "Feature"); add("h2", "player-title", title); add("p", "player-route-meta mono", routeOf(step.screen) ?? step.screen);
  if (step.via || edge) { const evidence = document.createElement("button"); evidence.className = "player-evidence-label"; evidence.type = "button"; const trigger = step.via ?? edge?.trigger ?? ""; const meta = edge ? `${edge.evidence.file}:${edge.evidence.line}` : "Not in code"; evidence.title = edge?.confidence ?? "missing"; evidence.innerHTML = `<span class="player-evidence-trigger">${iconHtml("cursor-click", "Action trigger", 16)}<span>${trigger}</span><span class="confidence-dot" title="${edge?.confidence ?? "missing"}">${edge ? (edge.confidence === "high" ? "●" : edge.confidence === "medium" ? "◐" : "○") : iconHtml("warning", "Missing screen", 14)}</span></span><span class="player-evidence-meta-label">${iconHtml(edge ? "file-code" : "link-break", edge ? "Source evidence" : "Missing screen", 14)}${meta}</span>`; panel.append(evidence);
    if (edge?.evidence.snippet) { const snippet = document.createElement("pre"); snippet.className = "player-snippet"; snippet.hidden = true; snippet.textContent = edge.evidence.snippet; evidence.addEventListener("click", () => { snippet.hidden = !snippet.hidden; }); panel.append(snippet); }
  }
  const thumbs = document.createElement("div"); thumbs.className = "player-thumbs"; thumbs.setAttribute("aria-label", "Story steps");
  path.forEach((item, itemIndex) => { const s = byId.get(item.screen); const b = document.createElement("button"); b.type = "button"; b.className = "player-thumb player-thumb-badge" + (itemIndex === index ? " on" : ""); b.setAttribute("aria-label", `Step ${itemIndex + 1}`); const src = s ? (s.kind === "route" ? D.shotUrl(s.id) : D.dialogUrl(s.id) ?? D.shotUrl(s.id)) : null;
    if (src) { const image = document.createElement("img"); image.src = src; image.alt = ""; image.onerror = () => { image.hidden = true; const fallback = document.createElement("span"); fallback.className = "player-image-fallback"; fallback.textContent = "Screenshot unavailable"; image.after(fallback); }; b.append(image); } else b.textContent = "Not in code";
    b.addEventListener("click", (event) => { event.stopPropagation(); h.step(itemIndex); }); thumbs.append(b); }); panel.append(thumbs);
  if (story.branches?.length) { const branches = document.createElement("div"); branches.className = "player-branches"; story.branches.forEach((branch) => { const pill = document.createElement("span"); pill.className = "player-branch-badge"; pill.innerHTML = `${iconHtml("git-branch", "Branch", 14)}<span>${branch.title}</span>`; branches.append(pill); }); panel.append(branches); }
  if (!screen || !edge && index > 0) { const warning = document.createElement("p"); warning.className = "player-warning-label"; warning.innerHTML = `${iconHtml("link-break", "Not in code", 16)}<span>Not in code</span>`; panel.append(warning); }
}
