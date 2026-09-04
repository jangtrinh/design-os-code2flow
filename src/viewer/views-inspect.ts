import dagre from "@dagrejs/dagre";
import { byId, D, featById, routeOf, routes, featureOf, shellTargets, state, storiesOf } from "./data-model.js";
import { deriveFrameEdges } from "./edge-pipeline.js";
import { drawBundle, type Pos } from "./edges-draw.js";
import { frameNode, stubNode, type OpenStoryFn, type SelectFn } from "./frame-node.js";
import { el, frameDims, SW } from "./svg.js";
import type { Bundle, Story } from "./types.js";

export interface InspectHandlers { onSelect: SelectFn; onSelectBundle: (b: Bundle) => void; onOpenStory: OpenStoryFn; onPortal: (feature: string, target: string) => void }

/** Feature overview (route frames collapsed) or story canvas (member frames expanded with their State Screens). Dagre LR, deterministic (sorted ids). */
export function renderInspect(view: SVGGElement, h: InspectHandlers): { scope: string[]; bundles: Bundle[] } {
  const f = featById[state.feature ?? ""]; const story: Story | undefined = state.story ? D.stories.find((s) => s.id === state.story) : undefined;
  const frameIds = f ? routes.filter((r) => featureOf(r.id) === f.id).map((r) => r.id) : [];
  const missing = story ? story.screens.filter((id) => !byId.has(id)) : []; // UC-04: manifest screens the code lacks are shown, not dropped
  const storyFrames = story ? new Set(story.screens.map((id) => routeOf(id))) : null;
  const scope = story ? frameIds.filter((id) => storyFrames!.has(id)) : frameIds;
  const { bundles, stubs, stats } = deriveFrameEdges(scope, "inspect");
  const g = new dagre.graphlib.Graph({ multigraph: true }); g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 160, marginx: 60, marginy: 60 }); g.setDefaultEdgeLabel(() => ({}));
  const expanded = new Set(scope); // State Screens are always visible beside their parent Route Screen.
  type Size = { w: number; h: number; kids: { id: string }[]; cols: number; rows: number[]; base: { w: number; h: number } };
  const size = (id: string): Size => {
    const base = frameDims(id, false);
    if (!expanded.has(id)) return { w: base.w, h: base.h, kids: [], cols: 1, rows: [], base };
    const kids = D.graph.screens.filter((z) => z.parentScreenId === id && (!story || story.screens.includes(z.id)));
    const cols = Math.max(1, Math.floor((base.w - 20) / (SW + 20))); const rows: number[] = [];
    kids.forEach((k, i) => { const kd = frameDims(k.id, true, SW); const r = Math.floor(i / cols); rows[r] = Math.max(rows[r] ?? 0, kd.h); });
    const extra = rows.reduce((a, b) => a + b + 12, 0);
    return { w: base.w, h: base.h + (kids.length ? extra + 12 : 0), kids, cols, rows, base };
  };
  const sizes: Record<string, Size> = {}; for (const id of [...scope].sort()) { sizes[id] = size(id); g.setNode(id, { width: sizes[id].w, height: sizes[id].h }); }
  for (const s of stubs) g.setNode(s.id, { width: s.kind === "portal" ? 260 : 200, height: 44 });
  [...bundles].sort((a, b) => (a.source + a.target).localeCompare(b.source + b.target)).forEach((b, i) => { if (g.hasNode(b.source) && g.hasNode(b.target)) g.setEdge(b.source, b.target, {}, "b" + i); });
  const linked = new Set(bundles.flatMap((b) => [b.source, b.target]));
  dagre.layout(g);
  const pos: Record<string, Pos> = {}; for (const id of g.nodes()) { const n = g.node(id); pos[id] = { x: n.x - n.width / 2, y: n.y - n.height / 2, w: n.width, h: n.height }; }
  const unl = story ? [] : scope.filter((id) => !linked.has(id) && !shellTargets.has(id));
  let ux = Math.max(...Object.values(pos).map((p) => p.x + p.w), 0) + 160, uy = 60;
  for (const id of unl) { const d = frameDims(id, false); pos[id] = { x: ux, y: uy, w: d.w, h: d.h }; uy += d.h + 30; }
  const eg = el("g"), ng = el("g");
  bundles.forEach((b) => drawBundle(eg, b, pos, h.onSelectBundle));
  for (const id of scope) {
    const p = pos[id]; if (!p) continue;
    const node = frameNode(id, p.x, p.y, { stats: stats.get(id), badge: unl.includes(id) ? "unlinked" : null, cls: state.selected && "id" in state.selected && state.selected.id === id ? "selected" : "" }, h.onSelect, h.onOpenStory);
    if (expanded.has(id)) { const sz = sizes[id]; let yy = sz.base.h + 12; sz.kids.forEach((k, i) => { const c = i % sz.cols, r = Math.floor(i / sz.cols); if (c === 0 && i > 0) yy += sz.rows[r - 1] + 12; node.append(frameNode(k.id, 20 + c * (SW + 20), yy, { w: SW, preferDialog: true }, h.onSelect, h.onOpenStory)); }); node.querySelector("rect.bg")!.setAttribute("height", String(p.h)); }
    ng.append(node);
  }
  for (const s of stubs) { const p = pos[s.id]; if (p) ng.append(stubNode(s, p.x, p.y, h.onPortal)); }
  if (unl.length) ng.append(el("text", { x: ux, y: 40, class: "lane-meta" }, `Unlinked · ${unl.length} (no inter-frame edge, not in sidebar)`));
  if (missing.length) { ng.append(el("text", { x: ux, y: uy + 20, class: "lane-meta", style: "fill:var(--bad)" }, `Not in code · ${missing.length} (named by the story, no such screen)`)); missing.forEach((id, i) => ng.append(stubNode({ id, kind: "missing", label: id, caption: "MISSING SCREEN · in PRD, not in code" }, ux, uy + 32 + i * 56, () => {}))); }
  view.append(eg, ng);
  return { scope, bundles };
}
