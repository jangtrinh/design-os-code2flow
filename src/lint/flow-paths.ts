import type { ActionEdge, CanonicalFlowGraph } from "../schema/index.js";

export interface FlowPath { edges: ActionEdge[] }
export interface FlowPathSearch { paths: FlowPath[]; reachable: { id: string; hops: number }[] }

function usableEdges(graph: CanonicalFlowGraph, includeShell: boolean): ActionEdge[] {
  const ids = new Set(graph.screens.map((s) => s.id));
  const screen = graph.edges.filter((edge) => edge.scope === "screen" && ids.has(edge.source) && ids.has(edge.target));
  if (!includeShell) return screen;
  const shell = graph.edges.filter((edge) => edge.scope === "shell" && ids.has(edge.target));
  return [...screen, ...shell.map((edge) => ({ ...edge, source: "__shell__" }))];
}

/** Breadth-first, cycle-free route search; it returns at most five equal-length shortest paths. */
export function findShortestPaths(graph: CanonicalFlowGraph, from: string, to: string, maxHops: number, includeShell = false): FlowPathSearch {
  const edges = usableEdges(graph, includeShell); const outgoing = new Map<string, ActionEdge[]>();
  for (const edge of edges) { const list = outgoing.get(edge.source) ?? []; list.push(edge); outgoing.set(edge.source, list); }
  if (includeShell) outgoing.set(from, [...(outgoing.get(from) ?? []), { id: "__shell__", source: from, target: "__shell__", trigger: "shell", confidence: "high", scope: "screen", pattern: "shell", resolved: true, evidence: { file: "shell", line: 0 } }]);
  const reachable = new Map<string, number>([[from, 0]]); const predecessors = new Map<string, ActionEdge[]>();
  const queue = [from];
  for (let index = 0; index < queue.length; index++) {
    const at = queue[index]; const hops = reachable.get(at)!;
    if (hops >= maxHops) continue;
    for (const edge of outgoing.get(at) ?? []) {
      const next = edge.target; const nextHops = hops + 1; const known = reachable.get(next);
      if (known === undefined) { reachable.set(next, nextHops); predecessors.set(next, [edge]); queue.push(next); }
      else if (known === nextHops) (predecessors.get(next) ?? []).push(edge);
    }
  }
  const paths: FlowPath[] = [];
  const build = (node: string, tail: ActionEdge[]): void => {
    if (paths.length === 5) return;
    if (node === from) { paths.push({ edges: tail }); return; }
    for (const edge of predecessors.get(node) ?? []) build(edge.source, [edge, ...tail]);
  };
  if (reachable.has(to)) build(to, []);
  return { paths, reachable: [...reachable].filter(([id]) => id !== from).map(([id, hops]) => ({ id, hops })).sort((a, b) => a.hops - b.hops || a.id.localeCompare(b.id)) };
}

export function closestScreenIds(ids: string[], value: string): string[] {
  const query = value.toLowerCase();
  return [...ids].sort((a, b) => {
    const ai = a.toLowerCase().indexOf(query), bi = b.toLowerCase().indexOf(query);
    return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi) || a.length - b.length || a.localeCompare(b);
  }).slice(0, 5);
}
