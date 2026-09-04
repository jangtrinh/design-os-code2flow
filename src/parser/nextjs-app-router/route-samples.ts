import { bump, type CanonicalFlowGraph, type Counters, type RouteSamples } from "../../schema/index.js";
import type { Code2FlowConfig } from "../../schema/code2flow-config.js";
import type { RouteResolver } from "../adapter-types.js";

export type { RouteSamples };
const DYNAMIC = /\[/;

/**
 * Sources, in order: hrefs written literally in the code (data arrays, links with concrete ids),
 * then `routeExamples` from code2flow.config.json. Routes still without a sample are counted, not hidden.
 */
export function collectRouteSamples(graph: CanonicalFlowGraph, registry: RouteResolver, config: Code2FlowConfig, counters: Counters): RouteSamples {
  const samples: Record<string, string[]> = {};
  const add = (routeId: string, url: string): void => {
    const list = (samples[routeId] ??= []);
    if (!list.includes(url)) list.push(url);
  };
  for (const e of graph.edges) {
    if (!e.href || !e.href.startsWith("/")) continue;
    const routeId = registry.resolve(e.href);
    if (routeId && DYNAMIC.test(routeId)) add(routeId, e.href.split("#")[0]);
  }
  for (const [routeId, urls] of Object.entries(config.routeExamples ?? {})) {
    if (!registry.screens.some((s) => s.id === routeId)) { bump(counters, "code2flow.config.json", "route-example-unknown-route"); continue; }
    // "omniact" for /products/[slug] is a common slip: an example must be a path the route pattern actually matches
    for (const url of urls) { if (url.startsWith("/") && registry.resolve(url.split(/[?#]/)[0]) === routeId) add(routeId, url); else bump(counters, "code2flow.config.json", "route-example-not-matching-route"); }
  }
  const needsSample = registry.screens.filter((s) => DYNAMIC.test(s.id) && !samples[s.id]).map((s) => s.id);
  for (let i = 0; i < needsSample.length; i++) bump(counters, "route-samples", "needs-sample");
  return { samples, needsSample };
}
