import { byId, D, escapeHtml as esc, featById, featureOf, normalizeSteps, realTitle, routeTitle, routes, state, storyFeature, storyPath } from "./data-model.js";
import { laneBundles } from "./edge-pipeline.js";
import { pill, type Pos } from "./edges-draw.js";
import { frameNode, stubNode, type OpenStoryFn, type SelectFn } from "./frame-node.js";
import { el, frameDims, uiScale } from "./svg.js";
import { iconHtml, iconSvg } from "./icons.js";
import type { Bundle, Story, StoryStep } from "./types.js";

export interface PresentHandlers { onSelect: SelectFn; onSelectBundle: (b: Bundle) => void; onOpenStory: OpenStoryFn; onStep: (storyId: string, step: number) => void; onToggleTray: () => void }

const MISSING_W = 300, MISSING_H = 44, PAD = 40, GAP = 150, ROW_GAP = 60, BRANCH_INDENT = 60;
/** A story screen the graph does not contain (UC-07): drawn as a red stub in its lane, never dropped. */
const dims = (id: string): { w: number; h: number } => (byId.has(id) ? frameDims(id, true) : { w: MISSING_W, h: MISSING_H });
const missingStub = (id: string): Parameters<typeof stubNode>[0] => ({ id, kind: "missing", label: id, caption: "MISSING SCREEN · in PRD, not in code" });

interface Row { key: string; title: string | null; steps: StoryStep[]; from?: string; x0: number; y: number; h: number }

/** Rows of one lane: the main path, then one indented sub-row per v2 branch, starting under its `from` screen. */
function layoutRows(story: Story, y0: number): { rows: Row[]; pos: Record<string, Pos>; width: number; height: number } {
  const pos: Record<string, Pos> = {}; const rows: Row[] = []; let y = y0; let width = 0;
  const place = (row: Row): void => {
    const ds = row.steps.map((s) => dims(s.screen)); row.h = Math.max(0, ...ds.map((d) => d.h)); let x = row.x0;
    row.steps.forEach((s, i) => { pos[row.key + ":" + s.screen] = { x, y: row.y, w: ds[i].w, h: ds[i].h }; x += ds[i].w + GAP; });
    width = Math.max(width, x - GAP); rows.push(row); y = row.y + row.h + ROW_GAP;
  };
  place({ key: "main", title: null, steps: storyPath(story), x0: 40 + PAD, y, h: 0 });
  for (const [i, b] of (story.branches ?? []).entries()) {
    const fromPos = pos["main:" + b.from];
    place({ key: "b" + i, title: b.title, from: b.from, steps: normalizeSteps(b.steps), x0: (fromPos?.x ?? 40 + PAD) + BRANCH_INDENT, y: y + 24, h: 0 });
  }
  return { rows, pos, width, height: y - y0 - ROW_GAP };
}

/** One bundle per detected transition between two chain neighbours; `null` = asserted by the PRD, not found in code. */
function chainBundle(a: string, b: string): Bundle | null { return laneBundles([a, b], true).find((x) => x.source === a && x.target === b) ?? null; }

