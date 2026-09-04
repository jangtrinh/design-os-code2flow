import type { ScreenNode } from "../schema/index.js";
import { Canvas } from "./canvas.js";
import { D, byId, defaultFeatures, featureOf, initData, routeOf, state, storyFeature, storyPath } from "./data-model.js";
import { closeDrawer, openLightbox, showDrawer } from "./drawer.js";
import { applyHash, hashOf, renderCrumb, renderRail, setupPalette, type NavHandlers } from "./navigation.js";
import type { Bundle, ScreenTitles, ShotMeta, ViewerData } from "./types.js";
import { renderInspect } from "./views-inspect.js";
import { renderMap } from "./views-map.js";
import { presenterHud, renderLanes } from "./views-present.js";
import { renderStoryPlayer } from "./story-player.js";
import { iconHtml } from "./icons.js";

/** Loads `.code2flow/*` from the serving CLI (or an inlined payload in exports) and boots the canvas. */
export async function boot(loadData: () => Promise<ViewerData>): Promise<void> {
  const stage = document.getElementById("stage")!;
  const printMode = new URLSearchParams(location.search).get("render") === "print";
  let data: ViewerData;
  try { data = await loadData(); } catch (err) { emptyState(stage, `Could not load the flow data: ${(err as Error).message}`); return; }
  if (!data.features.length) data.features = defaultFeatures(data.graph.screens.filter((s) => s.kind === "route").map((s) => s.id));
  initData(data);
  document.title = `${data.productName} · Code2Flow`;
  if (!data.features.length) { emptyState(stage, `No features detected: the graph has ${data.graph.screens.length} screens and no route screens. Run \`code2flow scan\` on the app root (the folder that contains app/ or src/app/).`); return; }
  const view = document.getElementById("view") as unknown as SVGGElement; const canvas = new Canvas(stage, view);
  const player = document.getElementById("player")!;
  let applyingHash = false;
  const render = (): void => {
    if (printMode && state.mode === "present") state.step = -1; // Hand-outs show the complete lane, never a dimmed focused step.
    view.replaceChildren(); document.body.classList.toggle("playing", state.mode === "play"); renderRail(nav); renderCrumb(nav);
    document.getElementById("fit")?.addEventListener("click", () => canvas.fit());
    document.getElementById("z-in")?.addEventListener("click", () => canvas.zoomCenter(1.2));
    document.getElementById("z-out")?.addEventListener("click", () => canvas.zoomCenter(1 / 1.2));
    const phud = document.getElementById("phud")!; phud.hidden = true;
    if (state.level === "map") { player.hidden = true; renderMap(view, (id) => nav.openFeature(id, null)); canvas.fit(); return; }
    if (state.mode === "present") {
      player.hidden = true;
      const { story, stepId } = renderLanes(view, { onSelect: select, onSelectBundle: select, onOpenStory: openStoryOf, onStep: (sid, i) => { state.story = sid; state.step = i; go(); }, onToggleTray: () => { state.showTray = !state.showTray; render(); } });
      if (story && stepId) { presenterHud(phud, story, stepId, (i) => { state.story = story.id; state.step = i; go(); }); canvas.focusOn(stepId); } else canvas.fit();
      return;
    }
    if (state.mode === "play") {
      const stories = D.stories.filter((s) => storyFeature(s) === state.feature); const story = stories.find((s) => s.id === (state.story ?? stories[0]?.id));
      if (story) { state.story = story.id; state.step = Math.min(Math.max(0, state.step), Math.max(0, storyPath(story).length - 1)); }
      renderStoryPlayer(player, story, state.step, { step: (index) => { state.step = index; go(); }, canvas: () => { state.mode = "present"; go(); }, screenshot: openLightbox });
      return;
    }
    player.hidden = true;
    renderInspect(view, { onSelect: select, onSelectBundle: select, onOpenStory: openStoryOf, onPortal: (feature, target) => { state.level = "feature"; state.feature = feature; state.story = null; state.mode = "inspect"; const t = byId.get(target); state.selected = t ?? null; go(); if (t) { showDrawer(t, select, openLightbox); canvas.focusOn(t.id); } } });
    canvas.fit();
  };
  const go = (): void => { render(); const h = hashOf(); if (location.hash !== h) { applyingHash = true; history.pushState(null, "", h); applyingHash = false; } };
  const select = (item: ScreenNode | Bundle): void => { state.selected = item; render(); showDrawer(item, select, openLightbox); if ("id" in item && state.mode === "inspect" && state.level === "feature") canvas.focusOn(routeOf(item.id) ?? item.id); };
  const openStoryOf = (s: ScreenNode): void => { const st = D.stories.find((x) => x.screens.some((id) => routeOf(id) === routeOf(s.id))); if (st && state.story !== st.id) { state.story = st.id; state.selected = s; go(); } };
  const nav: NavHandlers = {
    openFeature: (id, story) => { state.level = "feature"; state.feature = id; state.story = story; state.step = 0; state.selected = null; go(); },
    setStory: (id) => { state.story = id; state.step = 0; state.selected = null; go(); },
    toMap: () => { state.level = "map"; state.selected = null; go(); },
    toggleDismiss: (v) => { state.showDismiss = v; render(); },
    gotoScreen: (s) => { state.level = "feature"; state.feature = featureOf(s.id); state.story = null; state.mode = "inspect"; state.step = 0; state.selected = s; go(); showDrawer(s, select, openLightbox); canvas.focusOn(routeOf(s.id) ?? s.id); },
  };
  const palette = setupPalette(nav);
  const help = document.getElementById("canvas-help")!; const helpPopover = document.getElementById("canvas-help-popover")!;
  help.innerHTML = iconHtml("question");
  help.addEventListener("click", () => { const open = helpPopover.hidden; helpPopover.hidden = !open; help.setAttribute("aria-expanded", String(open)); if (open) helpPopover.innerHTML = `<div class="help-row"><span class="help-line high"></span>Solid arrow: high confidence</div><div class="help-row"><span class="help-line medium"></span>Grey arrow: medium confidence</div><div class="help-row"><span class="help-line low"></span>Dashed arrow: review needed</div><div class="help-row">${iconHtml("link-break")}Broken link or MISSING SCREEN</div><div class="help-row">${iconHtml("sidebar-simple")}Chip: in sidebar</div><div class="help-row">${iconHtml("arrow-u-up-left")}Chip: closes</div><div class="help-row">${iconHtml("keyboard")}Keys: arrows, P, F, Esc</div>`; });
  document.querySelectorAll<HTMLButtonElement>("#modeSeg button").forEach((b) => b.addEventListener("click", () => { state.mode = b.dataset.mode as "inspect" | "present" | "play"; state.selected = null; if (state.level === "map") { state.level = "feature"; state.feature = state.feature ?? [...D.features].sort((a, c) => a.order - c.order)[0]?.id ?? null; } go(); }));
  document.getElementById("nav-back")!.addEventListener("click", () => history.back());
  document.getElementById("lightbox")!.addEventListener("click", (ev) => { if (!(ev.target as Element).closest(".scroller")) document.getElementById("lightbox")!.hidden = true; });
  stage.addEventListener("click", () => { if (state.selected) { state.selected = null; closeDrawer(); render(); } });
  window.addEventListener("popstate", () => { if (!applyingHash && applyHash()) { render(); if (state.selected && "id" in state.selected) showDrawer(state.selected, select, openLightbox); } });
  window.addEventListener("keydown", (ev) => {
    const tag = (ev.target as HTMLElement).tagName; if (tag === "INPUT" || tag === "SELECT") return;
    const fs = D.stories.filter((s) => storyFeature(s) === state.feature); const st = fs.find((s) => s.id === (state.story ?? fs[0]?.id));
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "k") { palette.open(); ev.preventDefault(); return; } if (ev.key === "/") { palette.open(); ev.preventDefault(); return; }
    if (ev.key === "f" || ev.key === "F") { canvas.fit(); return; }
    if ((ev.key === "]" || ev.key === "[") && state.level === "feature" && fs.length) { const i = Math.max(0, fs.findIndex((s) => s.id === state.story)); const j = ev.key === "]" ? (i + 1) % fs.length : (i - 1 + fs.length) % fs.length; nav.setStory(fs[j].id); return; }
    if (state.level === "feature" && (state.mode === "present" || state.mode === "play") && st) { if (ev.key === "ArrowRight" || ev.key === "PageDown") { state.story = st.id; state.step = Math.min(storyPath(st).length - 1, state.step + 1); go(); ev.preventDefault(); } if (ev.key === "ArrowLeft" || ev.key === "PageUp") { state.story = st.id; state.step = Math.max(0, state.step - 1); go(); ev.preventDefault(); } }
    if ((ev.key === "p" || ev.key === "P") && state.level === "feature") { state.mode = "present"; go(); }
    if (ev.key === "Escape") { document.getElementById("lightbox")!.hidden = true; if (palette.isOpen()) { palette.close(); return; } if (state.mode === "play") { state.mode = "present"; go(); } else if (state.mode === "present") { state.mode = "inspect"; go(); } else if (state.selected) { state.selected = null; closeDrawer(); render(); } else if (state.story) { state.story = null; go(); } else if (state.level === "feature") { state.level = "map"; go(); } }
    if (ev.shiftKey && ev.key === "!") canvas.fit();
  });
  if (location.hash && location.hash !== "#map" && applyHash()) { render(); if (state.selected && "id" in state.selected) showDrawer(state.selected, select, openLightbox); } else render();
}

