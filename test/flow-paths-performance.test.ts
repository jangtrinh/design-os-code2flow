import { describe, expect, it } from "vitest";
import { findShortestPaths } from "../src/lint/flow-paths.js";
import type { CanonicalFlowGraph } from "../src/schema/index.js";

/** 40 route screens, ~300 edges, target unreachable: a path-enumerating search blows up here; BFS must not. */
function syntheticGraph(): CanonicalFlowGraph {
  const screens = Array.from({ length: 40 }, (_, i) => ({ id: `/s${i}`, kind: "route" as const, filePath: `app/s${i}/page.tsx` }));
  const edges = [];
  for (let i = 0; i < 40; i++) for (let k = 0; k <= 7; k++) { const j = k === 0 ? (i + 1) % 40 : (i * 13 + k * 17) % 40; if (j !== i) edges.push({ id: `e${i}-${k}`, source: `/s${i}`, target: `/s${j}`, trigger: "Link", confidence: "high" as const, pattern: "link-href-literal", scope: "screen" as const, evidence: { file: `app/s${i}/page.tsx`, line: k }, resolved: true }); }
  screens.push({ id: "/island", kind: "route", filePath: "app/island/page.tsx" }); // no edge reaches it
  return { screens, edges, counters: {} } as CanonicalFlowGraph;
}

describe("flow-paths BFS (pure)", () => {
  it("stays fast at the --max cap with an unreachable target and a dense graph", () => {
    const graph = syntheticGraph(); expect(graph.edges.length).toBeGreaterThan(280);
    const t0 = performance.now(); const r = findShortestPaths(graph, "/s0", "/island", 8);
    expect(performance.now() - t0).toBeLessThan(200);
    expect(r.paths).toEqual([]); expect(r.reachable.length).toBeGreaterThan(30);
  });
  it("returns at most five equal-length shortest paths", () => {
    const r = findShortestPaths(syntheticGraph(), "/s0", "/s5", 8);
    expect(r.paths.length).toBeGreaterThan(0); expect(r.paths.length).toBeLessThanOrEqual(5);
    const lens = new Set(r.paths.map((p) => p.edges.length)); expect(lens.size).toBe(1);
  });
});
