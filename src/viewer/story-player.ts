import { byId, D, realTitle, routeTitle, storyPath } from "./data-model.js";
import { renderPlayerPanel } from "./story-player-panel.js";
import type { Story } from "./types.js";

export interface PlayerHandlers { step: (index: number) => void }

function screenshotImage(src: string, alt: string): HTMLImageElement {
  const image = document.createElement("img"); image.src = src; image.alt = alt;
  image.onerror = () => { image.hidden = true; const placeholder = document.createElement("span"); placeholder.className = "player-image-fallback"; placeholder.textContent = "Screenshot unavailable"; image.after(placeholder); };
  return image;
}

const titleFor = (id: string): string => { const screen = byId.get(id); return !screen ? "Missing screen" : screen.kind === "route" ? routeTitle(screen.id) : realTitle(screen.id); };

/** Play mode: every story step remains visible in story order; one card owns the current hash step. */
export function renderStoryPlayer(host: HTMLElement, story: Story | undefined, index: number, h: PlayerHandlers): void {
  host.replaceChildren(); host.hidden = !story; if (!story) return;
  const path = storyPath(story); const current = Math.min(Math.max(0, index), Math.max(0, path.length - 1));
  const stage = document.createElement("section"); stage.className = "player-stage player-gallery"; stage.setAttribute("aria-label", "Story steps");
  path.forEach((step, stepIndex) => {
    const screen = byId.get(step.screen); const card = document.createElement("button"); card.type = "button"; card.className = "player-card" + (stepIndex === current ? " on" : ""); card.setAttribute("aria-label", `Step ${stepIndex + 1}: ${titleFor(step.screen)}`);
    const shot = document.createElement("span"); shot.className = "player-card-shot";
    const src = screen ? (screen.kind === "route" ? D.shotUrl(screen.id) : D.dialogUrl(screen.id) ?? D.shotUrl(screen.id)) : null;
    if (src) shot.append(screenshotImage(src, `Screenshot ${step.screen}`)); else { const missing = document.createElement("span"); missing.className = "player-missing"; missing.textContent = `MISSING SCREEN · ${step.screen}`; shot.append(missing); }
    const chip = document.createElement("span"); chip.className = "player-step-chip"; chip.textContent = String(stepIndex + 1);
    const title = document.createElement("span"); title.className = "player-card-title"; title.textContent = titleFor(step.screen);
    card.append(chip, shot, title); card.addEventListener("click", () => h.step(stepIndex)); stage.append(card);
  });
  host.append(stage);
  const panel = document.createElement("aside"); panel.className = "player-panel"; renderPlayerPanel(panel, story, current, h); host.append(panel);
}
