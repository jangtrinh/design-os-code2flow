import type { CanonicalFlowGraph } from "../schema/index.js";

export interface FlowDiff {
  screens: { added: string[]; removed: string[] };
  edges: { added: string[]; removed: string[]; confidenceChanged: { edge: string; from: string; to: string }[] };
  counters: { name: string; from: number; to: number }[];
  summary: string;
}

const edgeKey = (e: CanonicalFlowGraph["edges"][number]): string => `${e.scope}|${e.source} -> ${e.target}|${e.trigger}`;

/** Semantic diff between two scans of the same repo (two commits): what a reviewer should look at. Layout is never diffed. */
export function diffFlow(before: CanonicalFlowGraph, after: CanonicalFlowGraph): FlowDiff {
  const sb = new Set(before.screens.map((s) => s.id)), sa = new Set(after.screens.map((s) => s.id));
  const eb = new Map(before.edges.map((e) => [edgeKey(e), e])), ea = new Map(after.edges.map((e) => [edgeKey(e), e]));
  const confidenceChanged: FlowDiff["edges"]["confidenceChanged"] = [];
  for (const [k, e] of ea) { const o = eb.get(k); if (o && o.confidence !== e.confidence) confidenceChanged.push({ edge: k, from: o.confidence, to: e.confidence }); }
  const sum = (g: CanonicalFlowGraph): Record<string, number> => { const t: Record<string, number> = {}; for (const c of Object.values(g.counters)) for (const [k, v] of Object.entries(c)) t[k] = (t[k] ?? 0) + v; return t; };
  const cb = sum(before), ca = sum(after);
  const counters = [...new Set([...Object.keys(cb), ...Object.keys(ca)])].filter((k) => (cb[k] ?? 0) !== (ca[k] ?? 0)).map((k) => ({ name: k, from: cb[k] ?? 0, to: ca[k] ?? 0 })).sort((a, b) => a.name.localeCompare(b.name));
  const d: FlowDiff = {
    screens: { added: [...sa].filter((x) => !sb.has(x)).sort(), removed: [...sb].filter((x) => !sa.has(x)).sort() },
    edges: { added: [...ea.keys()].filter((k) => !eb.has(k)).sort(), removed: [...eb.keys()].filter((k) => !ea.has(k)).sort(), confidenceChanged },
    counters,
    summary: "",
  };
  d.summary = `screens +${d.screens.added.length} −${d.screens.removed.length} · edges +${d.edges.added.length} −${d.edges.removed.length} · confidence changed ${confidenceChanged.length} · counters changed ${counters.length}`;
  return d;
}

export function formatDiff(d: FlowDiff): string {
  const lines = [`diff  ${d.summary}`];
  for (const s of d.screens.added) lines.push(`  + screen ${s}`); for (const s of d.screens.removed) lines.push(`  - screen ${s}`);
  for (const e of d.edges.added) lines.push(`  + edge   ${e}`); for (const e of d.edges.removed) lines.push(`  - edge   ${e}`);
  for (const c of d.edges.confidenceChanged) lines.push(`  ~ edge   ${c.edge}  ${c.from} → ${c.to}`);
  for (const c of d.counters) lines.push(`  ~ counter ${c.name}  ${c.from} → ${c.to}`);
  return lines.join("\n");
}
