import type { ActionEdge, ScreenNode } from "../schema/index.js";
import { byId, D, featById, realTitle, routeOf, routeTitle, storyFeature, storyPath } from "./data-model.js";
import type { Story } from "./types.js";

export interface PlayerPanelHandlers { step: (index: number) => void; canvas: () => void; screenshot: (screen: ScreenNode) => void }

const evidenceFor = (story: Story, id: string): ActionEdge | undefined => D.graph.edges.filter((edge) => edge.scope === "screen" && edge.target === id && story.screens.includes(edge.source)).sort((a, b) => ({ high: 3, medium: 2, low: 1 }[b.confidence] - { high: 3, medium: 2, low: 1 }[a.confidence]))[0];

/** Right-side evidence panel for a walkthrough step. */
export function renderPlayerPanel(panel: HTMLElement, story: Story, index: number, h: PlayerPanelHandlers): void {
  panel.replaceChildren(); const path = storyPath(story); const step = path[index]; if (!step) return;
  const screen = byId.get(step.screen); const edge = evidenceFor(story, step.screen); const title = screen ? (screen.kind === "route" ? routeTitle(screen.id) : realTitle(screen.id)) : "Missing screen";
  const add = (tag: string, className: string, value: string): void => { const el = document.createElement(tag); el.className = className; el.textContent = value; panel.append(el); };
  add("p", "player-eyebrow", featById[storyFeature(story)]?.title ?? "Feature"); add("h2", "player-title", title); add("p", "player-route mono", routeOf(step.screen) ?? step.screen);
  if (step.via || edge) { const evidence = document.createElement("button"); evidence.className = "player-evidence"; evidence.type = "button"; evidence.textContent = `via ${step.via ?? edge?.trigger ?? ""} · ${edge?.confidence ?? "asserted"} · ${edge ? `${edge.evidence.file}:${edge.evidence.line}` : "not in code"}`; panel.append(evidence);
    if (edge?.evidence.snippet) { const snippet = document.createElement("pre"); snippet.className = "player-snippet"; snippet.hidden = true; snippet.textContent = edge.evidence.snippet; evidence.addEventListener("click", () => { snippet.hidden = !snippet.hidden; }); panel.append(snippet); }
  }
  const thumbs = document.createElement("div"); thumbs.className = "player-thumbs"; thumbs.setAttribute("aria-label", "Story steps");
  path.forEach((item, itemIndex) => { const s = byId.get(item.screen); const b = document.createElement("button"); b.type = "button"; b.className = "player-thumb" + (itemIndex === index ? " on" : ""); b.setAttribute("aria-label", `Step ${itemIndex + 1}`); const src = s ? (s.kind === "route" ? D.shotUrl(s.id) : D.dialogUrl(s.id) ?? D.shotUrl(s.id)) : null;
    if (src) { const image = document.createElement("img"); image.src = src; image.alt = ""; b.append(image); } else b.textContent = "Missing";
    b.addEventListener("click", () => h.step(itemIndex)); thumbs.append(b); }); panel.append(thumbs);
  if (story.branches?.length) { const branches = document.createElement("div"); branches.className = "player-branches"; story.branches.forEach((branch) => { const pill = document.createElement("span"); pill.className = "player-branch"; pill.textContent = branch.title; branches.append(pill); }); panel.append(branches); }
  if (!screen || !edge && index > 0) add("p", "player-warning", screen ? "Not in code" : "Missing screen");
  const actions = document.createElement("div"); actions.className = "player-actions"; const canvas = document.createElement("button"); canvas.type = "button"; canvas.textContent = "Open canvas"; canvas.addEventListener("click", h.canvas); actions.append(canvas);
  if (screen) { const shot = document.createElement("button"); shot.type = "button"; shot.textContent = "Screenshot"; shot.addEventListener("click", () => h.screenshot(screen)); actions.append(shot); } panel.append(actions);
}
