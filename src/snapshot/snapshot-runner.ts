import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { bump, type CanonicalFlowGraph, type Counters, type RouteSamples } from "../schema/index.js";
import type { Code2FlowConfig } from "../schema/code2flow-config.js";
import { captureContentFit, type CaptureResult } from "./capture-content-fit.js";
import { launchBrowser, resolvePlaywright, type PageLike } from "./playwright-runtime.js";
import { shotFileKey, shotFiles } from "./shot-file-key.js";
import { buildUrlMap, discoverSamplesFromAnchors, routeMatches } from "./url-map.js";

export interface SnapshotOptions { serverUrl: string; storageState?: string; concurrency?: number; headless?: boolean; log?: (line: string) => void }
export interface SnapshotSummary { captured: number; skipped: string[]; discovered: string[]; loginRedirects: string[]; capped: string[]; outDir: string; authenticated: boolean }

/** Written once per run next to the shots: what the captures were taken against. `export` warns when `authenticated`. */
export interface SnapshotRun { at: string; serverUrl: string; authenticated: boolean; captured: number }

export const DEFAULT_STORAGE_STATE = ".code2flow/storage-state.json";

/** `--storage-state` wins, then the config value (relative to the target repo), then `.code2flow/storage-state.json` when it exists. */
export function resolveStorageState(rootDir: string, flag: string | undefined, config: Code2FlowConfig): string | undefined {
  const pick = flag ?? config.storageState;
  if (pick) { const p = isAbsolute(pick) ? pick : resolve(rootDir, pick); if (!existsSync(p)) throw new Error(`storage state file not found: ${p}`); return p; }
  const dflt = join(rootDir, DEFAULT_STORAGE_STATE);
  return existsSync(dflt) ? dflt : undefined;
}

/**
 * Captures every screen that has a URL. Two passes: pages captured in pass 1 reveal anchors to
 * dynamic routes that had no sample, so pass 2 captures those too. Every skip is a counter.
 */
