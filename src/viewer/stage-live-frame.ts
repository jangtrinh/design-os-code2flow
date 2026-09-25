import { STAGE_MARKER } from "../schema/stage-bridge-protocol.js";
import { lang } from "./audience-names.js";
import { BridgeClient } from "./stage-bridge-client.js";
import type { FrameStep, StageFrame } from "./stage-frame.js";
import { t } from "./stage-strings.js";
import type { LiveLayer } from "./stage-view.js";
import type { StageInfo } from "./types.js";

const MIN_W = 1280, MIN_H = 800, MAX_SCALE = 1.25, HELLO_MS = 1500, LOAD_MS = 15000;

/**
 * The live app on the Stage (ADR-0008 §3–5): ONE iframe per Stage session, layered over the capture and shown only
 * once it has painted the step. View-only by default (inert + a shield that forwards the wheel through the bridge);
 * `E` hands the app to the presenter. Stepping or leaving Live ends Live; a touched document is reloaded pristine.
 * Without the bridge every step is a document load, and the capture covers the gap.
 */
export class LiveFrame implements LiveLayer {
  readonly available: boolean;
  interactive = false;
  private mode: "pending" | "bridge" | "url" = "pending";
  private iframe: HTMLIFrameElement | null = null; private client: BridgeClient | null = null;
  private readonly shield = document.createElement("div"); private readonly exit = document.createElement("button");
  private target: string | null = null; private painted: string | null = null; private dirty = false;
  private scale = 1; private listeners: (() => void)[] = []; private timers: number[] = [];

  constructor(private readonly frame: StageFrame, private readonly info: StageInfo) {
    this.available = info.live && !!info.origin;
    this.shield.className = "stage-shield"; this.shield.setAttribute("aria-hidden", "true");
    this.shield.addEventListener("wheel", (ev) => { ev.preventDefault(); this.forwardScroll(ev.clientX, ev.clientY, ev.deltaX, ev.deltaY); }, { passive: false });
    this.exit.type = "button"; this.exit.className = "stage-exit-live"; this.exit.textContent = t("exitLive"); this.exit.hidden = true;
    this.exit.addEventListener("click", (ev) => { ev.stopPropagation(); this.setInteractive(false); this.changed(); });
    new ResizeObserver(() => this.fit()).observe(frame.el);
  }

  get status(): string { return this.interactive ? t("liveOn") : this.mode === "url" ? `${t("liveView")} · ${t("urlOnly")}` : t("liveView"); }
  onChange(cb: () => void): void { this.listeners.push(cb); }
  private changed(): void { for (const cb of this.listeners) cb(); }

  /** The frame URL for a step: app path + configured query + the Stage marker + the Stage locale. */
  private urlFor(step: FrameStep): string | null {
    if (!step.liveUrl || !this.info.origin) return null;
    const u = new URL(step.liveUrl, this.info.origin); const out = new URL(u.pathname + u.search, this.info.origin);
    for (const [k, v] of Object.entries(this.info.frameQuery)) out.searchParams.set(k, v);
    if (this.info.localeParam) out.searchParams.set(this.info.localeParam, lang.locale);
    out.searchParams.set(STAGE_MARKER, "1");
    return out.href;
  }
  private pathOf(href: string): string { const u = new URL(href); return u.pathname + u.search; }

  show(step: FrameStep): void {
    if (!this.available) return;
    const next = this.urlFor(step);
    this.frame.el.classList.toggle("by-hand", /#/.test(step.id)); // a local-state overlay: the app opens on its parent, the presenter opens it in Live
    if (next === this.target) return;
    if (this.interactive) this.setInteractive(false, false); // stepping ends Live
    this.target = next;
    if (!next) { this.setVisible(false); return; }
    if (!this.iframe) { this.mount(next); return; }
    if (this.dirty || this.mode !== "bridge") { this.reload(next); return; }
    const want = next; // the old screen stays up until the new one has painted
    void this.client!.navigate(this.pathOf(want)).then((ok) => { if (this.target !== want) return; if (ok) { this.painted = want; this.setVisible(true); } else this.reload(want); });
  }

  private mount(src: string): void {
    const f = document.createElement("iframe"); this.iframe = f;
    f.className = "stage-live"; f.title = t("liveView"); f.inert = true;
    f.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups"); // no top navigation: the app cannot navigate the viewer away
    f.addEventListener("load", () => this.onLoad());
    this.client = new BridgeClient(f, this.info.origin!, {
      ready: (path) => { if (this.mode !== "bridge") { this.mode = "bridge"; this.changed(); } if (this.target && this.pathOf(this.target) === path) { this.painted = this.target; this.setVisible(true); } },
      key: (m) => window.dispatchEvent(new KeyboardEvent("keydown", { key: m.key, metaKey: m.meta, ctrlKey: m.ctrl, shiftKey: m.shift, bubbles: true, cancelable: true })),
      touched: () => { this.dirty = true; },
    });
    this.frame.el.append(f, this.shield, this.exit); this.fit(); this.reload(src);
  }

  private reload(src: string): void {
    this.client?.cancel(); this.dirty = false; this.painted = null; this.setVisible(false); this.iframe!.src = src;
    this.timers.push(window.setTimeout(() => { if (this.painted !== src && this.target === src) this.frame.el.dataset.liveError = "1"; }, LOAD_MS));
  }

  private onLoad(): void {
    delete this.frame.el.dataset.liveError;
    this.client!.hello(); if (this.interactive) this.client!.live(true);
    const loaded = this.target;
    // No `ready` within HELLO_MS: the app has no bridge. Show the loaded page anyway (URL-only mode).
    this.timers.push(window.setTimeout(() => { if (this.target !== loaded || this.painted === loaded) return; if (this.mode !== "bridge") { this.mode = "url"; this.changed(); } this.painted = loaded; this.setVisible(true); }, HELLO_MS));
  }

  private setVisible(on: boolean): void { this.frame.el.dataset.source = on ? "live" : "captured"; }

  setInteractive(on: boolean, restore = true): void {
    if (!this.available || !this.iframe || on === this.interactive) return;
    this.interactive = on; this.iframe.inert = !on; this.shield.hidden = on; this.exit.hidden = !(on && this.mode === "url");
    this.client?.live(on);
    if (on) { this.iframe.focus(); if (this.mode === "url") this.dirty = true; return; } // URL-only cannot tell what was touched: reload on leave
    this.iframe.blur();
    if (restore && this.dirty && this.target) this.reload(this.target);
  }

  private forwardScroll(x: number, y: number, dx: number, dy: number): void {
    if (!this.iframe || this.mode !== "bridge") return;
    const r = this.iframe.getBoundingClientRect();
    this.client!.scroll((x - r.left) / this.scale, (y - r.top) / this.scale, dx / this.scale, dy / this.scale);
  }

  /** Logical size that fills the frame (≥1280×800, scale ≤1.25) on desktop; the app's own layout at ≤1024px. */
  private fit(): void {
    if (!this.iframe) return;
    const w = this.frame.el.clientWidth, h = this.frame.el.clientHeight; const desktop = innerWidth > 1024;
    this.scale = desktop ? Math.max(0.5, Math.min(w / MIN_W, h / MIN_H, MAX_SCALE)) : 1;
    Object.assign(this.iframe.style, { width: `${Math.round(w / this.scale)}px`, height: `${Math.round(h / this.scale)}px`, transform: `scale(${this.scale})` });
  }
}
