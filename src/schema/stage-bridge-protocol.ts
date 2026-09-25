/**
 * Stage bridge protocol (ADR-0008 §4): the only contract between the viewer's Stage (127.0.0.1:4317) and the
 * target app framed inside it (another loopback origin). Messages go through `postMessage`; both sides check the
 * origin and the source window. Shared by the viewer, the bridge snippet and the CLI — no DOM or Node imports.
 */
export const STAGE_PROTOCOL_VERSION = 1;
/** Query marker the Stage adds to every frame URL; the bridge activates only when it is present and the page is framed. */
export const STAGE_MARKER = "c2f-stage";
export const VIEWER_PORT = 4317;
export const LOOPBACK_VIEWER_ORIGINS: readonly string[] = [`http://127.0.0.1:${VIEWER_PORT}`, `http://localhost:${VIEWER_PORT}`, `http://[::1]:${VIEWER_PORT}`];

export type ViewerToApp =
  | { c2f: 1; type: "hello" }
  | { c2f: 1; type: "navigate"; id: number; path: string }
  | { c2f: 1; type: "scroll"; x: number; y: number; dx: number; dy: number }
  | { c2f: 1; type: "live"; on: boolean };
export type AppToViewer =
  | { c2f: 1; type: "ready"; version: number; path: string }
  | { c2f: 1; type: "navigated"; id: number; path: string }
  | { c2f: 1; type: "key"; key: string; meta: boolean; ctrl: boolean; shift: boolean }
  | { c2f: 1; type: "touched" };
export type StageMessage = ViewerToApp | AppToViewer;

const TYPES = new Set(["hello", "navigate", "scroll", "live", "ready", "navigated", "key", "touched"]);
/** Shape check only: callers still verify `event.origin` and `event.source` before trusting a message. */
export function isStageMessage(data: unknown): data is StageMessage {
  if (!data || typeof data !== "object") return false;
  const m = data as Record<string, unknown>;
  if (m.c2f !== 1 || typeof m.type !== "string" || !TYPES.has(m.type)) return false;
  if (m.type === "navigate") return typeof m.id === "number" && typeof m.path === "string";
  if (m.type === "navigated") return typeof m.id === "number" && typeof m.path === "string";
  if (m.type === "scroll") return [m.x, m.y, m.dx, m.dy].every((n) => typeof n === "number" && Number.isFinite(n));
  if (m.type === "ready") return typeof m.version === "number" && typeof m.path === "string";
  if (m.type === "key") return typeof m.key === "string";
  if (m.type === "live") return typeof m.on === "boolean";
  return true;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
/** http(s) URL whose host is exactly a loopback name (ADR-0001: the live frame never points at another machine). */
export function isLoopbackUrl(value: string): boolean {
  let u: URL;
  try { u = new URL(value); } catch { return false; }
  return (u.protocol === "http:" || u.protocol === "https:") && LOOPBACK_HOSTS.has(u.hostname) && !u.username && !u.password;
}

/** A path on the frame's own origin: `/x?y#z`, never `//host`, a scheme, or a backslash trick. */
export function isSameOriginPath(path: string): boolean {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") && !/[\u0000-\u001f]/.test(path);
}

/** What the viewer's Stage knows about the live app (`/data/stage.json`; exports carry `live: false`). */
export interface StageInfo { live: boolean; url: string | null; origin: string | null; reason: string; frameQuery: Record<string, string>; localeParam: string | null }

/** Presenter keys the bridge may forward from a Live frame (ADR-0008 §5). */
export const PRESENTER_KEYS: readonly string[] = ["ArrowLeft", "ArrowRight", "PageUp", "PageDown", "e", "c", "n", "i", "l", "f", "?", "Escape"];
