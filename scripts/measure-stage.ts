/**
 * Stage stepping perf harness (ADR-0008, plan phase 8): keydown → `navigated` per press, documents loaded in the live
 * frame, and frames where neither the capture nor the live app was visible.
 *
 *   npx tsx scripts/measure-stage.ts [fixtures/synthetic/stage-spa] [--presses 20] [--out file.json] [--shot file.png]
 *   npx tsx scripts/measure-stage.ts --url http://127.0.0.1:4317/#f/<feature>/s/<story>/play/0/focus   (a running `serve`)
 *
 * Without --url it serves the fixture itself on ephemeral ports. Exit 1 when p95 > 150 ms, more than one document, or any flash frame.
 */
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { serveCommand } from "../src/cli/serve-command.js";
import { launchBrowser, resolvePlaywright } from "../src/snapshot/playwright-runtime.js";
import { prepareStageSpa } from "../test/helpers/stage-spa-server.js";
import { buildStageBridge } from "./build-stage-bridge.js";
import { buildViewer } from "./build-viewer.js";

const P95_MS = 150;
type Page = { goto(u: string): Promise<unknown>; waitForTimeout(ms: number): Promise<void>; evaluate<T>(src: string): Promise<T>; keyboard: { press(k: string): Promise<void> }; screenshot(o: { path: string }): Promise<unknown>; close(): Promise<void> };
type Context = { addInitScript(src: string): Promise<void>; newPage(): Promise<Page> };

const arg = (name: string, fallback?: string): string | undefined => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const positional = process.argv.slice(2).find((a, i, all) => !a.startsWith("--") && !(i > 0 && all[i - 1].startsWith("--")));
const presses = Number(arg("presses", "20"));
const quantile = (xs: number[], q: number): number => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)] : NaN; };

// Every framed document announces itself to the page under test before its own scripts run: one message = one document.
const DOC_COUNTER = `if (window !== window.top) { try { window.parent.postMessage({ c2fMeasureDoc: location.href }, "*"); } catch {} }`;
// In-page recorder: keydown timestamps, `navigated` timestamps, and a rAF sampler that flags frames with nothing visible.
const RECORDER = `window.__m = { keys: [], navs: [], docs: 0, frames: 0, flash: 0, armed: false };
addEventListener("keydown", (e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { __m.keys.push(performance.now()); __m.armed = true; } }, true);
addEventListener("message", (e) => { if (e.data && e.data.c2fMeasureDoc) __m.docs++; if (e.data && e.data.c2f === 1 && e.data.type === "navigated") { __m.navs.push(performance.now()); __m.armed = false; } });
(function tick() { if (__m.armed) { const cap = document.querySelector(".stage-capture"), live = document.querySelector(".stage-live-frame");
  const capShown = cap && getComputedStyle(cap).visibility !== "hidden"; const liveShown = live && Number(getComputedStyle(live).opacity) > 0.99;
  __m.frames++; if (!capShown && !liveShown) __m.flash++; } requestAnimationFrame(tick); })();`;

async function main(): Promise<number> {
  let url = arg("url"); const cleanups: (() => void)[] = [];
  if (!url) {
    const fixture = resolve(positional ?? "fixtures/synthetic/stage-spa");
    await buildStageBridge(); const viewerDir = await buildViewer(join(process.cwd(), "out", "viewer"));
    let viewerOrigin = "";
    const spa = await prepareStageSpa(viewerDir, { viewerOrigins: () => [viewerOrigin] }); cleanups.push(spa.cleanup);
    if (fixture !== resolve("fixtures/synthetic/stage-spa")) console.warn(`measure-stage: only the stage-spa fixture is self-hosted; ${fixture} ignored (use --url for another app)`);
    writeFileSync(join(spa.dir, "code2flow.config.json"), JSON.stringify({ features: [{ id: "shop", title: "Shop", match: ["/", "/orders", "/settings"] }], stage: { url: spa.app.url, frameQuery: { demo: "1" }, localeParam: "lang" } }));
    const serve = await serveCommand(spa.dir, viewerDir, () => {}, { port: 0 }); viewerOrigin = serve.url; cleanups.push(serve.close);
    url = `${serve.url}/#f/shop/s/review-orders/play/0/focus`;
  }
  const browser = await launchBrowser(resolvePlaywright(process.cwd()), true);
  try {
    const ctx = (await browser.newContext({ viewport: { width: 1440, height: 900 } })) as unknown as Context;
    await ctx.addInitScript(DOC_COUNTER);
    const page = await ctx.newPage();
    await page.goto(url);
    await page.evaluate(RECORDER);
    for (let i = 0; i < 100 && (await page.evaluate<string>(`document.querySelector(".stage-frame")?.dataset.source ?? ""`)) !== "live"; i++) await page.waitForTimeout(100);
    const source = await page.evaluate<string>(`document.querySelector(".stage-frame")?.dataset.source ?? ""`);
    if (source !== "live") { console.error(`measure-stage: the Stage never went live at ${url} (${await page.evaluate<string>(`document.querySelector(".stage-meta")?.textContent ?? ""`)})`); return 1; }
    const docsBefore = await page.evaluate<number>("__m.docs");
    const total = await page.evaluate<number>(`document.querySelectorAll(".stage-thumb").length`);
    const keys = Array.from({ length: presses }, (_, i) => (Math.floor(i / Math.max(1, total - 1)) % 2 === 0 ? "ArrowRight" : "ArrowLeft"));
    for (const [i, key] of keys.entries()) {
      await page.keyboard.press(key);
      for (let w = 0; w < 60 && (await page.evaluate<number>("__m.navs.length")) < i + 1; w++) await page.waitForTimeout(50);
      if (arg("shot") && i === 2) await page.screenshot({ path: arg("shot")! });
      await page.waitForTimeout(150);
    }
    const m = await page.evaluate<{ keys: number[]; navs: number[]; docs: number; frames: number; flash: number }>("__m");
    const ms = m.navs.map((t, i) => +(t - m.keys[i]).toFixed(1));
    const docs = 1 + (m.docs - docsBefore); // the document that was live before the first press, plus every load since
    const result = { url, presses, measured: ms.length, p50: quantile(ms, 0.5), p95: quantile(ms, 0.95), max: Math.max(...ms), documents: docs, sampledFrames: m.frames, flashFrames: m.flash, steps: ms };
    console.log(`stage step latency (ms): ${ms.join(", ")}`);
    console.log(`measured ${result.measured}/${presses} · p50 ${result.p50} ms · p95 ${result.p95} ms · max ${result.max} ms · documents ${docs} · flash frames ${m.flash} of ${m.frames}`);
    if (arg("out")) writeFileSync(arg("out")!, JSON.stringify(result, null, 2) + "\n");
    const failures = [result.measured < presses && `only ${result.measured} of ${presses} presses were answered`, result.p95 > P95_MS && `p95 ${result.p95} ms > ${P95_MS} ms`, docs !== 1 && `${docs} documents (expected 1)`, m.flash > 0 && `${m.flash} flash frames`].filter(Boolean);
    if (failures.length) { console.error(`measure-stage: FAIL — ${failures.join("; ")}`); return 1; }
    console.log("measure-stage: PASS"); return 0;
  } finally { await browser.close(); for (const c of cleanups) c(); }
}

main().then((code) => process.exit(code), (err) => { console.error(`measure-stage: ${(err as Error).message}`); process.exit(1); });
