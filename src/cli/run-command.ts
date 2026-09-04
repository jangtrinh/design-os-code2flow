import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { stopDevServer, portFor, serverAnswers, startDevServer, waitForServer } from "./dev-server.js";
import { exportCommand } from "./export-command.js";
import { lintCommandResult } from "./lint-command.js";
import { scanCommand } from "./scan-command.js";
import { snapshotCommand } from "./snapshot-command.js";
import { ensureLoginForRun } from "./login-command.js";
import { validateStoriesFromDisk } from "./stories-command.js";
import { loadConfig } from "../schema/code2flow-config.js";
import { loadManifest, MANIFEST_FILE } from "../schema/story-manifest.js";
import type { CanonicalFlowGraph } from "../schema/index.js";

const quiet = (): void => {};
export class RunAbort extends Error {}

export function formatRunSummary(summary: { screens: number; edges: number; captured: number; failed: number; lintErrors: number; loginGated: number; repo: string; serverUrl: string }): string {
  const line = `run  ${summary.screens} screens, ${summary.edges} edges, ${summary.captured} captured, ${summary.failed} failed, ${summary.lintErrors} lint error(s)`;
  return summary.loginGated > 0 ? `${line}\n${summary.loginGated} screens hit the sign-in page → run: code2flow login ${summary.repo} --url ${summary.serverUrl}` : line;
}

/** `run` composes existing CLI seams; it does not reproduce scanner, capture, lint, story, or export logic. */
export async function runCommand(repoArg: string, viewerDir: string, flags: Record<string, string | true>, log: (line: string) => void = console.log): Promise<number> {
  const rootDir = resolve(repoArg); const config = loadConfig(rootDir); const suppliedUrl = typeof flags.url === "string" ? flags.url : undefined;
  if (suppliedUrl && flags.dev) throw new RunAbort("pass one of --url or --dev");
  const serverUrl = suppliedUrl ?? config.serverUrl;
  if (!serverUrl) throw new RunAbort("set serverUrl in code2flow.config.json or pass --url");
  let started: ReturnType<typeof startDevServer> | undefined;
  let signalHandler: ((signal: NodeJS.Signals) => void) | undefined;
  try {
    if (!suppliedUrl) {
      if (await serverAnswers(serverUrl)) throw new RunAbort(`port ${portFor(serverUrl)} already answers (fixed-port rule: never pick another port)`);
      const command = typeof flags.dev === "string" ? flags.dev : config.devCommand ?? "npm run dev";
      log(`run  starting the app's dev server: ${command}  (from code2flow.config.json devCommand — a repo-supplied command)`); // the PO sees exactly what a cloned repo makes us execute
      started = startDevServer(command, rootDir);
      signalHandler = (signal) => { void stopDevServer(started!.process, serverUrl).finally(() => process.exit(signal === "SIGINT" ? 130 : 143)); };
      process.once("SIGINT", signalHandler); process.once("SIGTERM", signalHandler);
      try { await waitForServer(serverUrl, started.output, started.failure); } catch (error) { throw new RunAbort((error as Error).message); }
    } else if (!(await serverAnswers(serverUrl))) throw new RunAbort(`nothing answers at ${serverUrl}; start the app's dev server or drop --url to let run start it`);
    const scan = await scanCommand(rootDir, quiet);
    try { loadManifest(rootDir); } catch (error) { throw new RunAbort((error as Error).message); }
    const loginLine = await ensureLoginForRun(rootDir, serverUrl, config.login, flags.relogin === true); if (loginLine) log(loginLine);
    const snapshot = await snapshotCommand(rootDir, { ...flags, url: serverUrl }, quiet);
    let validate: { errors: number; warnings: number } | null = null;
    if (existsSync(join(rootDir, MANIFEST_FILE))) {
      const result = validateStoriesFromDisk(rootDir, quiet); validate = result.totals;
    }
    const lintResult = await lintCommandResult(rootDir, { "fail-on": flags["fail-on"] }, quiet); const lintExit = lintResult.exitCode;
    const exports = await exportCommand(rootDir, viewerDir, {}, quiet);
    const graph = JSON.parse(readFileSync(join(rootDir, ".code2flow", "graph.json"), "utf8")) as CanonicalFlowGraph;
    const tiers = { high: 0, medium: 0, low: 0 }; for (const edge of graph.edges) tiers[edge.confidence]++;
    const failed = graph.counters.snapshot?.["capture-failed"] ?? 0;
    const loginGated = Object.values(graph.counters).reduce((total, counters) => total + (counters["login-redirect"] ?? 0), 0);
    const summary = { at: new Date().toISOString(), serverUrl, startedServer: !!started, screens: scan.screens, edges: scan.edges, tiers, captured: snapshot.captured, failed, loginGated, validate, lint: lintResult.totals, exports };
    const outDir = join(rootDir, ".code2flow"); mkdirSync(outDir, { recursive: true }); writeFileSync(join(outDir, "run-summary.json"), JSON.stringify(summary, null, 2) + "\n");
    log(formatRunSummary({ screens: summary.screens, edges: summary.edges, captured: summary.captured, failed: summary.failed, lintErrors: summary.lint.error, loginGated, repo: rootDir, serverUrl }));
    return lintExit;
  } finally {
    if (signalHandler) { process.removeListener("SIGINT", signalHandler); process.removeListener("SIGTERM", signalHandler); }
    if (started) await stopDevServer(started.process, serverUrl);
  }
}
