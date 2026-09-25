import { byId, D, realTitle, routeTitle, storyPath } from "./data-model.js";
import { renderPlayerPanel } from "./story-player-panel.js";
import { renderStage } from "./stage-view.js";
import type { Story } from "./types.js";

export interface PlayerHandlers { step: (index: number) => void; openFocus: (index: number) => void; view: (focus: boolean) => void }

function screenshotImage(src: string, alt: string): HTMLImageElement {
  const image = document.createElement("img"); image.src = src; image.alt = alt;
  image.onerror = () => { image.hidden = true; const placeholder = document.createElement("span"); placeholder.className = "player-image-fallback"; placeholder.textContent = "Screenshot unavailable"; image.after(placeholder); };
  return image;
}

const titleFor = (id: string): string => { const screen = byId.get(id); return !screen ? "Missing screen" : screen.kind === "route" ? routeTitle(screen.id) : realTitle(screen.id); };

/** Play mode: grid shows every step; Focus is the Stage (ADR-0008), which keeps its own DOM across steps. */
export function renderStoryPlayer(host: HTMLElement, story: Story | undefined, index: number, focus: boolean, h: PlayerHandlers): void {
  host.hidden = !story; if (!story) { host.replaceChildren(); return; }
  const path = storyPath(story); const current = Math.min(Math.max(0, index), Math.max(0, path.length - 1));
  if (focus) { renderStage(host, story, current, { step: h.step, grid: () => h.view(false) }); return; }
  host.replaceChildren();
  const stage = document.createElement("section"); stage.className = "player-stage player-gallery"; stage.setAttribute("aria-label", "Story steps");
  const srcFor = (id: string): string | null => { const screen = byId.get(id); return screen ? (screen.kind === "route" ? D.shotUrl(screen.id) : D.dialogUrl(screen.id) ?? D.shotUrl(screen.id)) : null; };
  path.forEach((step, stepIndex) => {
    const card = document.createElement("button"); card.type = "button"; card.className = "player-card" + (stepIndex === current ? " on" : ""); card.dataset.step = String(stepIndex); card.setAttribute("aria-label", `Step ${stepIndex + 1}: ${titleFor(step.screen)}`);
    const shot = document.createElement("span"); shot.className = "player-card-shot";
    const src = srcFor(step.screen);
    if (src) shot.append(screenshotImage(src, `Screenshot ${step.screen}`)); else { const missing = document.createElement("span"); missing.className = "player-missing"; missing.textContent = `MISSING SCREEN · ${step.screen}`; shot.append(missing); }
    const chip = document.createElement("span"); chip.className = "player-step-chip"; chip.textContent = String(stepIndex + 1);
    const title = document.createElement("span"); title.className = "player-card-title"; title.textContent = titleFor(step.screen);
    card.append(chip, shot, title); card.addEventListener("click", (event) => { event.stopPropagation(); h.openFocus(stepIndex); }); stage.append(card);
  });
  host.append(stage);
  const panel = document.createElement("aside"); panel.className = "player-panel"; renderPlayerPanel(panel, story, current, false, h); host.append(panel);
}