export async function runSnapshot(rootDir: string, graph: CanonicalFlowGraph, samples: RouteSamples, config: Code2FlowConfig, opts: SnapshotOptions): Promise<SnapshotSummary> {
  const log = opts.log ?? console.log;
  const outDir = join(rootDir, ".code2flow"); const shotsDir = join(outDir, "shots"); mkdirSync(shotsDir, { recursive: true });
  const counters: Counters = graph.counters; delete counters.snapshot; // this run replaces the previous run's capture counters
  const storage = resolveStorageState(rootDir, opts.storageState, config);
  const ctxOpts: Record<string, unknown> = { viewport: { width: config.capture.baseWidth, height: config.capture.baseHeight }, deviceScaleFactor: 1, ...(storage ? { storageState: storage } : {}) };
  if (storage) log(`  using session ${storage}`);
  const meta: Record<string, CaptureResult> = {}; const done = new Set<string>(); const loginRedirects: string[] = []; const discovered: string[] = []; const capped: string[] = [];
  const accessRoutes = graph.screens.filter((s) => s.kind === "route" && /sign-?in|log-?in|auth/i.test(s.id)).map((s) => s.id);
  const order = graph.screens.map((s) => s.id);
  const pw = resolvePlaywright(rootDir);
  const browser = await launchBrowser(pw, opts.headless ?? true);
  try {
    const pass = async (): Promise<void> => {
      const urlMap = buildUrlMap(graph, samples);
      const jobs = order.filter((id) => urlMap[id] && !done.has(id)).map((id) => [id, urlMap[id] as string, 0] as [string, string, number]);
      const n = Math.max(1, Math.min(opts.concurrency ?? 4, jobs.length));
      const workers = Array.from({ length: n }, async () => {
        const ctx = await browser.newContext(ctxOpts);
        try {
          const page: PageLike = await ctx.newPage();
          while (jobs.length) {
            const [id, url, attempt] = jobs.shift()!;
            try {
              const screen = graph.screens.find((candidate) => candidate.id === id);
              const r = await captureContentFit(page, opts.serverUrl.replace(/\/$/, ""), url, shotFiles(shotsDir, id), config.capture, screen?.hoverTriggerSelector);
              meta[id] = r; done.add(id);
              if (r.clippedAtCap) { capped.push(id); bump(counters, "snapshot", "capture-capped"); }
              const landed = graph.screens.find((s) => s.kind === "route" && routeMatches(s.id, r.finalPath))?.id;
              const ownRoute = graph.screens.find((s) => s.id === id)?.parentScreenId ?? id;
              if (landed && landed !== ownRoute && r.finalPath !== url.split("?")[0] && accessRoutes.includes(landed)) { loginRedirects.push(id); bump(counters, "snapshot", "login-redirect"); log(`  login redirect: ${id} landed on ${landed}`); }
            } catch (err) {
              // A dev server compiling a page on first hit routinely exceeds the navigation timeout: one retry at the end of the queue.
              if (attempt === 0) { jobs.push([id, url, 1]); bump(counters, "snapshot", "capture-retried"); continue; }
              bump(counters, "snapshot", "capture-failed"); log(`  capture failed ${id} ${url}: ${String((err as Error).message).slice(0, 90)}`); done.add(id);
            }
          }
        } finally { await ctx.close(); }
      });
      await Promise.all(workers);
    };
    await pass();
    const found = discoverSamplesFromAnchors(Object.values(meta).flatMap((m) => m.anchors), graph, samples);
    if (found.length) { discovered.push(...found); log(`  discovered samples from page links for ${found.length} dynamic route(s); capturing them`); await pass(); }
  } finally { await browser.close(); }
  const skipped = order.filter((id) => !done.has(id));
  for (let i = 0; i < skipped.length; i++) bump(counters, "snapshot", "no-url");
  const stale = pruneStaleShots(shotsDir, graph); if (stale) log(`  removed ${stale} stale screenshot file(s) of screens no longer in the graph`);
  writeFileSync(join(outDir, "shots-meta.json"), JSON.stringify(Object.fromEntries(Object.entries(meta).map(([id, m]) => [id, { url: m.url, width: m.width, height: m.height, dialog: m.dialog, clippedAtCap: m.clippedAtCap || undefined }])), null, 1));
  writeFileSync(join(outDir, "titles.json"), JSON.stringify(Object.fromEntries(Object.entries(meta).map(([id, m]) => [id, m.titles])), null, 1));
  writeFileSync(join(outDir, "url-map.json"), JSON.stringify(buildUrlMap(graph, samples), null, 1));
  writeFileSync(join(outDir, "route-samples.json"), JSON.stringify(samples, null, 2));
  writeFileSync(join(outDir, "graph.json"), JSON.stringify(graph, null, 2)); // counters updated
  const run: SnapshotRun = { at: new Date().toISOString(), serverUrl: opts.serverUrl, authenticated: !!storage, captured: Object.keys(meta).length };
  writeFileSync(join(outDir, "snapshot-run.json"), JSON.stringify(run, null, 1));
  const failed = counters.snapshot?.["capture-failed"] ?? 0;
  log(`snapshot  ${run.captured} captured, ${failed} failed, ${skipped.length} without a URL, ${loginRedirects.length} login redirect(s), ${capped.length} hit the size cap → ${shotsDir}`);
  return { captured: run.captured, skipped, discovered, loginRedirects, capped, outDir, authenticated: run.authenticated };
}

/** Deletes shot files whose key belongs to no current screen (the tool's own output dir; nothing of the target repo). */
function pruneStaleShots(shotsDir: string, graph: CanonicalFlowGraph): number {
  const live = new Set(graph.screens.map((s) => shotFileKey(s.id)));
  let n = 0;
  for (const f of readdirSync(shotsDir)) { const key = f.replace(/(-dialog)?\.jpg$/, ""); if (f.endsWith(".jpg") && !live.has(key)) { rmSync(join(shotsDir, f), { force: true }); n++; } }
  return n;
}

export function readGraph(rootDir: string): { graph: CanonicalFlowGraph; samples: RouteSamples } {
  const outDir = join(rootDir, ".code2flow");
  const gp = join(outDir, "graph.json"), sp = join(outDir, "route-samples.json");
  if (!existsSync(gp)) throw new Error(`no ${gp}: run \`code2flow scan\` first`);
  return { graph: JSON.parse(readFileSync(gp, "utf8")), samples: existsSync(sp) ? JSON.parse(readFileSync(sp, "utf8")) : { samples: {}, needsSample: [] } };
}