/** Present mode: one swimlane per story: v2 main path + branch sub-rows, entry/exit chips, `via` labels; v1 stories use `screens` order. */
export function renderLanes(view: SVGGElement, h: PresentHandlers): { story: Story | undefined; stepId: string | undefined } {
  const f = featById[state.feature ?? ""]; const fs = f ? D.stories.filter((s) => storyFeature(s) === f.id) : []; const g = el("g"); let y = 60; const laneGap = 70;
  const inStory = new Set(fs.flatMap((s) => s.screens)); const activeStory = state.story ?? fs[0]?.id; const st = fs.find((s) => s.id === activeStory);
  const path = st ? storyPath(st) : []; const stepId = path[Math.min(state.step, Math.max(0, path.length - 1))]?.screen;
  for (const story of fs) {
    const active = story.id === activeStory; const missing = story.screens.filter((id) => !byId.has(id)); const exits = new Set(story.exit ?? []);
    const { rows, pos, width, height } = layoutRows(story, y + 60 + PAD / 2);
    const laneH = height + 60 + PAD + 30 + (active ? 40 : 0); const laneW = width + 2 * PAD;
    const lane = el("g"); lane.append(el("rect", { x: 20, y, width: laneW, height: laneH, rx: 16, class: "lane" }));
    const lt = uiScale("ui-scale", 44, y + 14); lt.append(el("text", { x: 0, y: 14, class: "lane-title" }, story.title)); lane.append(lt);
    const meta = uiScale("ui-scale", 44, y + 34); let metaX = 0;
    const metaChip = (icon: Parameters<typeof iconSvg>[0], label: string, count?: number, bad = false): void => { meta.append(iconSvg(icon, label, metaX, 0, 14), ...(count === undefined ? [] : [el("text", { x: metaX + 18, y: 11, class: "lane-meta", style: bad ? "fill:var(--bad)" : "" }, String(count))])); metaX += count === undefined ? 22 : 34; };
    metaChip("stack", "Screens", story.screens.length); metaChip("sign-in", "Entry"); if (story.branches?.length) metaChip("git-branch", "Branches", story.branches.length); if (missing.length) metaChip("warning", "Missing screens", missing.length, true); lane.append(meta);
    const eg = el("g"), ng = el("g");
    const edge = (P: Pos, Q: Pos, b: Bundle | null, via: string | undefined, faded: boolean, down: boolean): void => {
      const d = down ? `M${P.x + P.w / 2},${P.y + P.h} C${P.x + P.w / 2},${Q.y - 30} ${Q.x - 40},${Q.y + 20} ${Q.x},${Q.y + 20}` : `M${P.x + P.w},${P.y + 24} C${P.x + P.w + 60},${P.y + 24} ${Q.x - 60},${Q.y + 24} ${Q.x},${Q.y + 24}`;
      const cls = ["edge", b ? b.confidence : "asserted missing", faded ? "faded" : ""].join(" ");
      const p = el("path", { d, class: cls, "marker-end": "url(#arrow)" }); eg.append(p);
      if (b) { const hit = el("path", { d, class: "hit" }); hit.addEventListener("click", (ev) => { ev.stopPropagation(); h.onSelectBundle(b); }); eg.append(hit); }
      if (faded) return;
      const label: Bundle = b ? { ...b, primary: { ...b.primary, trigger: via ?? b.primary.trigger } } : { source: P.x + "", target: Q.x + "", edges: [], primary: { id: "", source: "", target: "", trigger: (via ? via + " · " : "") + "not in code", confidence: "low", pattern: "asserted", scope: "screen", evidence: { file: "", line: 0 }, resolved: false }, confidence: "low", missing: true };
      pill(eg, down ? Q.x - 20 : (P.x + P.w + Q.x) / 2, down ? Q.y - 6 : P.y + 24, label);
    };
    for (const row of rows) {
      if (row.title) { const bt = uiScale("ui-scale", row.x0, row.y - 22); bt.append(el("text", { x: 0, y: 12, class: "lane-meta" }, `↳ ${row.title}`)); ng.append(bt); }
      row.steps.forEach((s, i) => {
        const P = pos[row.key + ":" + s.screen]; const id = s.screen; const isStep = row.key === "main" && active && i === state.step;
        const badge = [id === story.entry && row.key === "main" ? "entry" : "", exits.has(id) ? "exit" : ""].filter(Boolean).join(" · ") || null;
        const cls = (isStep ? "step" : "") + (active && stepId && !isStep ? " faded" : "") + (!active ? " faded" : "");
        const node = byId.has(id) ? frameNode(id, P.x, P.y, { preferDialog: true, badge, cls }, h.onSelect, h.onOpenStory) : stubNode(missingStub(id), P.x, P.y, () => {});
        if (!byId.has(id)) node.classList.add(...cls.split(" ").filter(Boolean));
        if (row.key === "main") node.addEventListener("dblclick", (ev) => { ev.stopPropagation(); h.onStep(story.id, i); });
        ng.append(node);
        const prev = i > 0 ? pos[row.key + ":" + row.steps[i - 1].screen] : row.from ? pos["main:" + row.from] : undefined; const prevId = i > 0 ? row.steps[i - 1].screen : row.from;
        if (prev && prevId) { const b = chainBundle(prevId, id); const faded = active && !!stepId && !(prevId === stepId || id === stepId); edge(prev, P, b, s.via, faded, i === 0); }
      });
    }
    // detected edges between non-neighbouring main-path screens (back-links, skips): thin return arcs, no pill
    const main = rows[0].steps.map((s) => s.screen);
    for (const b of laneBundles(main, state.showDismiss)) {
      const a = main.indexOf(b.source), c = main.indexOf(b.target); if (Math.abs(c - a) === 1 && c > a) continue;
      const P = pos["main:" + b.source], Q = pos["main:" + b.target]; const yb = rows[0].y + rows[0].h + 20 + Math.abs(c - a) * 14;
      const d = `M${P.x + P.w / 2},${P.y + P.h} C${P.x + P.w / 2},${yb} ${Q.x + Q.w / 2},${yb} ${Q.x + Q.w / 2},${Q.y + Q.h}`;
      const p = el("path", { d, class: ["edge", b.confidence, "return", active && stepId && !(b.source === stepId || b.target === stepId) ? "faded" : ""].join(" "), "marker-end": "url(#arrow)" }); const hit = el("path", { d, class: "hit" });
      hit.addEventListener("click", (ev) => { ev.stopPropagation(); h.onSelectBundle(b); }); eg.append(p, hit);
    }
    lane.append(eg, ng); g.append(lane); y += laneH + laneGap;
  }
  const unassigned = f ? routes.filter((r) => featureOf(r.id) === f.id && !inStory.has(r.id)) : [];
  if (unassigned.length) {
    const tray = el("g"); const cols = 6, tw = 160, th = 100, tg = 16; const rows = Math.ceil(unassigned.length / cols); const trayH = state.showTray ? 60 + rows * (th + tg) : 56;
    tray.append(el("rect", { x: 20, y, width: cols * (tw + tg) + 2 * PAD, height: trayH, rx: 16, class: "lane", style: "stroke-dasharray:6 4" }));
    tray.append(el("text", { x: 44, y: y + 28, class: "lane-title" }, `Not in a story · ${unassigned.length} routes`));
    const toggle = el("text", { x: 44, y: y + 46, class: "lane-meta", style: "cursor:pointer;text-decoration:underline" }, state.showTray ? "hide" : "show tiles"); toggle.addEventListener("click", (ev) => { ev.stopPropagation(); h.onToggleTray(); }); tray.append(toggle);
    if (state.showTray) unassigned.forEach((r, i) => { const tx = 40 + PAD + (i % cols) * (tw + tg), ty = y + 60 + Math.floor(i / cols) * (th + tg); const t = el("g", { class: "tile", transform: `translate(${tx},${ty})` }); t.append(el("rect", { width: tw, height: th, rx: 4 })); const src = D.shotUrl(r.id); if (src) t.append(el("image", { href: src, x: 0, y: 0, width: tw, height: th - 18, preserveAspectRatio: "xMidYMin slice" })); t.append(el("text", { x: 6, y: th - 5 }, routeTitle(r.id).slice(0, 24))); t.addEventListener("click", (ev) => { ev.stopPropagation(); h.onSelect(r); }); tray.append(t); });
    g.append(tray);
  }
  view.append(g);
  return { story: st, stepId };
}

