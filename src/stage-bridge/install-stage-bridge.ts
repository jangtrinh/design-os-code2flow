/**
 * `design-os-code2flow/stage-bridge` (ADR-0008 §4): a dependency-free snippet the target app installs in development,
 * next to its router. It lets the Code2Flow Stage (another loopback origin) move the app to a step without a
 * document reload, scroll it while view-only, and get presenter keys back while Live. It never sends DOM content,
 * cookies or storage: only the current path, key names, and "the presenter touched the page".
 *
 *   import { installStageBridge } from "design-os-code2flow/stage-bridge";
 *   if (import.meta.env.DEV) installStageBridge({ navigate: (path) => router.navigate(path) });
 */
import { isLoopbackUrl, isSameOriginPath, isStageMessage, LOOPBACK_VIEWER_ORIGINS, PRESENTER_KEYS, STAGE_MARKER, STAGE_PROTOCOL_VERSION, type AppToViewer, type ViewerToApp } from "../schema/stage-bridge-protocol.js";

export interface StageBridgeOptions {
  /** Client-side navigation to a same-origin path (your router). Omitted = `location.assign` (a full load). */
  navigate?: (path: string) => void | Promise<void>;
  /** Extra viewer origins; only loopback origins are accepted. */
  viewerOrigins?: string[];
}

// What owns which key while Live: a text field owns typed characters; controls that move with arrows own the arrows; popups own Escape.
const OWNS_TEXT = "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]),textarea,[contenteditable=''],[contenteditable=true],[role=textbox],[role=combobox],[role=searchbox]";
const OWNS_ARROWS = `${OWNS_TEXT},select,[role=tab],[role=listbox],[role=menu],[role=slider],[role=radio],[role=radiogroup]`;
const OWNS_ESCAPE = "dialog[open],[role=dialog],[aria-modal=true],[role=combobox],[role=listbox],[role=menu]";
const ARROWS = new Set(["ArrowLeft", "ArrowRight", "PageUp", "PageDown"]);
const FORWARD = new Set(PRESENTER_KEYS);

const here = (): string => location.pathname + location.search + location.hash;
const nextPaint = (): Promise<void> => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok())));

/** Nearest scrollable ancestor under (x, y) in the direction of travel, else the page. */
function scrollableAt(x: number, y: number, axis: "x" | "y", dir: number): Element | null {
  let el: Element | null = document.elementFromPoint(x, y);
  while (el) {
    const cs = getComputedStyle(el); const overflow = axis === "y" ? cs.overflowY : cs.overflowX;
    const [size, client, pos] = axis === "y" ? [el.scrollHeight, el.clientHeight, el.scrollTop] : [el.scrollWidth, el.clientWidth, el.scrollLeft];
    if (/auto|scroll/.test(overflow) && size > client && (dir > 0 ? size - client - pos > 1 : pos > 0)) return el;
    el = el.parentElement;
  }
  return document.scrollingElement;
}

/** Installs the bridge when this page is framed by the Stage; returns an uninstall function (a no-op when inactive). */
export function installStageBridge(options: StageBridgeOptions = {}): () => void {
  if (typeof window === "undefined" || window.top === window.self || !new URLSearchParams(location.search).has(STAGE_MARKER)) return () => {};
  const allowed = new Set([...LOOPBACK_VIEWER_ORIGINS, ...(options.viewerOrigins ?? []).filter(isLoopbackUrl).map((o) => new URL(o).origin)]);
  let viewer: string | null = null; let live = false;
  const post = (m: AppToViewer, origin: string | null = viewer): void => { if (origin) window.parent.postMessage(m, origin); };

  const onMessage = async (ev: MessageEvent): Promise<void> => {
    if (ev.source !== window.parent || !allowed.has(ev.origin) || !isStageMessage(ev.data)) return;
    viewer = ev.origin; const m = ev.data as ViewerToApp;
    if (m.type === "hello") post({ c2f: 1, type: "ready", version: STAGE_PROTOCOL_VERSION, path: here() });
    else if (m.type === "live") live = m.on;
    else if (m.type === "scroll") { if (m.dy) scrollableAt(m.x, m.y, "y", m.dy)?.scrollBy({ top: m.dy, behavior: "instant" }); if (m.dx) scrollableAt(m.x, m.y, "x", m.dx)?.scrollBy({ left: m.dx, behavior: "instant" }); }
    else if (m.type === "navigate" && isSameOriginPath(m.path)) {
      if (!options.navigate) { location.assign(m.path); return; } // the new document announces itself with `ready`
      await options.navigate(m.path); await nextPaint();
      post({ c2f: 1, type: "navigated", id: m.id, path: here() });
    }
  };
  const onKey = (ev: KeyboardEvent): void => {
    if (!live || !viewer) return;
    const key = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key; const target = ev.target as Element | null;
    const palette = (ev.metaKey || ev.ctrlKey) && key === "k";
    const owned = key === "Escape" ? !!document.querySelector(OWNS_ESCAPE) || !!target?.closest?.(OWNS_ESCAPE) : ARROWS.has(key) ? !!target?.closest?.(OWNS_ARROWS) : !!target?.closest?.(OWNS_TEXT);
    if (!palette && (ev.metaKey || ev.ctrlKey || ev.altKey || !FORWARD.has(key) || owned)) { post({ c2f: 1, type: "touched" }); return; }
    ev.preventDefault();
    post({ c2f: 1, type: "key", key: ev.key, meta: ev.metaKey, ctrl: ev.ctrlKey, shift: ev.shiftKey });
  };
  const onPointer = (): void => { if (live) post({ c2f: 1, type: "touched" }); };

  window.addEventListener("message", onMessage);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("pointerdown", onPointer, true);
  // Announce this document to the parent: its exact origin when the browser tells us (ancestorOrigins, referrer), else every allowed origin.
  const parentGuess = [(location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins?.[0], document.referrer && new URL(document.referrer).origin].find((o) => o && allowed.has(o));
  for (const origin of parentGuess ? [parentGuess] : allowed) post({ c2f: 1, type: "ready", version: STAGE_PROTOCOL_VERSION, path: here() }, origin);
  return () => { window.removeEventListener("message", onMessage); window.removeEventListener("keydown", onKey, true); window.removeEventListener("pointerdown", onPointer, true); };
}
