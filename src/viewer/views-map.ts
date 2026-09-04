import { D, featureOf, routeOf, routes, storyFeature } from "./data-model.js";
import { deriveFrameEdges } from "./edge-pipeline.js";
import { el } from "./svg.js";
import type { Feature } from "./types.js";

export interface FeatureStats { routes: number; states: number; stories: number; low: number; missing: number; xf: number; edges: number }

export function featureStats(f: Feature): FeatureStats {
  const fr = routes.filter((r) => featureOf(r.id) === f.id); const { bundles, stats } = deriveFrameEdges(fr.map((r) => r.id), "inspect");
  const states = D.graph.screens.filter((s) => s.kind !== "route" && featureOf(s.id) === f.id).length;
  const stories = D.stories.filter((s) => storyFeature(s) === f.id).length;
  const low = [...stats.values()].reduce((n, s) => n + s.low, 0); const missing = bundles.filter((b) => b.missing).length; const xf = bundles.filter((b) => b.target.startsWith("portal:")).length;
  return { routes: fr.length, states, stories, low, missing, xf, edges: bundles.filter((b) => !b.target.startsWith("stub:") && !b.target.startsWith("portal:")).length };
}

/** Product map: one card per feature, cross-feature transitions bundled with counts. */
export function renderMap(view: SVGGElement, onOpen: (featureId: string) => void): void {
  const g = el("g"); const CW = 300, CH = 190, GAP = 40; const ordered = [...D.features].sort((a, b) => a.order - b.order);
  const pos: Record<string, { x: number; y: number }> = {}; ordered.forEach((f, i) => { pos[f.id] = { x: 60 + (i % 3) * (CW + GAP), y: 80 + Math.floor(i / 3) * (CH + GAP + 60) }; });
  const xf = new Map<string, number>();
  for (const e of D.graph.edges) { if (e.scope !== "screen") continue; const a = routeOf(e.source), b = routeOf(e.target); if (!a || !b) continue; const fa = featureOf(a), fb = featureOf(b); if (fa !== fb) xf.set(fa + ">" + fb, (xf.get(fa + ">" + fb) ?? 0) + 1); }
  for (const [k, n] of xf) { const [a, b] = k.split(">"); const pa = pos[a], pb = pos[b]; if (!pa || !pb) continue; const x1 = pa.x + CW / 2, y1 = pa.y, x2 = pb.x + CW / 2, y2 = pb.y; const lift = Math.abs(x2 - x1) / 3 + 40; g.append(el("path", { d: `M${x1},${y1} C${x1},${y1 - lift} ${x2},${y2 - lift} ${x2},${y2}`, class: "xedge", "marker-end": "url(#arrow)" })); const mx = (x1 + x2) / 2, my = Math.min(y1, y2) - lift * 0.75; g.append(el("rect", { x: mx - 14, y: my - 9, width: 28, height: 18, class: "pill-bg" }), el("text", { x: mx, y: my + 4, "text-anchor": "middle", class: "pill" }, String(n))); }
  for (const f of ordered) {
    const p = pos[f.id]; const s = featureStats(f); const c = el("g", { class: "card", transform: `translate(${p.x},${p.y})` });
    c.append(el("rect", { class: "bg", width: CW, height: CH, rx: 12 }));
    c.append(el("text", { x: 18, y: 38, class: "t" }, f.title)); c.append(el("text", { x: 18, y: 80, class: "big" }, String(s.routes))); c.append(el("text", { x: 18 + String(s.routes).length * 17 + 6, y: 80, class: "n" }, "routes"));
    c.append(el("text", { x: 18, y: 106, class: "n" }, `${s.states} state screens · ${s.edges} flows · ${s.stories} stories`));
    c.append(el("text", { x: 18, y: 130, class: "n" }, `${s.low} to review`)); c.append(el("text", { x: 18, y: 152, class: "n", style: s.missing ? "fill:var(--bad)" : "" }, `${s.missing} missing links · ${s.xf} cross-feature`));
    c.append(el("text", { x: 18, y: 176, class: "n", style: "fill:var(--text);text-decoration:underline" }, "Open feature page"));
    c.addEventListener("click", () => onOpen(f.id)); g.append(c);
  }
  view.append(g);
}