export function presenterHud(hud: HTMLElement, story: Story, stepId: string, onStep: (step: number) => void): void {
  const path = storyPath(story); const cur = byId.get(stepId); const via = path[state.step]?.via;
  const inb = D.graph.edges.filter((e) => e.scope === "screen" && e.target === stepId && story.screens.includes(e.source)).sort((a, b) => ({ high: 3, medium: 2, low: 1 }[b.confidence] - { high: 3, medium: 2, low: 1 }[a.confidence]))[0];
  const title = !cur ? "Missing screen" : cur.kind === "route" ? routeTitle(cur.id) : realTitle(cur.id);
  const btn = (id: string, label: string, icon: Parameters<typeof iconHtml>[0]): string => `<button id="${id}" class="icon-btn" aria-label="${label}" title="${label}">${iconHtml(icon, label)}</button>`;
  hud.hidden = false;
  hud.innerHTML = `${btn("ph-prev", "Previous step", "caret-left")}<span class="counter-label">${state.step + 1} / ${path.length}</span><span class="step-title"${cur ? "" : ' style="color:var(--bad)"'}>${esc(title)}</span>${via || inb ? `<span class="meta">via <b>${esc(via ?? inb.trigger)}</b></span>` : ""}${btn("ph-next", "Next step", "caret-right")}`;
  hud.querySelector("#ph-prev")!.addEventListener("click", (ev) => { ev.stopPropagation(); onStep(Math.max(0, state.step - 1)); });
  hud.querySelector("#ph-next")!.addEventListener("click", (ev) => { ev.stopPropagation(); onStep(Math.min(path.length - 1, state.step + 1)); });
}
