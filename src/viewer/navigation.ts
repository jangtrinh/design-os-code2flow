import type { ScreenNode } from "../schema/index.js";
import { byId, D, escapeHtml as esc, featById, featureOf, humanize, realTitle, routeOf, routes, routeTitle, state, storyFeature } from "./data-model.js";
import { featureStats } from "./views-map.js";
import { createDropdown } from "./dropdown.js";
import { iconHtml } from "./icons.js";
import type { Bundle } from "./types.js";

const icon = (name: Parameters<typeof iconHtml>[0], label: string, size = 16): string => iconHtml(name, label, size);

export interface NavHandlers { openFeature: (id: string, story: string | null) => void; setStory: (id: string | null) => void; toMap: () => void; toggleDismiss: (v: boolean) => void; gotoScreen: (s: ScreenNode) => void }

/** Left rail: Feature ▸ Story tree with counts, "Not in a story", options. */
export function renderRail(h: NavHandlers): void {
  const r = document.getElementById("rail")!; r.replaceChildren();
  const title = (t: string): HTMLElement => { const d = document.createElement("div"); d.className = "legend-title"; d.textContent = t; return d; };
  const product = title(D.productName); product.innerHTML = `${icon("map-trifold", "Product map")}<span>${esc(D.productName)}</span>`; r.append(product);
  for (const f of [...D.features].sort((a, b) => a.order - b.order)) {
    const s = featureStats(f); const d = document.createElement("button"); d.className = "rail-item" + (state.feature === f.id && state.level === "feature" ? " on" : "");
    d.innerHTML = `${icon("squares-four", "Feature", 20)}<span>${esc(f.title)}</span><span class="counter-label">${s.routes}·${s.stories}</span>`; d.addEventListener("click", () => h.openFeature(f.id, null)); r.append(d);
    if (state.feature === f.id && state.level === "feature") {
      for (const st of D.stories.filter((x) => storyFeature(x) === f.id)) { const e = document.createElement("button"); e.className = "rail-item nav-story" + (state.story === st.id ? " on" : ""); e.innerHTML = `${icon("path", "Story", 20)}<span>${esc(st.title)}</span><span class="counter-label">${st.screens.length}</span>`; e.addEventListener("click", () => h.setStory(st.id)); r.append(e); }
      const n = document.createElement("button"); n.className = "rail-item nav-story"; const cnt = routes.filter((x) => featureOf(x.id) === f.id && !D.stories.some((y) => y.screens.map(routeOf).includes(x.id))).length;
      n.innerHTML = `${icon("stack", "Unassigned screens", 20)}<span>Not in a story</span><span class="counter-label">${cnt}</span>`; n.addEventListener("click", () => { state.mode = "inspect"; h.setStory(null); }); r.append(n);
    }
  }
  const l = document.createElement("label"); const disabled = state.level === "map"; l.className = "option-label close-arrows-row" + (disabled ? " disabled" : ""); l.title = disabled ? "Applies to feature and story pages" : "Show arrows for Cancel/Close/Back buttons (hidden by default)"; l.innerHTML = `${icon("arrow-u-up-left", "Return action", 20)}<span>Close arrows</span><input role="switch" type="checkbox" aria-checked="${state.showDismiss}" ${state.showDismiss ? "checked" : ""} ${disabled ? "disabled" : ""}>`; l.querySelector("input")!.addEventListener("change", (ev) => h.toggleDismiss((ev.target as HTMLInputElement).checked)); r.append(l);
  const legend = document.createElement("details"); legend.className = "rail-legend"; legend.open = innerHeight >= 640;
  legend.innerHTML = `<summary>${icon("question", "Legend")}<span>Legend</span></summary><div class="legend-rows"><div><span class="help-line high"></span>Solid · high</div><div><span class="help-line medium"></span>Grey · medium</div><div><span class="help-line low"></span>Dashed · review</div><div>${icon("link-break", "Broken target")}Broken target</div><div>${icon("sidebar-simple", "Shell target")}Shell target</div><div>${icon("arrow-u-up-left", "Return action")}Return action</div><div>${icon("keyboard", "Keyboard shortcuts")}Arrows · + · − · F</div></div>`; r.append(legend);
  document.querySelectorAll<HTMLButtonElement>("#modeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.mode === state.mode));
}

/** Breadcrumb dropdowns and compact inspect controls. */
export function renderCrumb(h: NavHandlers): void {
  const c = document.getElementById("crumb")!; c.replaceChildren();
  const separator = (): HTMLSpanElement => { const s = document.createElement("span"); s.className = "crumb-separator"; s.setAttribute("aria-hidden", "true"); s.textContent = "/"; return s; };
  const b = document.createElement("button"); b.innerHTML = `${icon("map-trifold", "Product map")}<span>Product map</span>`; b.addEventListener("click", h.toMap); c.append(b);
  if (state.level === "feature") {
    c.append(separator());
    c.append(createDropdown("Feature", [...D.features].sort((a, b) => a.order - b.order).map((f) => ({ id: f.id, label: f.title })), state.feature ?? "", (id) => h.openFeature(id, null)));
    c.append(separator());
    c.append(createDropdown("Story", [{ id: "", label: "Feature overview" }, ...D.stories.filter((story) => storyFeature(story) === state.feature).map((story) => ({ id: story.id, label: story.title }))], state.story ?? "", (id) => h.setStory(id || null)));
  }
  document.getElementById("nav-search")!.innerHTML = `${icon("magnifying-glass", "Search")}<span>Search</span>`;
  document.querySelectorAll<HTMLButtonElement>("#modeSeg button").forEach((button) => { const name = button.dataset.mode === "inspect" ? "eye" : button.dataset.mode === "present" ? "presentation" : "play"; const label = button.dataset.mode![0].toUpperCase() + button.dataset.mode!.slice(1); button.innerHTML = `${icon(name, label)}<span>${label}</span>`; });
}

/* ---------- deep links: state ⇄ location.hash ---------- */
export function hashOf(): string {
  if (state.level === "map") return "#map";
  const p = ["#f", state.feature]; if (state.story) p.push("s", state.story); if (state.mode === "present" || state.mode === "play") p.push(state.mode, String(state.step));
  if (state.mode === "play" && state.playFocus) p.push("focus");
  if (state.selected) p.push("sel", encodeURIComponent("edges" in state.selected ? `edge:${state.selected.source}>${state.selected.target}` : state.selected.id));
  return p.join("/");
}
export function applyHash(): boolean {
  const h = location.hash.slice(1); if (!h || h === "map") { state.level = "map"; state.selected = null; return true; }
  const p = h.split("/"); if (p[0] !== "f" || !featById[p[1]]) return false;
  state.level = "feature"; state.feature = p[1]; state.story = null; state.mode = "inspect"; state.step = 0; state.playFocus = false; state.selected = null;
  for (let i = 2; i < p.length; i += 2) { if (p[i] === "s") state.story = p[i + 1]; if (p[i] === "present" || p[i] === "play") { state.mode = p[i] === "play" ? "play" : "present"; state.step = +p[i + 1] || 0; } if (p[i] === "sel") { const selected = decodeURIComponent(p[i + 1]); const s = byId.get(selected); if (s) state.selected = s; else if (selected.startsWith("edge:")) { const [source, target] = selected.slice(5).split(">"); const edges = D.graph.edges.filter((edge) => edge.source === source && edge.target === target); if (edges.length) state.selected = { source, target, edges, primary: edges[0], confidence: edges[0].confidence, missing: false } satisfies Bundle; } } }
  state.playFocus = state.mode === "play" && p.at(-1) === "focus";
  return true;
}

/* ---------- search palette ---------- */
export function setupPalette(h: NavHandlers): { open: () => void; close: () => void; isOpen: () => boolean } {
  const palette = document.getElementById("palette")!, input = document.getElementById("palette-input") as HTMLInputElement, results = document.getElementById("palette-results")!; let index = 0;
  interface Row { kind: string; title: string; sub: string; go: () => void }
  const search = (q: string): Row[] => {
    const s = q.trim().toLowerCase(); const out: Row[] = [];
    for (const f of D.features) if (!s || f.title.toLowerCase().includes(s) || f.id.includes(s)) out.push({ kind: "feature", title: f.title, sub: "feature", go: () => h.openFeature(f.id, null) });
    for (const st of D.stories) if (!s || st.title.toLowerCase().includes(s) || st.id.includes(s)) out.push({ kind: "story", title: st.title, sub: (featById[storyFeature(st)]?.title ?? "") + " · story", go: () => h.openFeature(storyFeature(st), st.id) });
    for (const sc of D.graph.screens) { const t = sc.kind === "route" ? routeTitle(sc.id) : routeTitle(routeOf(sc.id) ?? sc.id) + " · " + realTitle(sc.id); if (!s || sc.id.toLowerCase().includes(s) || t.toLowerCase().includes(s)) out.push({ kind: sc.kind, title: t, sub: sc.id, go: () => h.gotoScreen(sc) }); }
    return out.slice(0, 40);
  };
  const render = (q: string): void => { const rows = search(q); results.replaceChildren(); rows.forEach((r, i) => { const b = document.createElement("li"); b.setAttribute("role", "option"); b.setAttribute("aria-selected", String(i === index)); b.className = "result" + (i === index ? " on" : ""); b.innerHTML = `<span class="chip medium">${esc(r.kind)}</span><span>${esc(r.title)}</span><span class="mono meta">${esc(r.sub)}</span>`; b.addEventListener("click", () => { close(); r.go(); }); results.append(b); }); results.dataset.count = String(rows.length); };
  const open = (): void => { palette.hidden = false; input.value = ""; index = 0; render(""); input.focus(); };
  const close = (): void => { palette.hidden = true; };
  input.addEventListener("input", () => { index = 0; render(input.value); });
  input.addEventListener("keydown", (ev) => { const n = +(results.dataset.count ?? 0); if (ev.key === "ArrowDown") { index = Math.min(n - 1, index + 1); render(input.value); ev.preventDefault(); } if (ev.key === "ArrowUp") { index = Math.max(0, index - 1); render(input.value); ev.preventDefault(); } if (ev.key === "Enter") (results.children[index] as HTMLElement | undefined)?.click(); if (ev.key === "Escape") { close(); ev.stopPropagation(); } });
  palette.addEventListener("click", (ev) => { if (ev.target === palette) close(); });
  document.getElementById("nav-search")!.addEventListener("click", open);
  return { open, close, isOpen: () => !palette.hidden };
}
export { humanize };
