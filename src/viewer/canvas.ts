/** Pan and zoom for the SVG canvas (ADR-0003 gestures): drag / two-finger pan, Cmd+wheel or pinch zoom, fit, focus. */
export class Canvas {
  tx = 0; ty = 0; k = 1; private drag: { x: number; y: number } | null = null;
  constructor(readonly stage: HTMLElement, readonly view: SVGGElement) {
    stage.addEventListener("pointerdown", (ev) => { if ((ev.target as Element).closest(".frame,.hit,.toolbar,.card,.stub,.tile,text,.presenter-hud,.edge-pill")) return; this.drag = { x: ev.clientX - this.tx, y: ev.clientY - this.ty }; stage.classList.add("dragging"); stage.setPointerCapture(ev.pointerId); });
    stage.addEventListener("pointermove", (ev) => { if (!this.drag) return; this.tx = ev.clientX - this.drag.x; this.ty = ev.clientY - this.drag.y; this.apply(); });
    stage.addEventListener("pointerup", () => { this.drag = null; stage.classList.remove("dragging"); });
    stage.addEventListener("wheel", (ev) => { ev.preventDefault(); const r = stage.getBoundingClientRect(); const px = ev.clientX - r.left, py = ev.clientY - r.top; if (ev.ctrlKey || ev.metaKey) this.zoomAt(px, py, Math.exp(-ev.deltaY * 0.01)); else { this.tx -= ev.deltaX; this.ty -= ev.deltaY; this.apply(); } }, { passive: false });
  }
  apply(): void {
    this.view.setAttribute("transform", `translate(${this.tx},${this.ty}) scale(${this.k})`); this.view.style.setProperty("--tx", String(Math.min(1.3, Math.max(0.45, Math.pow(this.k, -0.85)))));
    const svg = this.view.ownerSVGElement; if (!svg) return;
    svg.classList.remove("lod-0", "lod-1", "lod-2"); svg.classList.add(this.k < 0.35 ? "lod-0" : this.k < 0.7 ? "lod-1" : "lod-2");
  }
  zoomAt(px: number, py: number, f: number): void { const nk = Math.min(4, Math.max(0.05, this.k * f)); const s = nk / this.k; this.tx = px - (px - this.tx) * s; this.ty = py - (py - this.ty) * s; this.k = nk; this.apply(); }
  zoomCenter(f: number): void { const r = this.stage.getBoundingClientRect(); this.zoomAt(r.width / 2, r.height / 2, f); }
  /** Visible area once the floating panels are subtracted (left nav, top toolbar, right inspector, presenter bar). */
  private safeArea(): { x: number; y: number; w: number; h: number } {
    const r = this.stage.getBoundingClientRect();
    const box = (id: string): DOMRect | null => { const e = document.getElementById(id); if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== "hidden" ? b : null; }; // panels are position:fixed, so offsetParent cannot be used
    const rail = box("rail"), drawer = box("drawer"), top = box("toolbar-left"), bottom = box("phud");
    const left = rail ? rail.right - r.left + 16 : 24, right = drawer ? r.right - drawer.left + 16 : 24;
    const up = top ? top.bottom - r.top + 16 : 24, down = bottom ? r.bottom - bottom.top + 16 : 24;
    return { x: left, y: up, w: Math.max(200, r.width - left - right), h: Math.max(200, r.height - up - down) };
  }
  fit(): void { const bb = this.view.getBBox(); const a = this.safeArea(); if (!bb.width) return; this.k = Math.min(1.5, Math.max(0.05, Math.min(a.w / bb.width, a.h / bb.height))); this.tx = a.x + (a.w - bb.width * this.k) / 2 - bb.x * this.k; this.ty = a.y + (a.h - bb.height * this.k) / 2 - bb.y * this.k; this.apply(); }
  focusOn(id: string): void {
    const n = this.view.querySelector<SVGGraphicsElement>(`[data-node="${CSS.escape(id)}"]`); if (!n) { this.fit(); return; }
    const bb = n.getBBox(); const m = n.getCTM(); const ctm = this.view.getCTM(); const a = this.safeArea(); if (!m || !ctm) return;
    this.k = Math.min(1.4, Math.min(a.h / bb.height, a.w / bb.width));
    const cx = (m.e - ctm.e) / ctm.a + bb.x + bb.width / 2, cy = (m.f - ctm.f) / ctm.d + bb.y + bb.height / 2;
    this.tx = a.x + a.w / 2 - cx * this.k; this.ty = a.y + a.h / 2 - cy * this.k; this.apply();
  }
}
