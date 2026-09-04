import type { ActionEdge, Confidence, Counters, ScreenNode } from "../../schema/index.js";
import * as t from "@babel/types";
import type { NavCall } from "./extract-navigation-calls.js";
import { resolveHrefExpression, type ResolvedHref } from "./resolve-href-expression.js";
import type { RouteRegistry } from "./route-registry.js";
import type { ScreenIndex } from "./screen-index.js";
import { makeLocalOverlayScreen, makeStateScreen, splitStateQuery, stateScreenId } from "./state-screens.js";
import { isLocalAssetHref } from "../asset-link.js";

export interface EdgeBuildContext {
  rootDir: string;
  registry: RouteRegistry;
  counters: Counters;
  stateScreens: Map<string, ScreenNode>;
  /** route id → query keys that page reads (built for all screens before edges, so cross-screen targets keep their state) */
  stateKeysByRoute: Map<string, Set<string>>;
  /** edge id counter owned by one ingest() call, so ids are deterministic per run */
  seq: { n: number };
}

const EXTERNAL = /^(https?:)?\/\/|^(mailto|tel):/;
const PATTERN_BY_KIND: Record<NavCall["kind"], string> = {
  link: "link-href", anchor: "anchor-href", form: "form-action", "router-push": "router-push", redirect: "redirect",
  "not-found": "not-found-call", "prop-href": "prop-href", "open-overlay": "open-overlay",
};
const RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

function bump(counters: Counters, file: string, name: string): void {
  counters[file] ??= {};
  counters[file][name] = (counters[file][name] ?? 0) + 1;
}

/** Turns every navigation call owned by one Route Screen into ActionEdges across all confidence tiers. */
export function buildScreenEdges(index: ScreenIndex, calls: NavCall[], ctx: EdgeBuildContext): ActionEdge[] {
  const edges: ActionEdge[] = [];
  const screen = index.screen;
  for (const d of index.declaredStates) ensureStateScreen(ctx, screen, d.key, d.value); // wizard steps / tabs the page switches on
  for (const call of calls) {
    const source = sourceScreenFor(call, index, ctx);
    if (call.kind === "not-found") { edges.push(edge(ctx, source, "not-found", call, "high", "not-found-call", true)); continue; }
    if (call.kind === "open-overlay") {
      const component = index.setterToComponent.get(call.targetComponent ?? "");
      if (!component) { bump(ctx.counters, call.file, "setter-without-overlay"); continue; } // not navigation, but counted
      const overlay = makeLocalOverlayScreen(screen.id, component, call.file);
      ctx.stateScreens.set(overlay.id, overlay);
      edges.push(edge(ctx, source, overlay.id, call, "medium", "open-overlay-usestate-setter", true));
      continue;
    }
    const candidates: ResolvedHref[] = call.literal !== null
      ? [{ value: call.literal, confidence: "high", pattern: `${PATTERN_BY_KIND[call.kind]}-literal` }]
      : call.expression ? resolveHrefExpression(call.expression, call.path, { rootDir: ctx.rootDir, index, file: fileOf(call, index), onLimit: (name) => bump(ctx.counters, call.file, name) }).map((r) => ({ ...r, pattern: r.pattern.startsWith("prop-object-href-") ? r.pattern : `${PATTERN_BY_KIND[call.kind]}-${r.pattern}` })) : [];
    if (candidates.length === 0 && call.kind === "link" && screen.dynamic && t.isIdentifier(call.expression) && /Url$/.test(call.expression.name)) {
      candidates.push({ value: "${_}", confidence: "medium", pattern: "link-href-base-same-route" });
    }
    if (candidates.length === 0) {
      const id = call.external ? `external:${call.exprText ?? call.snippet}` : `dynamic:${call.exprText ?? call.snippet.slice(0, 60)}`;
      edges.push(edge(ctx, source, id, call, "low", `${PATTERN_BY_KIND[call.kind]}-unresolved`, false));
      continue;
    }
    const seen = new Set<string>();
    for (const c of candidates) {
      const target = targetFor(c, source, screen, ctx, call, seen);
      if (!target) continue;
      const key = `${target.id}|${c.value}`; // two concrete hrefs to one dynamic route are two transitions
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push(edge(ctx, source, target.id, call, target.confidence, target.pattern ?? c.pattern, target.resolved, c.value.includes("${_}") ? undefined : c.value, c.evidence));
    }
  }
  return edges;
}