/** Replaces the canvas with one legible sentence when there is nothing to draw (never a TypeError deep in a view). */
function emptyState(stage: HTMLElement, message: string): void { const p = document.createElement("p"); p.className = "empty-state"; p.textContent = message; stage.replaceChildren(p); }

/** Serve mode: data comes from the CLI's JSON endpoints; images from /shots/. */
export async function loadServed(): Promise<ViewerData> {
  const j = async <T>(p: string, fallback: T): Promise<T> => { const r = await fetch(p); return r.ok ? ((await r.json()) as T) : fallback; };
  const graphRes = await fetch("/data/graph.json"); if (!graphRes.ok) throw new Error(`/data/graph.json → ${graphRes.status}; run \`code2flow scan\` and restart \`serve\``);
  const graph = (await graphRes.json()) as ViewerData["graph"];
  const [meta, titles, urls, storiesFile, config, info] = await Promise.all([ j<Record<string, ShotMeta>>("/data/shots-meta.json", {}), j<Record<string, ScreenTitles>>("/data/titles.json", {}), j<Record<string, string | null>>("/data/url-map.json", {}),
    j<{ stories?: ViewerData["stories"]; features?: ViewerData["features"] }>("/data/stories.json", {}), j<{ features?: ViewerData["features"] }>("/data/config.json", {}), j<{ product: string; shotIndex: Record<string, string> }>("/data/info.json", { product: "Code2Flow", shotIndex: {} }),
  ]);
  const idx = info.shotIndex;
  return { graph, meta, titles, urls, stories: storiesFile.stories ?? [], features: (storiesFile.features ?? config.features ?? []).map((f, i) => ({ ...f, order: f.order ?? i })), productName: info.product, // manifest wins over config (ADR-0007)
    shotUrl: (id) => (id in idx && meta[id] ? `/shots/${idx[id]}.jpg` : null), dialogUrl: (id) => (id in idx && meta[id]?.dialog ? `/shots/${idx[id]}-dialog.jpg` : null) };
}

declare global { interface Window { CODE2FLOW_DATA?: ViewerData } }
if (typeof window !== "undefined" && document.getElementById("stage")) boot(window.CODE2FLOW_DATA ? async () => window.CODE2FLOW_DATA! : loadServed);
