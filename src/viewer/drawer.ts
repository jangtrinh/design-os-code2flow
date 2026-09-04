import type { ScreenNode } from "../schema/index.js";
import { D, byId, escapeHtml as esc, featById, featureOf, realTitle, routeOf, routeTitle, shellTargets } from "./data-model.js";
import { iconHtml } from "./icons.js";
import type { Bundle } from "./types.js";

const confidenceIcon = (confidence: string): string => confidence === "high" ? "●" : confidence === "medium" ? "◐" : confidence === "low" ? "○" : iconHtml("warning", "Missing confidence", 14);
const targetTitle = (id: string): string => { const screen = byId.get(id); return screen ? (screen.kind === "route" ? routeTitle(screen.id) : realTitle(screen.id)) : id.replace(/^(portal|stub):/, ""); };
const triggerIcon = (edge: { pattern: string; href?: string | null }): Parameters<typeof iconHtml>[0] => edge.pattern.includes("redirect") ? "arrow-bend-down-right" : edge.pattern.includes("form") ? "textbox" : edge.pattern.includes("link") || edge.href ? "link" : "cursor-click";

/** One row per distinct trigger → target; parallel edges (e.g. 16 product cards) collapse into a count chip and list every file:line in the evidence. */
function evidenceRow(edge: Bundle["primary"], group: Bundle["primary"][] = [edge]): [HTMLButtonElement, HTMLPreElement] {
  const row = document.createElement("button"); row.type = "button"; row.className = "inspector-row"; row.title = `${edge.confidence}${group.length > 1 ? ` · ${group.length} links` : ""}`;
  const count = group.length > 1 ? `<span class="inspector-count" title="${group.length} links">${group.length}</span>` : "";
  row.innerHTML = `<span class="confidence-dot" title="${esc(edge.confidence)}">${confidenceIcon(edge.confidence)}</span>${iconHtml(triggerIcon(edge), "Trigger", 16)}<span class="inspector-trigger">${esc(edge.trigger)}</span>${iconHtml("caret-right", "From to", 14)}<span class="inspector-target">${esc(targetTitle(edge.target))}</span>${count}`;
  const evidence = document.createElement("pre"); evidence.className = "inspector-evidence"; evidence.hidden = true;
  evidence.innerHTML = group.map((e) => `${iconHtml("file-code", "Source evidence", 14)}<span>${esc(e.evidence.file)}:${esc(e.evidence.line)}</span>${e.evidence.snippet ? `<code>${esc(e.evidence.snippet)}</code>` : ""}`).join("\n");
  row.addEventListener("click", () => { evidence.hidden = !evidence.hidden; }); return [row, evidence]; // appended together: `row.after()` before the row has a parent was a silent no-op
}

function section(body: HTMLElement, title: "From" | "To", edges: Bundle["primary"][]): void { if (!edges.length) return; const heading = document.createElement("h4"); heading.textContent = title; const list = document.createElement("div"); list.className = "inspector-list"; const groups = new Map<string, Bundle["primary"][]>(); for (const edge of edges) { const key = `${edge.trigger}→${edge.target}`; groups.set(key, [...(groups.get(key) ?? []), edge]); } for (const group of groups.values()) list.append(...evidenceRow(group[0], group)); body.append(heading, list); }

/** Right Inspector: screenshot, identity chips, then expandable real transition evidence. */
export function showDrawer(item: ScreenNode | Bundle, onSelectBundle: (b: Bundle) => void, onLightbox: (s: ScreenNode) => void): void {
  void onSelectBundle; const d = document.getElementById("drawer")!, body = document.getElementById("drawer-body")!; d.classList.add("open"); body.replaceChildren();
  if ("edges" in item) {
    const title = document.createElement("h3"); title.textContent = `${item.primary.trigger} · ${item.edges.length}`; title.title = `${item.primary.trigger} · ${item.edges.length} links`;
    const route = document.createElement("p"); route.className = "mono inspector-route"; route.textContent = `${routeOf(item.source) ?? item.source} → ${routeOf(item.target) ?? item.target}`; body.append(title, route); section(body, "To", item.edges); return;
  }
  const s = item;
  const title = document.createElement("h3"); title.textContent = s.kind === "route" ? routeTitle(s.id) : realTitle(s.id); const route = document.createElement("p"); route.className = "mono inspector-route"; route.textContent = routeOf(s.id) ?? s.id; body.append(title, route);
  const src = D.shotUrl(s.id); if (src) { const im = document.createElement("img"); im.src = src; im.className = "shot-full"; im.alt = ""; im.onerror = () => { im.hidden = true; const fallback = document.createElement("p"); fallback.className = "image-fallback"; fallback.textContent = "Screenshot unavailable"; im.after(fallback); }; im.addEventListener("click", () => onLightbox(s)); body.append(im); }
  const chips = document.createElement("div"); chips.className = "inspector-chips"; const addChip = (icon: Parameters<typeof iconHtml>[0], tooltip: string, text?: string): void => { const chip = document.createElement("span"); chip.className = "inspector-chip"; chip.title = tooltip; chip.setAttribute("aria-label", tooltip); chip.innerHTML = `${iconHtml(icon, tooltip, 14)}${text ? `<span>${text}</span>` : ""}`; chips.append(chip); }; addChip(s.kind === "route" ? "app-window" : "cards", s.kind); addChip("squares-four", featById[featureOf(s.id)]?.title ?? "Feature"); if (shellTargets.has(s.id)) addChip("sidebar-simple", "Shell target"); const states = D.graph.screens.filter((candidate) => candidate.parentScreenId === s.id).length; if (states) addChip("stack", `State screens · ${states}`, String(states)); body.append(chips);
  const outs = D.graph.edges.filter((e) => e.source === s.id), ins = D.graph.edges.filter((e) => e.target === s.id && e.scope !== "shell");
  section(body, "From", ins); section(body, "To", outs);
}

export function openLightbox(s: ScreenNode): void {
  const lb = document.getElementById("lightbox")!; const li = lb.querySelector("img")!; li.hidden = false; li.onerror = () => { li.hidden = true; const caption = lb.querySelector(".caption")!; caption.textContent = "Screenshot unavailable"; }; li.src = D.shotUrl(s.id) ?? ""; const mm = D.meta[s.id]; if (mm) { li.width = mm.width; li.height = mm.height; }
  lb.querySelector(".caption")!.textContent = s.id; lb.hidden = false;
}
export function closeDrawer(): void { document.getElementById("drawer")!.classList.remove("open"); }
