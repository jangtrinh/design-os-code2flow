import { D, featureOf, routeOf, routes, storyFeature } from "./data-model.js";
import { deriveFrameEdges } from "./edge-pipeline.js";
import { el, uiScale } from "./svg.js";
import { iconSvg } from "./icons.js";
import type { Feature } from "./types.js";

export interface FeatureStats { routes: number; states: number; stories: number; low: number; missing: number; xf: number; edges: number }

/**
 * `featureOf`/`featureStats` are pure functions of `D` (never `state`), but `featureStats` alone scans every
 * edge for every feature (O(features × edges)) and both were previously recomputed on every render — every
 * selection, even a toggle that changes no data (perf audit H4, 7.7% of a 744-screen render). A cache keyed by
 * the `D` object reference self-invalidates on the next `initData()` load without editing data-model.ts.
 */
const featureOfCache = new WeakMap<typeof D, Map<string, string>>();
export function cachedFeatureOf(id: string): string {
  let m = featureOfCache.get(D); if (!m) { m = new Map(); featureOfCache.set(D, m); }
  let v = m.get(id); if (v === undefined) { v = featureOf(id); m.set(id, v); }
  return v;
}

const featureStatsCache = new WeakMap<typeof D, Map<string, FeatureStats>>();
export function featureStats(f: Feature): FeatureStats {
  let m = featureStatsCache.get(D); if (!m) { m = new Map(); featureStatsCache.set(D, m); }
  const cached = m.get(f.id); if (cached) return cached;
  const fr = routes.filter((r) => cachedFeatureOf(r.id) === f.id); const { bundles, stats } = deriveFrameEdges(fr.map((r) => r.id), "inspect");
  const states = D.graph.screens.filter((s) => s.kind !== "route" && cachedFeatureOf(s.id) === f.id).length;
  const stories = D.stories.filter((s) => storyFeature(s) === f.id).length;
  const low = [...stats.values()].reduce((n, s) => n + s.low, 0); const missing = bundles.filter((b) => b.missing).length; const xf = bundles.filter((b) => b.target.startsWith("portal:")).length;
  const result: FeatureStats = { routes: fr.length, states, stories, low, missing, xf, edges: bundles.filter((b) => !b.target.startsWith("stub:") && !b.target.startsWith("portal:")).length };
  m.set(f.id, result);
  return result;
}

/** Product map: one card per feature, cross-feature transitions bundled with counts. */
export function renderMap(view: SVGGElement, onOpen: (featureId: string) => void): void {
  const g = el("g"); const CW = 300, CH = 190, GAP = 40; const ordered = [...D.features].sort((a, b) => a.order - b.order);
  const pos: Record<string, { x: number; y: number }> = {}; ordered.forEach((f, i) => { pos[f.id] = { x: 60 + (i % 3) * (CW + GAP), y: 80 + Math.floor(i / 3) * (CH + GAP + 60) }; });
  const xf = new Map<string, number>();
  for (const e of D.graph.edges) { if (e.scope !== "screen") continue; const a = routeOf(e.source), b = routeOf(e.target); if (!a || !b) continue; const fa = cachedFeatureOf(a), fb = cachedFeatureOf(b); if (fa !== fb) xf.set(fa + ">" + fb, (xf.get(fa + ">" + fb) ?? 0) + 1); }
  for (const [k, n] of xf) {
    const [a, b] = k.split(">"); const pa = pos[a], pb = pos[b]; if (!pa || !pb) continue;
    const x1 = pa.x + CW / 2, y1 = pa.y, x2 = pb.x + CW / 2, y2 = pb.y;
    const lift = Math.max(80, Math.abs(x2 - x1) / 3 + 40); const c1 = { x: x1, y: y1 - lift }, c2 = { x: x2, y: y2 - lift };
    g.append(el("path", { d: `M${x1},${y1} C${c1.x},${c1.y} ${c2.x},${c2.y} ${x2},${y2}`, class: "xedge", "data-edge": k, "marker-end": "url(#arrow)" }));
    const mid = cubicPoint({ x: x1, y: y1 }, c1, c2, { x: x2, y: y2 }, 0.5); const label = uiScale("ui-scale center map-edge-label", mid.x, mid.y); label.dataset.edge = k;
    label.append(el("rect", { x: -14, y: -9, width: 28, height: 18, class: "pill-bg" }), el("text", { x: 0, y: 4, "text-anchor": "middle", class: "pill" }, String(n))); g.append(label);
  }
  for (const f of ordered) {
    const p = pos[f.id]; const s = featureStats(f); const c = el("g", { class: "card", transform: `translate(${p.x},${p.y})` });
    c.append(el("rect", { class: "bg", width: CW, height: CH, rx: 16 }));
    c.append(el("text", { x: 18, y: 38, class: "t" }, f.title));
    const metrics = uiScale("ui-scale", 18, 64); let mx = 0; const metric = (icon: Parameters<typeof iconSvg>[0], label: string, count: number, bad = false): void => { metrics.append(iconSvg(icon, label, mx, 0, 14), el("text", { x: mx + 18, y: 11, class: "n", style: bad ? "fill:var(--bad)" : "" }, String(count))); mx += 36; };
    metric("app-window", "Route screens", s.routes); metric("cards", "State screens", s.states); metric("path", "Story paths", s.stories); metric("flow-arrow", "Flow edges", s.edges); if (s.missing) metric("warning", "Missing screens", s.missing, true); c.append(metrics);
    c.addEventListener("click", () => onOpen(f.id)); g.append(c);
  }
  view.append(g);
}

function cubicPoint(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }, t: number): { x: number; y: number } {
  const u = 1 - t;
  return { x: u ** 3 * a.x + 3 * u ** 2 * t * b.x + 3 * u * t ** 2 * c.x + t ** 3 * d.x, y: u ** 3 * a.y + 3 * u ** 2 * t * b.y + 3 * u * t ** 2 * c.y + t ** 3 * d.y };
}
