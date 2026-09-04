import { byId, D } from "./data-model.js";

const NS = "http://www.w3.org/2000/svg";
export const W = 480, SH = 300, TB = 36, FB = 30, FH = TB + SH + FB, SW = 220, SCALE = 1 / 3, MAXH = 900, PAD = 10;
export const HEAD_ROUTE = 50, HEAD_STATE = 44;

export function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number> = {}, ...kids: (Node | string)[]): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  for (const k of kids) e.append(k);
  return e;
}

/** A group whose contents shrink as the canvas zooms in: translate + scale(var(--tx)) in ONE css transform (a css transform overrides the svg attribute). */
export function uiScale(cls: string, x: number, y: number): SVGGElement { return el("g", { class: cls, style: `transform:translate(${x}px,${y}px) scale(var(--tx))` }); }

export interface ShotDims { w: number; h: number; src: string | null; dialog?: boolean; clipped?: boolean; full?: number }

/** Frame size follows the capture: route = capture/3 (height capped, chip says it continues); state = dialog crop at 1/2. */
export function shotDims(id: string, preferDialog: boolean, cardW?: number): ShotDims {
  const mm = D.meta[id];
  if (!mm) return { w: cardW ?? W, h: SH, src: D.shotUrl(id) };
  if (preferDialog && mm.dialog && D.dialogUrl(id)) { const iw = cardW ? cardW - 20 : Math.max(240, Math.min(480, Math.round(mm.dialog.width * 0.5))); return { w: iw + 20, h: Math.round(iw * mm.dialog.height / mm.dialog.width), src: D.dialogUrl(id), dialog: true }; }
  const w = (cardW ?? Math.round(mm.width * SCALE)) + 20; const iw = w - 20; const full = Math.round(mm.height * (iw / mm.width));
  return { w, h: Math.min(MAXH, full), src: D.shotUrl(id), clipped: full > MAXH, full };
}
export function frameDims(id: string, preferDialog: boolean, cardW?: number): { w: number; h: number; shot: ShotDims } {
  const s = byId.get(id); const isState = !!s && s.kind !== "route"; const d = shotDims(id, preferDialog, cardW);
  return { w: d.w, h: (isState ? HEAD_STATE : HEAD_ROUTE) + d.h + PAD + (isState ? 0 : FB), shot: d };
}
