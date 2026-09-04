import type { CanonicalFlowGraph, RouteSamples } from "../schema/index.js";

/** Screen id → concrete URL to open, or null when the route has no sample yet. */
export type UrlMap = Record<string, string | null>;

/** Matches a concrete path against a route id with [param] / [...rest] segments. */
export function routeMatches(routeId: string, path: string): boolean {
  const pattern = routeId.split("/").map((seg) => (/^\[\.\.\..+\]$/.test(seg) ? ".+" : /^\[.+\]$/.test(seg) ? "[^/]+" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("/");
  return new RegExp(`^${pattern}$`).test(path.split("?")[0].split("#")[0]);
}

/**
 * Builds the URL for every screen: static routes are their own id; dynamic routes take the first
 * sample; State Screens append their `?key=value` (or `#…` for local overlays, which are rendered by
 * the parent URL and need no query).
 */
export function buildUrlMap(graph: CanonicalFlowGraph, samples: RouteSamples): UrlMap {
  const map: UrlMap = {};
  const routeUrl = (routeId: string): string | null => (routeId.includes("[") ? samples.samples[routeId]?.[0] ?? null : routeId);
  for (const s of graph.screens) {
    if (s.kind === "route") { map[s.id] = routeUrl(s.id); continue; }
    const parent = s.parentScreenId ?? s.id.split(/[?#]/)[0];
    const base = routeUrl(parent);
    if (!base) { map[s.id] = null; continue; }
    const q = s.id.includes("?") ? s.id.slice(s.id.indexOf("?")) : "";
    map[s.id] = q ? base + (base.includes("?") ? "&" + q.slice(1) : q) : base;
  }
  return map;
}

/** Anchors found on captured pages that resolve to a dynamic route still lacking a sample. */
export function discoverSamplesFromAnchors(anchors: string[], graph: CanonicalFlowGraph, samples: RouteSamples): string[] {
  const dynamicRoutes = graph.screens.filter((s) => s.kind === "route" && s.id.includes("[")).map((s) => s.id);
  const found: string[] = [];
  for (const href of anchors) {
    const path = href.split("?")[0].split("#")[0];
    if (!path.startsWith("/")) continue;
    for (const routeId of dynamicRoutes) {
      if (!routeMatches(routeId, path)) continue;
      const list = (samples.samples[routeId] ??= []);
      if (!list.includes(path)) { list.push(path); found.push(routeId); }
    }
  }
  samples.needsSample = samples.needsSample.filter((r) => !samples.samples[r]?.length);
  return [...new Set(found)];
}
