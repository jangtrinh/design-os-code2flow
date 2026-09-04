import { byId, D, realTitle, routeTitle, storyPath } from "./data-model.js";
import { renderPlayerPanel } from "./story-player-panel.js";
import { iconHtml } from "./icons.js";
import type { Story } from "./types.js";

export interface PlayerHandlers { step: (index: number) => void; openFocus: (index: number) => void; view: (focus: boolean) => void }

function screenshotImage(src: string, alt: string): HTMLImageElement {
  const image = document.createElement("img"); image.src = src; image.alt = alt;
  image.onerror = () => { image.hidden = true; const placeholder = document.createElement("span"); placeholder.className = "player-image-fallback"; placeholder.textContent = "Screenshot unavailable"; image.after(placeholder); };
  return image;
}

const titleFor = (id: string): string => { const screen = byId.get(id); return !screen ? "Missing screen" : screen.kind === "route" ? routeTitle(screen.id) : realTitle(screen.id); };

/** Play mode: grid shows every step; Focus displays the current screenshot with the existing step seam. */
export function renderStoryPlayer(host: HTMLElement, story: Story | undefined, index: number, focus: boolean, h: PlayerHandlers): void {
  host.replaceChildren(); host.hidden = !story; if (!story) return;
  const path = storyPath(story); const current = Math.min(Math.max(0, index), Math.max(0, path.length - 1));
  const stage = document.createElement("section"); stage.className = focus ? "player-stage player-focus" : "player-stage player-gallery"; stage.setAttribute("aria-label", focus ? "Focused story step" : "Story steps");
  const srcFor = (id: string): string | null => { const screen = byId.get(id); return screen ? (screen.kind === "route" ? D.shotUrl(screen.id) : D.dialogUrl(screen.id) ?? D.shotUrl(screen.id)) : null; };
  if (focus) {
    const step = path[current]; const src = srcFor(step.screen); const shot = document.createElement("div"); shot.className = "player-focus-shot";
    if (src) shot.append(screenshotImage(src, `Screenshot ${step.screen}`)); else { const missing = document.createElement("span"); missing.className = "player-missing"; missing.textContent = `MISSING SCREEN · ${step.screen}`; shot.append(missing); }
    const chip = document.createElement("span"); chip.className = "player-focus-chip"; chip.textContent = `${current + 1} / ${path.length}`;
    const title = document.createElement("h2"); title.className = "player-focus-title"; title.textContent = titleFor(step.screen);
    const arrow = (direction: "prev" | "next"): HTMLButtonElement => { const next = direction === "prev" ? current - 1 : current + 1; const label = direction === "prev" ? "Previous step" : "Next step"; const button = document.createElement("button"); button.type = "button"; button.className = `player-focus-arrow ${direction}`; button.title = label; button.setAttribute("aria-label", label); button.innerHTML = iconHtml(direction === "prev" ? "caret-left" : "caret-right", label, 24); button.hidden = next < 0 || next >= path.length; button.addEventListener("click", () => h.step(next)); return button; };
    stage.append(arrow("prev"), shot, arrow("next"), chip, title);
  }
  path.forEach((step, stepIndex) => {
    if (focus) return;
    const card = document.createElement("button"); card.type = "button"; card.className = "player-card" + (stepIndex === current ? " on" : ""); card.dataset.step = String(stepIndex); card.setAttribute("aria-label", `Step ${stepIndex + 1}: ${titleFor(step.screen)}`);
    const shot = document.createElement("span"); shot.className = "player-card-shot";
    const src = srcFor(step.screen);
    if (src) shot.append(screenshotImage(src, `Screenshot ${step.screen}`)); else { const missing = document.createElement("span"); missing.className = "player-missing"; missing.textContent = `MISSING SCREEN · ${step.screen}`; shot.append(missing); }
    const chip = document.createElement("span"); chip.className = "player-step-chip"; chip.textContent = String(stepIndex + 1);
    const title = document.createElement("span"); title.className = "player-card-title"; title.textContent = titleFor(step.screen);
    card.append(chip, shot, title); card.addEventListener("click", (event) => { event.stopPropagation(); h.openFocus(stepIndex); }); stage.append(card);
  });
  host.append(stage);
  const panel = document.createElement("aside"); panel.className = "player-panel"; renderPlayerPanel(panel, story, current, focus, h); host.append(panel);
}
