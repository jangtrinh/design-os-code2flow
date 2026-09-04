import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { diffFlow, formatDiff } from "../lint/flow-diff.js";
import type { CanonicalFlowGraph } from "../schema/index.js";

/**
 * `code2flow diff <repo> --from <graph.json|repo> [--json]`: semantic diff between an earlier scan and the current one.
 * Typical CI use: keep the previous `.code2flow/graph.json` as an artifact and diff the new scan against it.
 */
export async function diffCommand(repoArg: string, flags: Record<string, string | true>, log: (line: string) => void = console.log): Promise<number> {
  const rootDir = resolve(repoArg);
  const current = join(rootDir, ".code2flow", "graph.json");
  if (!existsSync(current)) throw new Error(`no ${current}: run \`code2flow scan\` first`);
  if (typeof flags.from !== "string") throw new Error("pass --from <previous graph.json or repo path>");
  let fromPath = resolve(flags.from);
  if (existsSync(join(fromPath, ".code2flow", "graph.json"))) fromPath = join(fromPath, ".code2flow", "graph.json");
  if (!existsSync(fromPath)) throw new Error(`${fromPath} not found`);
  const before = JSON.parse(readFileSync(fromPath, "utf8")) as CanonicalFlowGraph;
  const after = JSON.parse(readFileSync(current, "utf8")) as CanonicalFlowGraph;
  const d = diffFlow(before, after);
  if (flags.json) log(JSON.stringify(d, null, 2)); else log(formatDiff(d));
  const changed = d.screens.added.length + d.screens.removed.length + d.edges.added.length + d.edges.removed.length + d.edges.confidenceChanged.length;
  return flags["exit-code"] && changed ? 1 : 0;
}
