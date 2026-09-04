import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { closestScreenIds, findShortestPaths } from "../lint/flow-paths.js";
import { lintCommand } from "./lint-command.js";
import type { CanonicalFlowGraph } from "../schema/index.js";

function graphFor(rootDir: string): CanonicalFlowGraph {
  const file = join(rootDir, ".code2flow", "graph.json");
  if (!existsSync(file)) throw new Error(`no graph.json in ${join(rootDir, ".code2flow")}: run \`code2flow scan\` first`);
  return JSON.parse(readFileSync(file, "utf8")) as CanonicalFlowGraph;
}

function hop(edge: CanonicalFlowGraph["edges"][number]): string {
  return `${edge.source} -[${edge.trigger} · ${edge.confidence} · ${edge.evidence.file}:${edge.evidence.line}]-> ${edge.target}`;
}

/** `code2flow paths`: source-evidenced shortest transitions, or the relevant flow-lint topology rule. */
export async function pathsCommand(repoArg: string, flags: Record<string, string | true>, log: (line: string) => void = console.log): Promise<number> {
  const rootDir = resolve(repoArg);
  if (flags.orphans || flags["dead-ends"]) {
    const target = flags.orphans ? "orphan-screen" : "dead-end"; const lines: string[] = [];
    await lintCommand(rootDir, {}, (line) => lines.push(line));
    const matches = lines.join("\n").split("\n").filter((line) => line.includes(target));
    log(matches.length ? matches.join("\n") : `paths  no ${target} findings`);
    return 0;
  }
  const from = typeof flags.from === "string" ? flags.from : undefined; const to = typeof flags.to === "string" ? flags.to : undefined;
  if (!from || !to) { log("paths: pass --from <screen-id> and --to <screen-id> (or --orphans / --dead-ends)"); return 2; }
  const graph = graphFor(rootDir); const ids = graph.screens.map((screen) => screen.id);
  for (const id of [from, to]) if (!ids.includes(id)) { log(`paths: unknown screen ${id}; closest ids: ${closestScreenIds(ids, id).join(", ")}`); return 2; }
  const max = typeof flags.max === "string" ? Number(flags.max) : 4;
  if (!Number.isInteger(max) || max < 1 || max > 8) { log("paths: --max must be a positive integer no greater than 8"); return 2; }
  const result = findShortestPaths(graph, from, to, max, flags.shell === true);
  if (flags.json) { log(JSON.stringify(result.paths.map((path) => path.edges), null, 2)); return result.paths.length ? 0 : 1; }
  if (result.paths.length) { for (const [index, path] of result.paths.entries()) { if (index) log(""); log(path.edges.map(hop).join("\n")); } return 0; }
  const nearby = result.reachable.slice(0, 5).map((screen) => `${screen.id} (${screen.hops})`).join(", ");
  log(`paths: no path within ${max} hops; nearest reachable screens: ${nearby || "none"}`);
  return 1;
}
