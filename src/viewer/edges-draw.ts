import { el, FH, uiScale } from "./svg.js";
import { state } from "./data-model.js";
import type { Bundle } from "./types.js";

export interface Pos { x: number; y: number; w: number; h: number }

/** Bezier between two frames with the primary trigger pill; return edges dip below the frames without a pill. */
export function drawBundle(g: SVGGElement, b: Bundle, pos: Record<string, Pos>, onSelect: (b: Bundle) => void, opts: { faded?: boolean } = {}): void {
  const s = pos[b.source], t = pos[b.target]; if (!s || !t) return;
  const ret = t.x < s.x; const x1 = s.x + s.w, y1 = s.y + Math.min(s.h, FH) / 2, x2 = t.x, y2 = t.y + Math.min(t.h, FH) / 2;
  let d: string;
  if (!ret) { const dx = Math.max(50, (x2 - x1) / 2); d = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`; }
  else { const yb = Math.max(s.y + s.h, t.y + t.h) + 40; const xa = s.x + s.w / 2, xb = t.x + t.w / 2; d = `M${xa},${s.y + s.h} C${xa},${yb} ${xb},${yb} ${xb},${t.y + t.h}`; }
  const cls = ["edge", b.confidence, ret ? "return" : "", b.missing ? "missing" : "", state.selected === b ? "selected" : "", opts.faded ? "faded" : ""].join(" ");
  const p = el("path", { d, class: cls, "marker-end": "url(#arrow)" }); const hit = el("path", { d, class: "hit" });
  hit.addEventListener("click", (ev) => { ev.stopPropagation(); onSelect(b); });
  g.append(p, hit);
  if (!ret && !opts.faded) pill(g, (x1 + x2) / 2, (y1 + y2) / 2, b);
}

export function pill(g: SVGGElement, mx: number, my: number, b: Bundle): void {
  const label = (b.primary.trigger.length > 24 ? b.primary.trigger.slice(0, 23) + "…" : b.primary.trigger) + (b.edges.length > 1 ? `  +${b.edges.length - 1}` : "");
  const w = label.length * 6 + 16; const pg = uiScale("ui-scale center", mx - w / 2, my - 10);
  pg.append(el("rect", { x: 0, y: 0, width: w, height: 20, class: "pill-bg " + b.confidence }), el("text", { x: w / 2, y: 14, "text-anchor": "middle", class: "pill" }, label));
  g.append(pg);
}