/** Edges raised inside (or handed to) a component rendered under a State Screen originate from that State Screen. */
function sourceScreenFor(call: NavCall, index: ScreenIndex, ctx: EdgeBuildContext): string {
  const component = call.kind === "prop-href" ? call.targetComponent : call.component;
  const state = component ? index.componentState.get(component) : undefined;
  if (!state || !component) return index.screen.id;
  const node = "local" in state ? makeLocalOverlayScreen(index.screen.id, component, call.file) : makeStateScreen(index.screen.id, state.key, state.value, index.screen.filePath);
  ctx.stateScreens.set(node.id, node);
  return node.id;
}

function fileOf(call: NavCall, index: ScreenIndex) {
  return index.files.find((f) => f.file === call.file) ?? index.files[0];
}

function ensureStateScreen(ctx: EdgeBuildContext, route: ScreenNode, key: string, value: string): string {
  const id = stateScreenId(route.id, key, value);
  if (!ctx.stateScreens.has(id)) ctx.stateScreens.set(id, makeStateScreen(route.id, key, value, route.filePath));
  return id;
}

interface Target { id: string; resolved: boolean; confidence: Confidence; pattern?: string }

function targetFor(c: ResolvedHref, sourceId: string, screen: ScreenNode, ctx: EdgeBuildContext, call: NavCall, seen: Set<string>): Target | null {
  const href = c.value;
  if (href === "" || href.startsWith("#")) { bump(ctx.counters, call.file, "anchor-hash"); return null; }
  if (EXTERNAL.test(href)) return { id: `external:${href}`, resolved: false, confidence: c.confidence };
  if (isLocalAssetHref(ctx.rootDir, href, call.file)) { bump(ctx.counters, call.file, "asset-link"); return null; }
  if (href.startsWith("${_}") && screen.dynamic && call.kind === "link") {
    const sameRouteHref = screen.id + href.slice("${_}".length);
    const { stateKey, stateValue } = splitStateQuery(sameRouteHref, ctx.stateKeysByRoute.get(screen.id) ?? new Set());
    if (stateKey && stateValue !== undefined && ctx.stateScreens.has(stateScreenId(screen.id, stateKey, stateValue))) return { id: stateScreenId(screen.id, stateKey, stateValue), resolved: true, confidence: "medium", pattern: "link-href-query-hop-same-route" };
    if (href === "${_}") return { id: screen.id, resolved: true, confidence: "medium" };
  }
  if (href.startsWith("${_}")) return { id: call.external ? `external:${call.exprText ?? href}` : `dynamic:${call.exprText ?? call.snippet.slice(0, 60)}`, resolved: false, confidence: "low" };
  const routeId = ctx.registry.resolve(href.replace(/\$\{_\}/g, "__dyn__"));
  if (!routeId) return { id: `missing:${href.split("?")[0]}`, resolved: false, confidence: c.confidence };
  // An unresolved `${}` that lands in a [param] segment is exactly what a dynamic route expects: not a real uncertainty.
  const pathPart = href.split("?")[0];
  const unresolvedInPath = pathPart.includes("${_}");
  const paramSlotOnly = unresolvedInPath && routeId.includes("[");
  const queryOnly = !unresolvedInPath && href.includes("${_}");
  const confidence: Confidence = c.confidence === "low" && c.pattern.includes("template") && (paramSlotOnly || queryOnly) ? "medium" : c.confidence;
  const targetRoute = ctx.registry.screens.find((s) => s.id === routeId) ?? screen;
  const { stateKey, stateValue } = splitStateQuery(href, ctx.stateKeysByRoute.get(routeId) ?? new Set());
  if (stateKey && stateValue !== undefined) return { id: ensureStateScreen(ctx, targetRoute, stateKey, stateValue), resolved: true, confidence };
  if (routeId === sourceId && (call.kind === "redirect" || call.kind === "router-push")) {
    if (!seen.has("__self__")) bump(ctx.counters, call.file, "normalizations"); // URL canonicalization self-loop (ADR-0005), once per call
    seen.add("__self__");
    return null;
  }
  return { id: routeId, resolved: true, confidence };
}

