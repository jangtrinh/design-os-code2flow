/**
 * Recall harness: runs `ingest` on a target repo and scores the CanonicalFlowGraph
 * against a hand-labelled ground truth. Usage: npm run recall -- <repoRoot> [groundTruth.json]
 * Prints per-category numbers; never hides misses (every unmatched edge is listed by pattern).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ingest } from "../src/parser/ingest.js";
import type { ActionEdge, CanonicalFlowGraph, Confidence } from "../src/schema/index.js";

interface GtScreen { id: string; kind: string; parentScreenId?: string }
interface GtEdge { source: string; target: string; trigger: string; tierExpected: Confidence; pattern: string; evidence: string; mustResolveTarget: boolean }
interface GroundTruth { targetRepo: string; screens: GtScreen[]; edges: GtEdge[]; shellEdges: { target: string }[]; expectedCounters?: Record<string, Record<string, number>>; knownNonScreens?: { path: string; reason: string }[] }

const TIERS: Confidence[] = ["high", "medium", "low"];
const RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

function edgeKey(source: string, target: string): string { return `${source} -> ${target}`; }

function scoreScreens(gt: GroundTruth, graph: CanonicalFlowGraph): string[] {
  const lines: string[] = [];
  const kinds = ["route", "modal", "tab", "wizard-step"];
  const have = new Set(graph.screens.map((s) => s.id));
  for (const kind of kinds) {
    const expected = gt.screens.filter((s) => s.kind === kind);
    if (expected.length === 0) continue;
    const hit = expected.filter((s) => have.has(s.id));
    lines.push(`screens ${kind.padEnd(12)} ${hit.length}/${expected.length}`);
    for (const miss of expected.filter((s) => !have.has(s.id))) lines.push(`  MISS ${miss.id}`);
  }
  const extras = graph.screens.filter((s) => !gt.screens.some((g) => g.id === s.id) && s.kind !== "route");
  if (extras.length) lines.push(`  extra state screens not in ground truth: ${extras.length} (${extras.slice(0, 5).map((e) => e.id).join(", ")}${extras.length > 5 ? ", …" : ""})`);
  return lines;
}

function scoreEdges(gt: GroundTruth, graph: CanonicalFlowGraph): string[] {
  const lines: string[] = [];
  const byKey = new Map<string, ActionEdge>();
  for (const e of graph.edges.filter((e) => e.scope === "screen")) byKey.set(edgeKey(e.source, e.target), e);
  const perPattern = new Map<string, { hit: number; total: number; tierMiss: number }>();
  for (const tier of TIERS) {
    const expected = gt.edges.filter((e) => e.tierExpected === tier);
    let hit = 0;
    let tierMiss = 0;
    for (const e of expected) {
      const found = byKey.get(edgeKey(e.source, e.target));
      const stat = perPattern.get(e.pattern) ?? { hit: 0, total: 0, tierMiss: 0 };
      stat.total++;
      if (found) {
        hit++;
        stat.hit++;
        if (RANK[found.confidence] < RANK[e.tierExpected]) { tierMiss++; stat.tierMiss++; }
      } else {
        lines.push(`  MISS [${tier}] ${e.source} -> ${e.target}  (${e.pattern}; ${e.evidence})`);
      }
      perPattern.set(e.pattern, stat);
    }
    lines.unshift(`edges ${tier.padEnd(7)} ${hit}/${expected.length}${tierMiss ? `  (tier lower than expected: ${tierMiss})` : ""}`);
  }
  lines.push("per pattern:");
  for (const [pattern, s] of [...perPattern.entries()].sort((a, b) => a[1].hit / a[1].total - b[1].hit / b[1].total)) {
    lines.push(`  ${pattern.padEnd(38)} ${s.hit}/${s.total}${s.tierMiss ? `  tier-miss ${s.tierMiss}` : ""}`);
  }
  const extras = graph.edges.filter((e) => e.scope === "screen" && !gt.edges.some((g) => edgeKey(g.source, g.target) === edgeKey(e.source, e.target)));
  lines.push(`edges not in ground truth (informational): ${extras.length}`);
  return lines;
}

function scoreShellAndCounters(gt: GroundTruth, graph: CanonicalFlowGraph): string[] {
  const lines: string[] = [];
  const shellTargets = new Set(graph.edges.filter((e) => e.scope === "shell").map((e) => e.target));
  const hit = gt.shellEdges.filter((s) => shellTargets.has(s.target)).length;
  lines.push(`shell targets ${hit}/${gt.shellEdges.length}`);
  for (const [file, counters] of Object.entries(gt.expectedCounters ?? {})) {
    for (const [name, expected] of Object.entries(counters)) {
      const actual = graph.counters[file]?.[name] ?? 0;
      lines.push(`counter ${name} ${file}: ${actual}/${expected}${actual === expected ? "" : "  MISMATCH"}`);
    }
  }
  for (const k of gt.knownNonScreens ?? []) {
    const children = graph.screens.filter((s) => s.parentScreenId === k.path && s.kind === "wizard-step");
    lines.push(`non-wizard ${k.path}: ${children.length === 0 ? "ok" : `FALSE POSITIVE ${children.length} wizard steps`}`);
  }
  const totalSkipped = Object.values(graph.counters).reduce((n, c) => n + Object.values(c).reduce((a, b) => a + b, 0), 0);
  lines.push(`counters total (things seen but not emitted): ${totalSkipped}`);
  return lines;
}

async function main(): Promise<void> {
  const [repoArg, gtArg] = process.argv.slice(2);
  const gtPath = resolve(gtArg ?? "fixtures/benchmarks/platform-design-system/ground-truth.json");
  if (!existsSync(gtPath)) { console.log(`recall: no ground truth at ${gtPath} (the hand-labelled benchmark is kept outside the public repo); pass <repo> <ground-truth.json> to run it`); return; }
  const gt = JSON.parse(readFileSync(gtPath, "utf8")) as GroundTruth;
  const repoRoot = resolve(repoArg ?? gt.targetRepo);
  const started = Date.now();
  const graph = await ingest(repoRoot);
  const ms = Date.now() - started;
  const out = [
    `repo ${repoRoot}`,
    `ingest ${ms} ms · screens ${graph.screens.length} · edges ${graph.edges.length}`,
    ...scoreScreens(gt, graph),
    ...scoreEdges(gt, graph),
    ...scoreShellAndCounters(gt, graph),
  ];
  console.log(out.join("\n"));
  const reportPath = process.env.RECALL_REPORT ?? "plans/260903-1121-nextjs-app-router-ingestor-adapter/reports/recall-latest.md";
  mkdirSync(resolve(reportPath, ".."), { recursive: true });
  writeFileSync(reportPath, `# Recall report\n\nGenerated ${new Date().toISOString()} by \`npm run recall\`.\n\n\`\`\`\n${out.join("\n")}\n\`\`\`\n`);
  console.log(`report → ${reportPath}`);
}

main().catch((err: unknown) => { console.error(err); process.exit(1); });
