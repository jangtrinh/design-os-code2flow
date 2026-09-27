import { isStageMessage, type AppToViewer, type ViewerToApp } from "../schema/stage-bridge-protocol.js";

export interface BridgeEvents { ready: (path: string) => void; key: (m: Extract<AppToViewer, { type: "key" }>) => void; touched: () => void }

type Omit1<T> = T extends unknown ? Omit<T, "c2f"> : never;

/**
 * Viewer side of the Stage bridge (ADR-0008 §4). A message counts only when it comes from the live app's origin
 * AND from this iframe's window — a second frame or a popup on the same origin cannot drive the Stage.
 */
export class BridgeClient {
  private seq = 0;
  private pending = new Map<number, { path: string; done: (ok: boolean) => void }>();
  private readonly onMessage = (ev: MessageEvent): void => {
    if (ev.origin !== this.origin || ev.source !== this.frame.contentWindow || !isStageMessage(ev.data)) return;
    const m = ev.data as AppToViewer;
    if (m.type === "ready") {
      // A full load (URL-only navigation, or the bridge's own location.assign fallback) answers with `ready` for the new path.
      for (const [id, p] of this.pending) if (p.path === m.path) { this.pending.delete(id); p.done(true); }
      this.events.ready(m.path);
    } else if (m.type === "navigated") { const p = this.pending.get(m.id); if (p) { this.pending.delete(m.id); p.done(true); } }
    else if (m.type === "key") this.events.key(m);
    else if (m.type === "touched") this.events.touched();
  };

  constructor(private readonly frame: HTMLIFrameElement, private readonly origin: string, private readonly events: BridgeEvents) { window.addEventListener("message", this.onMessage); }

  private post(m: Omit1<ViewerToApp>): void { this.frame.contentWindow?.postMessage({ c2f: 1, ...m }, this.origin); }
  hello(): void { this.post({ type: "hello" }); }
  live(on: boolean): void { this.post({ type: "live", on }); }
  scroll(x: number, y: number, dx: number, dy: number): void { this.post({ type: "scroll", x, y, dx, dy }); }

  /** Resolves true once the app says it moved (or reloaded) to `path`; false after `timeoutMs`. */
  navigate(path: string, timeoutMs = 4000): Promise<boolean> {
    const id = ++this.seq;
    return new Promise((done) => {
      const timer = setTimeout(() => { if (this.pending.delete(id)) done(false); }, timeoutMs);
      this.pending.set(id, { path, done: (ok) => { clearTimeout(timer); done(ok); } });
      this.post({ type: "navigate", id, path });
    });
  }

  /** Drops every pending navigation (a reload replaces them). */
  cancel(): void { for (const p of this.pending.values()) p.done(false); this.pending.clear(); }
  destroy(): void { this.cancel(); window.removeEventListener("message", this.onMessage); }
}
