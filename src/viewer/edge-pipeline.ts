import type { ActionEdge } from "../schema/index.js";
import { byId, D, DISMISS, featureOf, RANK, routeOf } from "./data-model.js";
import type { Bundle, FrameStats, Stub } from "./types.js";

export interface FrameEdges { bundles: Bundle[]; stubs: Stub[]; stats: Map<string, FrameStats> }

/**
 * Council rules 1–8 as a pure function: fold self-loops and in-frame hops into chips, hide dismiss
 * edges, bundle parallel triggers, portal stubs for other features, one sink per kind, shell hidden.
 */
export function deriveFrameEdges(frameIds: string[], mode: "inspect" | "present"): FrameEdges {
  const inFeature = new Set(frameIds);
  const stats = new Map<string, FrameStats>();
  const st = (id: string): FrameStats => { let s = stats.get(id); if (!s) { s = { inplace: 0, intra: 0, dismiss: 0, sinks: {}, low: 0 }; stats.set(id, s); } return s; };
  const bundles = new Map<string, Bundle>();
  const stubs = new Map<string, Stub>();
  const addB = (s: string, t: string, e: ActionEdge): void => { const k = s + ">" + t; const b = bundles.get(k) ?? { source: s, target: t, edges: [], primary: e, confidence: e.confidence, missing: false }; b.edges.push(e); bundles.set(k, b); };
  for (const e of D.graph.edges) {
    if (e.scope !== "screen") continue;
    const sf = routeOf(e.source); if (!sf || !inFeature.has(sf)) continue;
    if (e.confidence === "low") st(sf).low++;
    const tf = routeOf(e.target);
    if (!tf) {
      const kind = e.target.split(":")[0];
      if (kind === "missing") { const id = "stub:missing:" + e.target; stubs.set(id, { id, kind: "missing", label: e.target.slice(8) }); addB(sf, id, e); }
      else { const s = st(sf).sinks; s[kind] = (s[kind] ?? 0) + 1; if (kind === "not-found" && mode === "inspect") { const id = "stub:not-found"; stubs.set(id, { id, kind: "not-found", label: "404 / not found" }); addB(sf, id, e); } }
      continue;
    }
    if (sf === tf) {
      if (e.source === e.target) st(sf).inplace++;
      else { const s = byId.get(e.source), t = byId.get(e.target); if (s && t && s.parentScreenId === t.id && DISMISS.test(e.trigger)) st(sf).dismiss++; else st(sf).intra++; }
      continue;
    }
    if (!inFeature.has(tf)) { const id = "portal:" + tf; stubs.set(id, { id, kind: "portal", feature: featureOf(tf), label: tf }); addB(sf, id, e); continue; }
    addB(sf, tf, e);
  }
  for (const b of bundles.values()) {
    b.edges.sort((a, c) => RANK[c.confidence] - RANK[a.confidence] || (DISMISS.test(a.trigger) ? 1 : 0) - (DISMISS.test(c.trigger) ? 1 : 0) || a.trigger.length - c.trigger.length);
    b.primary = b.edges[0]; b.confidence = b.primary.confidence; b.missing = b.target.startsWith("stub:missing");
  }
  return { bundles: [...bundles.values()], stubs: [...stubs.values()], stats };
}

/** Edges between the screens of one story lane (any pair), bundled; dismiss edges optional. */
export function laneBundles(items: string[], showDismiss: boolean): Bundle[] {
  const out: Bundle[] = []; const seen = new Set<string>();
  for (const e of D.graph.edges) {
    if (e.scope !== "screen") continue;
    const a = items.indexOf(e.source), b = items.indexOf(e.target); if (a < 0 || b < 0 || a === b) continue;
    const s = byId.get(e.source), t = byId.get(e.target);
    if (!showDismiss && s && t && s.parentScreenId === t.id && DISMISS.test(e.trigger)) continue;
    const k = a + ">" + b; if (seen.has(k)) continue; seen.add(k);
    const all = D.graph.edges.filter((x) => x.scope === "screen" && x.source === e.source && x.target === e.target).sort((p, q) => RANK[q.confidence] - RANK[p.confidence]);
    out.push({ source: e.source, target: e.target, edges: all, primary: all[0], confidence: all[0].confidence, missing: false });
  }
  return out;
}
