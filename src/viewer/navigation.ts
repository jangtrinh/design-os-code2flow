import type { ScreenNode } from "../schema/index.js";
import { byId, D, escapeHtml as esc, featById, featureOf, humanize, realTitle, routeOf, routes, routeTitle, state, storyFeature } from "./data-model.js";
import { featureStats } from "./views-map.js";

const ICON_L = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3 5 8l5 5"/></svg>';
const ICON_R = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 3 5 5-5 5"/></svg>';

export interface NavHandlers { openFeature: (id: string, story: string | null) => void; setStory: (id: string | null) => void; toMap: () => void; toggleDismiss: (v: boolean) => void; gotoScreen: (s: ScreenNode) => void }

/** Left rail: Feature ▸ Story tree with counts, "Not in a story", options. */
export function renderRail(h: NavHandlers): void {
  const r = document.getElementById("rail")!; r.replaceChildren();
  const title = (t: string): HTMLElement => { const d = document.createElement("div"); d.className = "legend-title"; d.textContent = t; return d; };
  r.append(title(D.productName));
  for (const f of [...D.features].sort((a, b) => a.order - b.order)) {
    const s = featureStats(f); const d = document.createElement("button"); d.className = "rail-item" + (state.feature === f.id && state.level === "feature" ? " on" : "");
    d.innerHTML = `<span>${esc(f.title)}</span><span class="counter">${s.routes}·${s.stories}</span>`; d.addEventListener("click", () => h.openFeature(f.id, null)); r.append(d);
    if (state.feature === f.id && state.level === "feature") {
      for (const st of D.stories.filter((x) => storyFeature(x) === f.id)) { const e = document.createElement("button"); e.className = "rail-item nav-story" + (state.story === st.id ? " on" : ""); e.innerHTML = `<span>${esc(st.title)}</span><span class="counter">${st.screens.length}</span>`; e.addEventListener("click", () => h.setStory(st.id)); r.append(e); }
      const n = document.createElement("button"); n.className = "rail-item nav-story"; const cnt = routes.filter((x) => featureOf(x.id) === f.id && !D.stories.some((y) => y.screens.map(routeOf).includes(x.id))).length;
      n.innerHTML = `<span>Not in a story</span><span class="counter">${cnt}</span>`; n.addEventListener("click", () => { state.mode = "inspect"; h.setStory(null); }); r.append(n);
    }
  }
  const l = document.createElement("label"); l.className = "option-label"; l.innerHTML = `<input type="checkbox" ${state.showDismiss ? "checked" : ""}> Cancel/Close`; l.querySelector("input")!.addEventListener("change", (ev) => h.toggleDismiss((ev.target as HTMLInputElement).checked)); r.append(l);
  document.querySelectorAll<HTMLButtonElement>("#modeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.mode === state.mode));
}

/** Breadcrumb selects and compact inspect controls. */
export function renderCrumb(h: NavHandlers): void {
  const c = document.getElementById("crumb")!; c.replaceChildren();
  const b = document.createElement("button"); b.textContent = "Product map"; b.addEventListener("click", h.toMap); c.append(b);
  if (state.level === "feature") {
    c.insertAdjacentHTML("beforeend", ICON_R);
    const fsel = document.createElement("select"); fsel.setAttribute("aria-label", "Feature");
    for (const f of [...D.features].sort((a, b) => a.order - b.order)) { const o = document.createElement("option"); o.value = f.id; o.textContent = f.title; o.selected = f.id === state.feature; fsel.append(o); }
    fsel.addEventListener("change", () => h.openFeature(fsel.value, null)); c.append(fsel);
    c.insertAdjacentHTML("beforeend", ICON_R);
    const ssel = document.createElement("select"); ssel.setAttribute("aria-label", "Story"); const o0 = document.createElement("option"); o0.value = ""; o0.textContent = "Feature overview"; ssel.append(o0);
    for (const st of D.stories.filter((x) => storyFeature(x) === state.feature)) { const o = document.createElement("option"); o.value = st.id; o.textContent = st.title; o.selected = st.id === state.story; ssel.append(o); }
    ssel.addEventListener("change", () => h.setStory(ssel.value || null)); c.append(ssel);
  }
  const hud = document.getElementById("hud")!;
  const kbd = (k: string): string => `<span class="kbd">${k}</span>`;
  hud.hidden = state.mode === "present";
  hud.innerHTML = state.level === "feature" ? `<button id="z-out" class="icon-btn" style="min-height:44px;min-width:44px" aria-label="Zoom out">−</button><button id="z-in" class="icon-btn" style="min-height:44px;min-width:44px" aria-label="Zoom in">+</button><button id="fit" class="icon-btn" style="min-height:44px;min-width:44px" aria-label="Fit">⌗</button><span>${kbd("F")}</span><span>${kbd("[")}${kbd("]")}</span>` : `<button id="z-out" class="icon-btn" style="min-height:44px;min-width:44px" aria-label="Zoom out">−</button><button id="z-in" class="icon-btn" style="min-height:44px;min-width:44px" aria-label="Zoom in">+</button><button id="fit" class="icon-btn" style="min-height:44px;min-width:44px" aria-label="Fit">⌗</button><span>${kbd("/")}</span>`;
  document.getElementById("nav-back")!.innerHTML = ICON_L;
}

/* ---------- deep links: state ⇄ location.hash ---------- */
export function hashOf(): string {
  if (state.level === "map") return "#map";
  const p = ["#f", state.feature]; if (state.story) p.push("s", state.story); if (state.mode === "present") p.push("present", String(state.step));
  if (state.selected && "id" in state.selected) p.push("sel", encodeURIComponent(state.selected.id));
  return p.join("/");
}
export function applyHash(): boolean {
  const h = location.hash.slice(1); if (!h || h === "map") { state.level = "map"; state.selected = null; return true; }
  const p = h.split("/"); if (p[0] !== "f" || !featById[p[1]]) return false;
  state.level = "feature"; state.feature = p[1]; state.story = null; state.mode = "inspect"; state.step = 0; state.selected = null;
  for (let i = 2; i < p.length; i += 2) { if (p[i] === "s") state.story = p[i + 1]; if (p[i] === "present") { state.mode = "present"; state.step = +p[i + 1] || 0; } if (p[i] === "sel") { const s = byId.get(decodeURIComponent(p[i + 1])); if (s) state.selected = s; } }
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
