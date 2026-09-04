import { bump, type CanonicalFlowGraph, type Counters, type RouteSamples } from "../../schema/index.js";
import type { Code2FlowConfig } from "../../schema/code2flow-config.js";
import type { RouteResolver } from "../adapter-types.js";
import { inferDefaultLocale, knownLocales, localeSampleFor } from "./locale-samples.js";

export type { RouteSamples };
const DYNAMIC = /\[/;
const LOCALE_ROUTE = /^\/\[(locale|lang|language)\]/;

/**
 * Sources, in order: hrefs written literally in the code (data arrays, links with concrete ids),
 * then `routeExamples` from code2flow.config.json, then a `[locale]` segment filled with the app's locale
 * (`config.locale`, else next-intl's default, else messages/*.json). Every sample of a `[locale]` route carries
 * the locale prefix, because unprefixed links (`/bang-gia`) are rewritten by the app's middleware and may loop
 * locally. Routes still without a sample are counted, not hidden.
 */
export function collectRouteSamples(graph: CanonicalFlowGraph, registry: RouteResolver, config: Code2FlowConfig, counters: Counters): RouteSamples {
  const samples: Record<string, string[]> = {};
  const hasLocaleRoutes = registry.screens.some((s) => LOCALE_ROUTE.test(s.id));
  const locale = !hasLocaleRoutes ? null : config.locale ? (bump(counters, "code2flow.config.json", "locale-from-config"), config.locale) : inferDefaultLocale(graph.rootDir, counters);
  const locales = hasLocaleRoutes ? knownLocales(graph.rootDir) : [];
  /** `/bang-gia` for `/[locale]/bang-gia` → `/en/bang-gia`: the sample must name the locale the app will not rewrite. */
  const withLocale = (routeId: string, url: string): string => {
    if (!locale || !LOCALE_ROUTE.test(routeId)) return url;
    const first = url.split(/[?#]/)[0].split("/")[1] ?? "";
    return locales.includes(first) || first === locale ? url : url === "/" ? `/${locale}` : `/${locale}${url}`;
  };
  const add = (routeId: string, rawUrl: string): void => {
    const url = withLocale(routeId, rawUrl); const list = (samples[routeId] ??= []);
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
  if (locale) for (const s of registry.screens) { if (samples[s.id]) continue; const url = localeSampleFor(s.id, locale); if (url) { add(s.id, url); bump(counters, "route-samples", "locale-sample-inferred"); } }
  const needsSample = registry.screens.filter((s) => DYNAMIC.test(s.id) && !samples[s.id]).map((s) => s.id);
  for (let i = 0; i < needsSample.length; i++) bump(counters, "route-samples", "needs-sample");
  return { samples, needsSample };
}
