import type { ScreenNode } from "../schema/index.js";
import { byId, D, storyPath } from "./data-model.js";
import { renderPlayerPanel } from "./story-player-panel.js";
import { iconHtml } from "./icons.js";
import type { Story } from "./types.js";

export interface PlayerHandlers { step: (index: number) => void; canvas: () => void; screenshot: (screen: ScreenNode) => void }

/** DOM overlay: one story step centred, adjacent steps deliberately visible at each edge. */
export function renderStoryPlayer(host: HTMLElement, story: Story | undefined, index: number, h: PlayerHandlers): void {
  host.replaceChildren(); host.hidden = !story; if (!story) return;
  const path = storyPath(story); const current = Math.min(Math.max(0, index), Math.max(0, path.length - 1)); const step = path[current]; const screen = byId.get(step.screen);
  const stage = document.createElement("section"); stage.className = "player-stage"; stage.setAttribute("aria-label", "Story player");
  const card = (at: number, side: "prev" | "next"): HTMLElement | null => { const item = path[at]; const s = item && byId.get(item.screen); const src = s ? (s.kind === "route" ? D.shotUrl(s.id) : D.dialogUrl(s.id) ?? D.shotUrl(s.id)) : null; if (!item) return null; const button = document.createElement("button"); button.type = "button"; button.className = `player-peek ${side}`; button.setAttribute("aria-label", side === "prev" ? "Previous step" : "Next step"); if (src) { const image = document.createElement("img"); image.src = src; image.alt = ""; button.append(image); } else button.textContent = "MISSING SCREEN"; button.addEventListener("click", () => h.step(at)); return button; };
  const prev = card(current - 1, "prev"), next = card(current + 1, "next"); if (prev) stage.append(prev);
  const currentCard = document.createElement("div"); currentCard.className = "player-current";
  const src = screen ? (screen.kind === "route" ? D.shotUrl(screen.id) : D.dialogUrl(screen.id) ?? D.shotUrl(screen.id)) : null;
  if (src) { const image = document.createElement("img"); image.src = src; image.alt = `Screenshot ${step.screen}`; currentCard.append(image); } else { const missing = document.createElement("p"); missing.className = "player-missing"; missing.textContent = "MISSING SCREEN"; currentCard.append(missing); }
  stage.append(currentCard); if (next) stage.append(next); host.append(stage);
  const scrubber = document.createElement("div"); scrubber.className = "player-scrubber"; const button = (label: string, at: number): HTMLButtonElement => { const b = document.createElement("button"); b.type = "button"; b.className = "icon-btn"; b.setAttribute("aria-label", label); b.title = label; b.innerHTML = iconHtml(label === "Previous step" ? "caret-left" : "caret-right"); b.disabled = at < 0 || at >= path.length; b.addEventListener("click", () => h.step(at)); return b; };
  scrubber.append(button("Previous step", current - 1)); const ticks = document.createElement("div"); ticks.className = "player-ticks"; path.forEach((_, i) => { const tick = document.createElement("button"); tick.type = "button"; tick.className = "player-tick" + (i === current ? " on" : ""); tick.setAttribute("aria-label", `Step ${i + 1}`); tick.title = `Step ${i + 1}`; tick.addEventListener("click", () => h.step(i)); ticks.append(tick); }); scrubber.append(ticks); const count = document.createElement("span"); count.className = "player-count player-meta"; count.textContent = `${current + 1} / ${path.length}`; scrubber.append(count, button("Next step", current + 1)); host.append(scrubber);
  const panel = document.createElement("aside"); panel.className = "player-panel"; renderPlayerPanel(panel, story, current, h); host.append(panel);
}
