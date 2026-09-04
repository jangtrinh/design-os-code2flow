import type { CanonicalFlowGraph, ScreenNode } from "../schema/index.js";

/** Same title rules as the viewer, for CLI output: real h1 / dialog heading / active tab, else label or path. */
export function realTitleFor(s: ScreenNode, graph: CanonicalFlowGraph, titles: Record<string, { h1: string; dialogTitle: string; activeTab: string }>): string {
  const t = titles[s.id];
  const humanize = (id: string): string => (id.split("/").filter(Boolean).pop() ?? "home").replace(/[-_[\].]+/g, " ");
  if (s.kind === "route") return t?.h1 || s.title || humanize(s.id);
  const parent = graph.screens.find((p) => p.id === s.parentScreenId);
  const parentTitle = parent ? titles[parent.id]?.h1 || parent.title || humanize(parent.id) : "";
  const own = t?.dialogTitle || (s.kind === "tab" ? t?.activeTab?.replace(/\s*\d+$/, "") : "") || (s.label ?? "").replace(/ (modal|drawer|tab)$/i, "") || s.kind;
  return `${parentTitle} · ${own}`;
}
