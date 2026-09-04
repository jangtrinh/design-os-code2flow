/** Pan and zoom for the SVG canvas (ADR-0003 gestures): drag / two-finger pan, Cmd+wheel or pinch zoom, fit, focus. */
export class Canvas {
  tx = 0; ty = 0; k = 1; private drag: { x: number; y: number } | null = null;
  constructor(readonly stage: HTMLElement, readonly view: SVGGElement) {
    stage.addEventListener("pointerdown", (ev) => { if ((ev.target as Element).closest(".frame,.hit,.toolbar,.card,.stub,.tile,text,.presenter-hud")) return; this.drag = { x: ev.clientX - this.tx, y: ev.clientY - this.ty }; stage.classList.add("dragging"); stage.setPointerCapture(ev.pointerId); });
    stage.addEventListener("pointermove", (ev) => { if (!this.drag) return; this.tx = ev.clientX - this.drag.x; this.ty = ev.clientY - this.drag.y; this.apply(); });
    stage.addEventListener("pointerup", () => { this.drag = null; stage.classList.remove("dragging"); });
    stage.addEventListener("wheel", (ev) => { ev.preventDefault(); const r = stage.getBoundingClientRect(); const px = ev.clientX - r.left, py = ev.clientY - r.top; if (ev.ctrlKey || ev.metaKey) this.zoomAt(px, py, Math.exp(-ev.deltaY * 0.01)); else { this.tx -= ev.deltaX; this.ty -= ev.deltaY; this.apply(); } }, { passive: false });
  }
  apply(): void { this.view.setAttribute("transform", `translate(${this.tx},${this.ty}) scale(${this.k})`); this.view.style.setProperty("--tx", String(Math.min(1.3, Math.max(0.45, Math.pow(this.k, -0.85))))); }
  zoomAt(px: number, py: number, f: number): void { const nk = Math.min(4, Math.max(0.05, this.k * f)); const s = nk / this.k; this.tx = px - (px - this.tx) * s; this.ty = py - (py - this.ty) * s; this.k = nk; this.apply(); }
  zoomCenter(f: number): void { const r = this.stage.getBoundingClientRect(); this.zoomAt(r.width / 2, r.height / 2, f); }
  fit(): void { const bb = this.view.getBBox(); const r = this.stage.getBoundingClientRect(); if (!bb.width) return; this.k = Math.min(1.5, Math.max(0.05, Math.min((r.width - 60) / bb.width, (r.height - 60) / bb.height))); this.tx = (r.width - bb.width * this.k) / 2 - bb.x * this.k; this.ty = (r.height - bb.height * this.k) / 2 - bb.y * this.k; this.apply(); }
  focusOn(id: string): void {
    const n = this.view.querySelector<SVGGraphicsElement>(`[data-node="${CSS.escape(id)}"]`); if (!n) { this.fit(); return; }
    const bb = n.getBBox(); const m = n.getCTM(); const ctm = this.view.getCTM(); const r = this.stage.getBoundingClientRect(); if (!m || !ctm) return;
    this.k = Math.min(1.4, (r.height - 140) / bb.height);
    const cx = (m.e - ctm.e) / ctm.a + bb.x + bb.width / 2, cy = (m.f - ctm.f) / ctm.d + bb.y + bb.height / 2;
    this.tx = r.width / 2 - cx * this.k; this.ty = r.height / 2 - cy * this.k; this.apply();
  }
}
