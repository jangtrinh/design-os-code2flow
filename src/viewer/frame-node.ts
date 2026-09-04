import type { ScreenNode } from "../schema/index.js";
import { byId, D, featById, featureOf, fitText, realTitle, routeTitle, shellTargets, state, storiesOf, routeOf, textW } from "./data-model.js";
import { el, FB, frameDims, HEAD_ROUTE, HEAD_STATE, PAD, uiScale } from "./svg.js";
import { iconSvg } from "./icons.js";
import type { FrameStats, Stub } from "./types.js";

export interface FrameOpts { w?: number; preferDialog?: boolean; badge?: string | null; cls?: string; stats?: FrameStats }
export type SelectFn = (item: ScreenNode) => void;
export type OpenStoryFn = (screen: ScreenNode) => void;

/** Screen frame after the PDS PageHeader anatomy: eyebrow = feature, real title, screenshot, and footer chips. */
export function frameNode(id: string, x: number, y: number, opts: FrameOpts, onSelect: SelectFn, onOpenStory: OpenStoryFn): SVGGElement {
  const s = byId.get(id)!; const isState = s.kind !== "route";
  const dd = frameDims(id, opts.preferDialog !== false && isState, opts.w);
  const HEAD = isState ? HEAD_STATE : HEAD_ROUTE, w = dd.w, sh = dd.shot.h, fb = isState ? 0 : FB, h = dd.h, src = dd.shot.src;
  const g = el("g", { class: ["frame", isState ? "state" : "", opts.cls ?? ""].join(" "), transform: `translate(${x},${y})`, tabindex: 0, "data-node": id });
  g.append(el("rect", { class: "bg", width: w, height: h, rx: 12 }));
  const parent = isState ? byId.get(s.parentScreenId ?? "") : undefined; const routeId = parent ? parent.id : id;
  const featureTitle = featById[featureOf(id)]?.title ?? ""; const pageTitle = routeTitle(routeId);
  g.setAttribute("title", `${isState ? realTitle(id) : pageTitle} · ${routeId}`);
  const head = uiScale("ui-scale", PAD, PAD);
  const stateKind = /dialog|modal/i.test(s.kind) ? ["cards", "Modal"] as const : /menu|dropdown|popover/i.test(s.kind) ? ["cards", "Dropdown"] as const : /tooltip|hover/i.test(s.kind) ? ["cards", "Tooltip"] as const : /drawer|sheet/i.test(s.kind) ? ["cards", "Drawer"] as const : s.kind === "tab" ? ["tabs", "Tab"] as const : /wizard/i.test(s.kind) ? ["list-numbers", "Step"] as const : ["cards", "Overlay"] as const;
  const kindIcon = isState ? stateKind[0] : "app-window";
  head.append(iconSvg(kindIcon, isState ? stateKind[1] : "Route screen", 0, 0, 14), el("text", { x: 16, y: 9, class: "eyebrow" }, fitText(isState ? stateKind[1] : featureTitle.toUpperCase(), w - 2 * PAD, 10 * 0.62)));
  const title = el("text", { x: 0, y: 28, class: "title" }); const budget = w - 2 * PAD;
  if (isState && opts.w) title.append(fitText(realTitle(id), budget, 15 * 0.58));
  else if (isState) { const st = " · " + realTitle(id); const page = fitText(pageTitle, Math.max(60, budget - textW(st, 15 * 0.58)), 15 * 0.58); title.append(page); const sp = el("tspan", { class: "state-part" }); sp.textContent = fitText(st, budget - textW(page, 15 * 0.58), 15 * 0.58); title.append(sp); }
  else title.append(fitText(pageTitle, budget, 15 * 0.58));
  head.append(title);
  if (opts.badge) { const badgeIcon = opts.badge.includes("entry") ? "sign-in" : "sign-out"; const chip = uiScale("ui-scale header-chip", w - PAD - 18, PAD); chip.setAttribute("title", opts.badge); chip.setAttribute("aria-label", opts.badge); chip.append(el("rect", { x: 0, y: 0, width: 18, height: 18, rx: 9, class: "chipbg" }), iconSvg(badgeIcon, opts.badge, 3, 3, 12)); g.append(chip); }
  g.append(head);
  g.append(el("rect", { x: PAD, y: HEAD, width: w - 2 * PAD, height: sh, class: "shot-bg" }));
  if (src) g.append(el("image", { href: src, x: PAD + 1, y: HEAD + 1, width: w - 2 * PAD - 2, height: sh - 2, preserveAspectRatio: "xMinYMin slice", class: "shot" }));
  else g.append(el("text", { x: PAD + 10, y: HEAD + 24, class: "path" }, D.urls[id] ? "Uncaptured" : "No URL"));
  if (!isState) {
    const st = opts.stats ?? { inplace: 0, intra: 0, dismiss: 0, sinks: {}, low: 0 }; const chips: [string, Parameters<typeof iconSvg>[0], number?][] = [];
    const kids = D.graph.screens.filter((z) => z.parentScreenId === id).length;
    if (dd.shot.clipped) chips.push(["", "caret-down", Math.round(D.meta[id].height)]);
    if (shellTargets.has(id)) chips.push(["", "sidebar-simple"]);
    if (kids) chips.push(["", "cards", kids]); if (st.inplace) chips.push(["", "arrows-out-cardinal", st.inplace]); if (st.dismiss) chips.push(["", "arrow-u-up-left", st.dismiss]);
    for (const [, v] of Object.entries(st.sinks)) chips.push(["", "prohibit", v]); if (st.low) chips.push(["warn", "warning", st.low]);
    const chipG = uiScale("ui-scale frame-footer", PAD, HEAD + sh + PAD - 2); let cx = 0; let hidden = 0;
    for (const [c, i, n] of chips) { const digits = n === undefined ? 0 : String(n).length; const cw = 12 + (n === undefined ? 0 : 4 + digits * 6.6) + 12; if (cx + cw > w - 2 * PAD) { hidden++; continue; } const title = i === "caret-down" ? "Page continues below the fold" : `${i}${n === undefined ? "" : ` · ${n}`}`; chipG.append(el("rect", { x: cx, y: 0, width: cw, height: 20, rx: 10, class: "chipbg " + c, title }), iconSvg(i, title, cx + 6, 4, 12)); if (n !== undefined) chipG.append(el("text", { x: cx + 22, y: 14, class: "chip " + c }, String(n))); cx += cw + 4; }
    if (hidden) { const more = 12 + 4 + String(hidden).length * 6.6 + 12; chipG.append(el("rect", { x: Math.min(cx, w - 2 * PAD - more), y: 0, width: more, height: 20, rx: 10, class: "chipbg", title: `${hidden} hidden chips` }), el("text", { x: Math.min(cx, w - 2 * PAD - more) + 12, y: 14, class: "chip" }, `+${hidden}`)); }
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
  const portalTitle = featById[stub.feature ?? ""]?.title ?? stub.feature ?? "feature";
  const targetTitle = byId.has(stub.label) ? realTitle(stub.label) : stub.label;
  const [label, detail] = stub.kind === "portal"
    ? [`→ ${portalTitle}`, targetTitle]
    : stub.kind === "missing"
      ? ["Missing route", stub.label]
      : [stub.caption ?? "SINK", "Route unavailable"];
  if (stub.kind === "portal") g.setAttribute("title", `Open in ${portalTitle}`);
  g.append(el("text", { x: 10, y: 18, style: "fill:var(--text2)" }, label)); g.append(el("text", { x: 10, y: 34, class: "path", style: "fill:var(--text)" }, detail));
  if (stub.kind === "portal") g.addEventListener("click", (ev) => { ev.stopPropagation(); onPortal(stub.feature ?? "", stub.label); });
  return g;
}
