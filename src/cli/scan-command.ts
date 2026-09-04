import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ingestDetailed } from "../parser/ingest.js";
import { collectRouteSamples } from "../parser/nextjs-app-router/route-samples.js";
import { CONFIG_FILE, loadConfig } from "../schema/code2flow-config.js";
import type { CanonicalFlowGraph } from "../schema/index.js";

export interface ScanResult { outDir: string; screens: number; edges: number; needsSample: string[]; counterTotal: number }

/** `code2flow scan <repo>`: graph + route samples into <repo>/.code2flow/. Never writes anywhere else in the target repo. */
export async function scanCommand(repoArg: string, log: (line: string) => void = console.log): Promise<ScanResult> {
  const rootDir = resolve(repoArg);
  const config = loadConfig(rootDir);
  const { graph, resolver } = await ingestDetailed(rootDir);
  const samples = collectRouteSamples(graph, resolver, config, graph.counters);
  const outDir = join(rootDir, ".code2flow");
  mkdirSync(outDir, { recursive: true });
  keepSnapshotCounters(join(outDir, "graph.json"), graph);
  writeFileSync(join(outDir, "graph.json"), JSON.stringify(graph, null, 2));
  writeFileSync(join(outDir, "route-samples.json"), JSON.stringify(samples, null, 2));
  const counterTotal = Object.values(graph.counters).reduce((n, c) => n + Object.values(c).reduce((a, b) => a + b, 0), 0);
  const routes = graph.screens.filter((s) => s.kind === "route").length;
  log(`scan  ${rootDir}`);
  log(`      ${routes} routes, ${graph.screens.length - routes} state screens, ${graph.edges.length} edges → ${join(outDir, "graph.json")}`);
  log(`      route samples: ${Object.keys(samples.samples).length} dynamic routes have samples, ${samples.needsSample.length} need one${samples.needsSample.length ? ` (add to ${CONFIG_FILE} routeExamples): ${samples.needsSample.join(", ")}` : ""}`);
  const badExamples = graph.counters[CONFIG_FILE]?.["route-example-not-matching-route"] ?? 0;
  if (badExamples) log(`      ${badExamples} routeExamples ignored: an example must be a full path its route matches, e.g. "/products/omniact" for /products/[slug]`);
  log(`      ${counterTotal} things seen but not emitted (counters in graph.json)`);
  if (!gitignoreCoversOutput(rootDir)) log(`hint: add .code2flow/ to ${rootDir}/.gitignore`);
  return { outDir, screens: graph.screens.length, edges: graph.edges.length, needsSample: samples.needsSample, counterTotal };
}

/** Read-only check; never edits the target repo's .gitignore. */
function gitignoreCoversOutput(rootDir: string): boolean {
  const f = join(rootDir, ".gitignore");
  return existsSync(f) && readFileSync(f, "utf8").includes(".code2flow");
}

/** A re-scan must not erase what the last `snapshot` recorded (capture-failed, no-url, …) while its shots still exist. */
function keepSnapshotCounters(previousGraphPath: string, graph: CanonicalFlowGraph): void {
  if (!existsSync(previousGraphPath)) return;
  try { const prev = JSON.parse(readFileSync(previousGraphPath, "utf8")) as CanonicalFlowGraph; if (prev.counters?.snapshot) graph.counters.snapshot = prev.counters.snapshot; }
  catch { /* unreadable previous graph: nothing to carry over */ }
}
