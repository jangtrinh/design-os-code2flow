import { t } from "./stage-strings.js";

/** What the frame needs to show one step: its capture, the live URL (null = no URL reaches it), and why it may be empty. */
export interface FrameStep { id: string; captureSrc: string | null; liveUrl: string | null; missing: boolean; alt: string }

/**
 * The Stage's frame (ADR-0008 §3): the captured Screen Preview is always there and always first; the live app,
 * when available, is layered on top by `stage-live-frame.ts` once it has painted. Captured screens scroll like the page.
 */
export class StageFrame {
  readonly el = document.createElement("div");
  readonly capture = document.createElement("div");
  private readonly image = document.createElement("img");
  private readonly empty = document.createElement("p");
  private shownId: string | null = null;

  constructor() {
    this.el.className = "stage-frame"; this.el.dataset.source = "captured";
    this.capture.className = "stage-capture"; this.capture.tabIndex = 0; // the capture scrolls with the keyboard too
    this.image.decoding = "async"; this.image.draggable = false;
    this.image.addEventListener("error", () => { this.image.hidden = true; this.empty.hidden = false; this.empty.textContent = t("captured") + " · —"; });
    this.empty.className = "stage-empty"; this.empty.hidden = true;
    this.capture.append(this.image, this.empty); this.el.append(this.capture);
  }

  /** Shows a step's capture; the scroll position resets only when the step changes. */
  show(step: FrameStep): void {
    const changed = step.id !== this.shownId; this.shownId = step.id;
    this.capture.setAttribute("aria-label", step.alt);
    if (step.captureSrc) {
      if (this.image.getAttribute("src") !== step.captureSrc) this.image.src = step.captureSrc;
      this.image.alt = step.alt; this.image.hidden = false; this.empty.hidden = true;
    } else {
      this.image.hidden = true; this.image.removeAttribute("src"); this.empty.hidden = false;
      this.empty.textContent = step.missing ? t("missing") : `${t("captured")} · —`;
    }
    this.el.classList.toggle("missing", step.missing);
    if (changed) this.capture.scrollTop = 0;
  }
}
