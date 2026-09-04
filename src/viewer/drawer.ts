import type { ScreenNode } from "../schema/index.js";
import { D, escapeHtml as esc, featById, featureOf, realTitle, routeOf, routeTitle, shellTargets, storiesOf } from "./data-model.js";
import type { Bundle } from "./types.js";

/** Right drawer: evidence for a bundle (each trigger with file:line and snippet) or a screen (capture, meta, outgoing actions). */
export function showDrawer(item: ScreenNode | Bundle, onSelectBundle: (b: Bundle) => void, onLightbox: (s: ScreenNode) => void): void {
  const d = document.getElementById("drawer")!, body = document.getElementById("drawer-body")!; d.classList.add("open"); body.replaceChildren();
  const h = document.createElement("h3");
  if ("edges" in item) {
    h.textContent = `${item.edges.length} action${item.edges.length > 1 ? "s" : ""}: ${routeOf(item.source) ?? item.source} to ${item.target.replace(/^(portal|stub):/, "")}`; body.append(h);
    const list = document.createElement("div"); list.className = "meta-list";
    for (const e of item.edges) {
      const b = document.createElement("button");
      b.innerHTML = `<span class="chip ${e.confidence}">${e.confidence}</span> ${esc(e.trigger)} <span class="mono meta">${esc(e.source)} to ${esc(e.target)}</span><br><span class="mono meta">${esc(e.evidence.file)}:${e.evidence.line} · ${esc(e.pattern)}${e.href ? " · " + esc(e.href) : ""}</span>`;
      b.addEventListener("click", () => { const pre = document.createElement("pre"); pre.className = "code"; pre.textContent = e.evidence.snippet ?? ""; b.after(pre); });
      list.append(b);
    }
    body.append(list); return;
  }
  const s = item;
  h.textContent = s.kind === "route" ? routeTitle(s.id) : routeTitle(routeOf(s.id) ?? s.id) + " · " + realTitle(s.id); body.append(h);
  const sub = document.createElement("div"); sub.className = "mono meta"; sub.textContent = s.id; body.append(sub);
  const src = D.shotUrl(s.id);
  if (src) { const im = document.createElement("img"); im.src = src; im.className = "shot-full"; im.alt = "Screenshot " + s.id; const mm = D.meta[s.id]; if (mm) { im.width = mm.width; im.height = mm.height; } im.addEventListener("click", () => onLightbox(s)); body.append(im); }
  const outs = D.graph.edges.filter((e) => e.source === s.id), ins = D.graph.edges.filter((e) => e.target === s.id && e.scope !== "shell");
  body.insertAdjacentHTML("beforeend", `<dl class="meta-grid"><dt>Kind</dt><dd>${esc(s.kind)}${s.routeAsModal ? " · route rendered as modal" : ""}</dd><dt>Feature</dt><dd>${esc(featById[featureOf(s.id)]?.title)}</dd><dt>Stories</dt><dd>${storiesOf(routeOf(s.id) ?? s.id).map((x) => esc(x.title)).join(", ") || "—"}</dd><dt>File</dt><dd class="mono">${esc(s.filePath || "—")}</dd><dt>URL</dt><dd class="mono">${esc(D.urls[s.id] || "—")}</dd><dt>Out / In</dt><dd>${outs.length} / ${ins.length}</dd><dt>Sidebar</dt><dd>${shellTargets.has(s.id) ? "reachable from shell nav" : "—"}</dd></dl>`);
  if (outs.length) {
    const list = document.createElement("div"); list.className = "meta-list";
    for (const e of outs) { const b = document.createElement("button"); b.innerHTML = `<span class="chip ${e.confidence}">${e.confidence}</span> ${esc(e.trigger)} <span class="mono meta">to ${esc(e.target)}</span>`; b.addEventListener("click", () => onSelectBundle({ source: e.source, target: e.target, edges: [e], primary: e, confidence: e.confidence, missing: false })); list.append(b); }
    body.append(list);
  }
}

export function openLightbox(s: ScreenNode): void {
  const lb = document.getElementById("lightbox")!; const li = lb.querySelector("img")!; li.src = D.shotUrl(s.id) ?? ""; const mm = D.meta[s.id]; if (mm) { li.width = mm.width; li.height = mm.height; }
  lb.querySelector(".caption")!.textContent = s.id; lb.hidden = false;
}
export function closeDrawer(): void { document.getElementById("drawer")!.classList.remove("open"); }
