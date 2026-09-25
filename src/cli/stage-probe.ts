import type { Code2FlowConfig } from "../schema/code2flow-config.js";
import { isLoopbackUrl, LOOPBACK_VIEWER_ORIGINS, type StageInfo } from "../schema/stage-bridge-protocol.js";

export type { StageInfo };

/** `frame-ancestors` lets the viewer frame the app only when it names `*`, a scheme, or the viewer's own origin. */
function frameAncestorsAllow(csp: string | null): boolean {
  const directive = csp?.split(";").map((d) => d.trim()).find((d) => d.toLowerCase().startsWith("frame-ancestors"));
  if (!directive) return true;
  const sources = directive.split(/\s+/).slice(1);
  return sources.some((s) => s === "*" || s === "http:" || LOOPBACK_VIEWER_ORIGINS.includes(s.replace(/\/$/, "")));
}

/**
 * Decides at `serve` start whether the Stage can show the live app (ADR-0008 §3): configured, loopback, answering,
 * and not refusing to be framed. Every "no" carries a one-line reason the Stage shows; the Stage then stays captured.
 */
export async function probeStage(config: Code2FlowConfig, opts: { live?: boolean } = {}, fetchImpl: typeof fetch = fetch): Promise<StageInfo> {
  const stage = config.stage ?? {}; const url = stage.url ?? config.serverUrl ?? null;
  const base = { url, origin: null, frameQuery: stage.frameQuery ?? {}, localeParam: stage.localeParam ?? null };
  const off = (reason: string): StageInfo => ({ ...base, live: false, reason });
  if (opts.live === false) return off("live view off (--no-live)");
  if (stage.live === false) return off("live view off (stage.live is false)");
  if (!url) return off("no live app configured (set stage.url or serverUrl)");
  if (!isLoopbackUrl(url)) return off(`${url} is not on this machine`);
  let res: Response;
  try { res = await fetchImpl(url, { signal: AbortSignal.timeout(2000) }); } catch { return off(`nothing answers at ${url}`); }
  const xfo = res.headers.get("x-frame-options");
  if (xfo) return off(`the app refuses framing (X-Frame-Options: ${xfo})`);
  if (!frameAncestorsAllow(res.headers.get("content-security-policy"))) return off("the app refuses framing (Content-Security-Policy frame-ancestors)");
  return { ...base, live: true, origin: new URL(url).origin, reason: `live ${url}` };
}

/** The viewer's CSP allows exactly one frame origin, only when live (exports never get one). */
export function withFrameSrc(html: string, origin: string | null): string {
  return origin ? html.replace("connect-src 'self';", () => `connect-src 'self'; frame-src ${origin};`) : html;
}
