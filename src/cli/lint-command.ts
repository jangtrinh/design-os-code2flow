import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { formatLintReport, lintFlow } from "../lint/flow-lint.js";
import { loadConfig } from "../schema/code2flow-config.js";
import { featureIdFor, type CanonicalFlowGraph } from "../schema/index.js";
import { loadManifest } from "../schema/story-manifest.js";

export interface LintCommandResult { exitCode: number; totals: { error: number; warn: number; info: number } }

/** `code2flow lint <repo> [--json] [--fail-on error|warn]`: exit 1 when findings at/above the threshold exist. */
export async function lintCommandResult(repoArg: string, flags: Record<string, string | true>, log: (line: string) => void = console.log): Promise<LintCommandResult> {
  const rootDir = resolve(repoArg); const dataDir = join(rootDir, ".code2flow");
  const read = <T>(name: string): T | undefined => (existsSync(join(dataDir, name)) ? (JSON.parse(readFileSync(join(dataDir, name), "utf8")) as T) : undefined);
  const graph = read<CanonicalFlowGraph>("graph.json"); if (!graph) throw new Error(`no graph.json in ${dataDir}: run \`code2flow scan\` first`);
  const config = loadConfig(rootDir); const manifest = loadManifest(rootDir);
  const features = manifest?.features ?? config.features ?? [];
  const report = lintFlow({ graph, samples: read("route-samples.json"), meta: read("shots-meta.json"), storyEntries: manifest?.stories.map((s) => s.entry), featureOf: (routeId) => featureIdFor(routeId, features) });
  if (flags.json) log(JSON.stringify(report, null, 2)); else log(formatLintReport(report));
  const failOn = typeof flags["fail-on"] === "string" ? flags["fail-on"] : "error";
  const failing = failOn === "warn" ? report.totals.error + report.totals.warn : failOn === "info" ? report.findings.length : report.totals.error;
  return { exitCode: failing > 0 ? 1 : 0, totals: report.totals };
}

export async function lintCommand(repoArg: string, flags: Record<string, string | true>, log: (line: string) => void = console.log): Promise<number> {
  return (await lintCommandResult(repoArg, flags, log)).exitCode;
}
