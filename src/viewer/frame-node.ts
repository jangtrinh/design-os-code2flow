import type { ScreenNode } from "../schema/index.js";
import { byId, D, featById, featureOf, fitText, realTitle, routeTitle, shellTargets, state, storiesOf, routeOf, textW } from "./data-model.js";
import { el, FB, frameDims, HEAD_ROUTE, HEAD_STATE, PAD, uiScale } from "./svg.js";
import type { FrameStats, Stub } from "./types.js";

export interface FrameOpts { w?: number; preferDialog?: boolean; badge?: string | null; cls?: string; stats?: FrameStats }
export type SelectFn = (item: ScreenNode) => void;
export type OpenStoryFn = (screen: ScreenNode) => void;

/** Screen frame after the PDS PageHeader anatomy: eyebrow = feature, title = real h1 · real state title, route in mono, screenshot on white, footer chips. */
export function frameNode(id: string, x: number, y: number, opts: FrameOpts, onSelect: SelectFn, onOpenStory: OpenStoryFn): SVGGElement {
  const s = byId.get(id)!; const isState = s.kind !== "route";
  const dd = frameDims(id, opts.preferDialog !== false && isState, opts.w);
  const HEAD = isState ? HEAD_STATE : HEAD_ROUTE, w = dd.w, sh = dd.shot.h, fb = isState ? 0 : FB, h = dd.h, src = dd.shot.src;
  const g = el("g", { class: ["frame", isState ? "state" : "", opts.cls ?? ""].join(" "), transform: `translate(${x},${y})`, tabindex: 0, "data-node": id });
  g.append(el("rect", { class: "bg", width: w, height: h, rx: 12 }));
  const parent = isState ? byId.get(s.parentScreenId ?? "") : undefined; const routeId = parent ? parent.id : id;
  const featureTitle = featById[featureOf(id)]?.title ?? ""; const pageTitle = routeTitle(routeId);
  const head = uiScale("ui-scale", PAD, PAD);
  head.append(el("text", { x: 0, y: 9, class: "eyebrow" }, fitText(featureTitle.toUpperCase(), (w - 2 * PAD) * 0.55, 10 * 0.62)));
  const pathG = uiScale("ui-scale right", w - PAD, PAD);
  pathG.append(el("text", { x: 0, y: 9, class: "path", "text-anchor": "end" }, fitText(routeId + (s.dynamic ? " [dynamic]" : "") + (s.catchAll ? " [catch-all]" : "") + (s.routeAsModal ? " [route as modal]" : ""), (w - 2 * PAD) * 0.45, 11 * 0.6)));
  const title = el("text", { x: 0, y: 30, class: "title" }); const budget = w - 2 * PAD;
  if (isState && opts.w) title.append(fitText(realTitle(id), budget, 15 * 0.58));
  else if (isState) { const st = " · " + realTitle(id); const page = fitText(pageTitle, Math.max(60, budget - textW(st, 15 * 0.58)), 15 * 0.58); title.append(page); const sp = el("tspan", { class: "state-part" }); sp.textContent = fitText(st, budget - textW(page, 15 * 0.58), 15 * 0.58); title.append(sp); }
  else title.append(fitText(pageTitle, budget, 15 * 0.58));
  head.append(title); g.append(head, pathG);
  g.append(el("rect", { x: PAD, y: HEAD, width: w - 2 * PAD, height: sh, class: "shot-bg" }));
  if (src) g.append(el("image", { href: src, x: PAD + 1, y: HEAD + 1, width: w - 2 * PAD - 2, height: sh - 2, preserveAspectRatio: "xMinYMin slice", class: "shot" }));
  else g.append(el("text", { x: PAD + 10, y: HEAD + 24, class: "path" }, D.urls[id] ? "Uncaptured" : "No URL"));
  if (opts.badge) { const bw = opts.badge.length * 6.2 + 14; const bg = uiScale("ui-scale right", w - PAD, HEAD + 8); bg.append(el("rect", { x: -bw, y: 0, width: bw, height: 18, rx: 6, class: "chipbg" }), el("text", { x: -bw / 2, y: 13, "text-anchor": "middle", class: "chip" }, opts.badge)); g.append(bg); }
  if (!isState) {
    const st = opts.stats ?? { inplace: 0, intra: 0, dismiss: 0, sinks: {}, low: 0 }; const chips: [string, string][] = [];
    const kids = D.graph.screens.filter((z) => z.parentScreenId === id).length;
    if (dd.shot.clipped) chips.push([`continues ${Math.round(D.meta[id].height)} px tall`, ""]);
    if (shellTargets.has(id)) chips.push(["in sidebar", ""]);
    if (kids) chips.push([`${kids} states`, ""]); if (st.inplace) chips.push([`in-place ${st.inplace}`, ""]); if (st.dismiss) chips.push([`closes ${st.dismiss}`, ""]);
    for (const [k, v] of Object.entries(st.sinks)) chips.push([`to ${k} ×${v}`, ""]); if (st.low) chips.push([`review ${st.low}`, "warn"]);
    const chipG = uiScale("ui-scale", PAD, HEAD + sh + PAD - 2); let cx = 0;
    for (const [t, c] of chips) { const cw = t.length * 6 + 12; if (cx + cw > w - 2 * PAD) break; chipG.append(el("rect", { x: cx, y: 0, width: cw, height: 18, rx: 9, class: "chipbg " + c }), el("text", { x: cx + cw / 2, y: 13, "text-anchor": "middle", class: "chip " + c }, t)); cx += cw + 6; }
    g.append(chipG);
  }
  g.addEventListener("click", (ev) => { ev.stopPropagation(); onSelect(s); });
  g.addEventListener("dblclick", (ev) => { ev.stopPropagation(); if (state.mode === "inspect" && storiesOf(routeOf(id) ?? id)[0]) onOpenStory(s); });
  return g;
}

export function stubNode(stub: Stub, x: number, y: number, onPortal: (feature: string, target: string) => void): SVGGElement {
  const w = stub.kind === "portal" ? 260 : stub.caption ? 300 : 200, h = 44;
  const g = el("g", { class: "stub " + (stub.kind === "missing" ? "bad" : ""), transform: `translate(${x},${y})`, "data-node": stub.id });
  g.append(el("rect", { class: "bg", width: w, height: h, rx: 8 }));
  const label = stub.caption ?? (stub.kind === "portal" ? `→ ${featById[stub.feature ?? ""]?.title ?? stub.feature}` : stub.kind === "missing" ? "MISSING ROUTE" : "SINK");
  g.append(el("text", { x: 10, y: 18, style: "fill:var(--text2)" }, label)); g.append(el("text", { x: 10, y: 34, class: "path", style: "fill:var(--text)" }, stub.label.slice(0, 36)));
  if (stub.kind === "portal") g.addEventListener("click", (ev) => { ev.stopPropagation(); onPortal(stub.feature ?? "", stub.label); });
  return g;
}