function edge(ctx: EdgeBuildContext, source: string, target: string, call: NavCall, confidence: Confidence, pattern: string, resolved: boolean, href?: string, evidence?: ActionEdge["evidence"]): ActionEdge {
  return {
    id: `e${++ctx.seq.n}`,
    source,
    target,
    trigger: call.kind === "redirect" ? "server redirect" : call.kind === "not-found" ? "notFound()" : pattern.startsWith("prop-object-href-") ? call.component ?? call.targetComponent ?? "Link" : call.trigger,
    confidence,
    pattern,
    evidence: evidence ?? { file: call.file, line: call.line, snippet: call.snippet },
    scope: "screen",
    resolved,
    component: (call.kind === "prop-href" ? call.targetComponent : call.component) ?? undefined,
    href,
  };
}

/**
 * Merges only true duplicates of one intent: the prop-href seen at `<Comp closeHref={x}/>` and the Link/push
 * inside Comp that uses it, or two identical (trigger + evidence line) reports. Distinct Action Triggers to the
 * same screen stay as parallel edges. Every merge is counted so nothing vanishes silently.
 */
export function dedupeEdges(edges: ActionEdge[], counters: Counters): ActionEdge[] {
  const groups = new Map<string, ActionEdge[]>();
  for (const e of edges) {
    const key = `${e.scope}|${e.source}|${e.target}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const out: ActionEdge[] = [];
  for (const group of groups.values()) {
    // A prop-href is the same intent as a Link/push inside the component that received the prop, nothing else.
    const innerComponents = new Set(group.filter((e) => !e.pattern.startsWith("prop-href")).map((e) => e.component));
    const retainedPropComponents = new Set(group.filter((e) => e.pattern.startsWith("prop-href") && (e.confidence === "high" || e.pattern.includes("data-module"))).map((e) => e.component));
    const seen = new Map<string, ActionEdge>();
    for (const e of group) {
      if (e.pattern.startsWith("prop-href") && !e.pattern.includes("data-module") && e.confidence !== "high" && e.component && innerComponents.has(e.component)) { bump(counters, e.evidence.file, "merged-prop-href-duplicate"); continue; }
      if (!e.pattern.startsWith("prop-href") && e.component && retainedPropComponents.has(e.component)) { bump(counters, e.evidence.file, "merged-prop-href-duplicate"); continue; }
      const sig = `${e.trigger}|${e.evidence.file}:${e.evidence.line}|${e.href ?? ""}`; // two concrete hrefs from one data array are two real transitions
      const prev = seen.get(sig);
      if (prev && RANK[prev.confidence] >= RANK[e.confidence]) { bump(counters, e.evidence.file, "merged-identical-edge"); continue; }
      if (prev) bump(counters, prev.evidence.file, "merged-identical-edge");
      seen.set(sig, e);
    }
    out.push(...seen.values());
  }
  return out;
}

/**
 * Pages whose JSX renders an always-open Dialog are routes that look like modals (ADR-0005).
 * A list page that conditionally renders `<ConfirmDialog>` (which itself uses `<Dialog open>`) is NOT one:
 * only files whose components are rendered unconditionally count.
 */
export function detectRouteAsModal(index: ScreenIndex): boolean {
  return index.files.some((f) => {
    if (!/<Dialog\s+open(\s|>)/.test(f.source) || /<Dialog\s+open=\{/.test(f.source)) return false;
    const definedHere = [...f.source.matchAll(/export\s+(?:default\s+)?function\s+([A-Z]\w*)|export\s+const\s+([A-Z]\w*)\s*=/g)].map((m) => m[1] ?? m[2]);
    return definedHere.length > 0 && definedHere.every((name) => !index.conditionallyRendered.has(name));
  });
}
