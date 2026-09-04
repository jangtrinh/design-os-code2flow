import type { CaptureConfig } from "../schema/code2flow-config.js";
import type { PageLike } from "./playwright-runtime.js";

export interface CaptureResult {
  url: string;
  width: number;
  height: number;
  dialog?: { width: number; height: number };
  titles: { h1: string; dialogTitle: string; activeTab: string; docTitle: string };
  /** same-origin anchors on the page, for dynamic-route sample discovery */
  anchors: string[];
  finalPath: string;
  /** the page needed more than capWidth × capHeight: the capture is truncated (counted as `capture-capped`) */
  clippedAtCap: boolean;
}

/**
 * Browser-side code is kept as plain JS source strings: a serialized TypeScript function would carry
 * esbuild/tsx helpers (`__name`) that do not exist in the page and throw `ReferenceError` at runtime.
 */
const MEASURE_NEEDED_JS = `(() => {
  let extraH = 0, extraW = 0;
  for (const e of Array.from(document.querySelectorAll("*"))) {
    const s = getComputedStyle(e);
    if (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 2 && e.clientHeight > 200) extraH = Math.max(extraH, e.scrollHeight - e.clientHeight);
    if (/(auto|scroll)/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 200) extraW = Math.max(extraW, e.scrollWidth - e.clientWidth);
  }
  return { needH: Math.max(document.documentElement.scrollHeight, innerHeight + extraH), needW: Math.max(document.documentElement.scrollWidth, innerWidth + extraW) };
})()`;

const READ_TITLES_AND_ANCHORS_JS = `(() => {
  const txt = (el) => (el ? (el.textContent || "").replace(/\\s+/g, " ").trim() : "");
  const dlg = document.querySelector('[role="dialog"]');
  let dialogTitle = "";
  if (dlg) { const lab = dlg.getAttribute("aria-labelledby"); dialogTitle = txt(lab ? document.getElementById(lab) : null) || txt(dlg.querySelector("h1,h2,h3,[id$='title'],[class*='title']")); }
  const main = document.querySelector("main") || document.body;
  const h1 = txt(main.querySelector("h1")) || txt(document.querySelector("h1"));
  const activeTab = txt(document.querySelector('[role="tab"][aria-selected="true"], [data-state="active"][role="tab"]'));
  const anchors = Array.from(document.querySelectorAll("a[href]")).map((a) => a.getAttribute("href") || "").filter((h) => h.startsWith("/"));
  return { h1, dialogTitle, activeTab, docTitle: document.title.replace(/\\s+/g, " ").trim(), anchors: Array.from(new Set(anchors)) };
})()`;

/** Scrolls through every scroller so lazy content (IntersectionObserver, infinite lists) mounts, then returns to the top. */
const SCROLL_SWEEP_JS = `(async () => {
  const scrollers = [document.scrollingElement || document.documentElement, ...Array.from(document.querySelectorAll("*")).filter((e) => { const s = getComputedStyle(e); return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 2 && e.clientHeight > 200; })];
  for (const el of scrollers) { const step = Math.max(300, el.clientHeight * 0.8); for (let y = 0; y < el.scrollHeight; y += step) { el.scrollTop = y; await new Promise((r) => setTimeout(r, 60)); } el.scrollTop = el.scrollHeight; await new Promise((r) => setTimeout(r, 120)); el.scrollTop = 0; }
  return scrollers.length;
})()`;

/** True when fonts are ready and every image has finished loading (or failed). */
const ASSETS_READY_JS = `(async () => {
  if (document.fonts && document.fonts.status !== "loaded") { try { await document.fonts.ready; } catch {} }
  const imgs = Array.from(document.images);
  await Promise.all(imgs.map((img) => img.complete ? null : new Promise((r) => { img.addEventListener("load", r, { once: true }); img.addEventListener("error", r, { once: true }); setTimeout(r, 4000); })));
  return imgs.filter((i) => !i.complete || i.naturalWidth === 0).length;
})()`;

interface Measured { needH: number; needW: number }
interface TitlesAndAnchors { h1: string; dialogTitle: string; activeTab: string; docTitle: string; anchors: string[] }

/**
 * Waits until the page has really finished: network idle (bounded), fonts + images, a scroll sweep that
 * mounts lazy content, then two identical layout measurements 300 ms apart. Pages captured half-loaded
 * were the first complaint from the pilot, so every step here is bounded and never skipped silently.
 */
async function settle(page: PageLike, quick = false): Promise<void> {
  if (!quick) { try { await page.waitForLoadState("networkidle", { timeout: 8000 }); } catch { /* long-polling apps never go idle; bounded wait is enough */ } }
  await page.evaluate<number>(SCROLL_SWEEP_JS);
  await page.evaluate<number>(ASSETS_READY_JS);
  // Layout must be unchanged across two measurements 400 ms apart AND at least 1 s must have passed:
  // skeletons and deferred mounts routinely land between 500 ms and 1 s after `load`.
  const t0 = Date.now(); let last = "";
  for (let i = 0; i < 10; i++) {
    const now = JSON.stringify(await page.evaluate<Measured>(MEASURE_NEEDED_JS));
    if (now === last && Date.now() - t0 >= (quick ? 400 : 1000)) break;
    last = now; await page.waitForTimeout(400);
  }
  if (!quick) await page.evaluate<number>(SCROLL_SWEEP_JS); // content mounted late may itself be lazy
}

/**
 * Opens one URL, grows the viewport in both axes until nothing is clipped (bounded by caps),
 * screenshots the page (JPEG) and the `[role=dialog]` element when present, and reads real titles.
 */
export async function captureContentFit(page: PageLike, base: string, url: string, out: { full: string; dialog: string }, cfg: CaptureConfig): Promise<CaptureResult> {
  await page.setViewportSize({ width: cfg.baseWidth, height: cfg.baseHeight });
  await page.goto(base + url, { waitUntil: "load", timeout: 60000 });
  await settle(page);
  let vw = cfg.baseWidth, vh = cfg.baseHeight, clippedAtCap = false;
  for (let i = 0; i < 4; i++) {
    const { needH, needW } = await page.evaluate<Measured>(MEASURE_NEEDED_JS);
    const nw = Math.min(Math.max(vw, needW + 8), cfg.capWidth), nh = Math.min(Math.max(vh, needH + 8), cfg.capHeight);
    clippedAtCap = needW + 8 > cfg.capWidth || needH + 8 > cfg.capHeight;
    if (nw === vw && nh === vh) break;
    vw = nw; vh = nh;
    await page.setViewportSize({ width: vw, height: vh });
    await settle(page, true); // a bigger viewport mounts more lazy content
  }
  await page.screenshot({ path: out.full, type: "jpeg", quality: cfg.quality });
  const meta = await page.evaluate<TitlesAndAnchors>(READ_TITLES_AND_ANCHORS_JS);
  const result: CaptureResult = { url, width: vw, height: vh, titles: { h1: meta.h1, dialogTitle: meta.dialogTitle, activeTab: meta.activeTab, docTitle: meta.docTitle }, anchors: meta.anchors, finalPath: new URL(page.url()).pathname, clippedAtCap };
  const dlg = page.locator('[role="dialog"]').first();
  if (await dlg.count()) {
    const box = await dlg.boundingBox();
    if (box && box.width > 80 && box.height > 40) { await dlg.screenshot({ path: out.dialog, type: "jpeg", quality: Math.min(100, cfg.quality + 5) }); result.dialog = { width: Math.round(box.width), height: Math.round(box.height) }; }
  }
  return result;
}
