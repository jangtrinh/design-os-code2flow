import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import type { Confidence } from "../../schema/index.js";
import type { ParsedFile } from "./parse-source-file.js";
import { resolveCallSiteArgument, resolveImported, resolveMemberFromDataArray, resolvePropPassthrough } from "./resolve-href-bindings.js";
import { bindArguments, resolveFunctionReturn } from "./resolve-href-functions.js";
import type { ScreenIndex } from "./screen-index.js";

/** A candidate href value produced by folding an expression; `${_}` marks parts that stayed unresolved. */
export interface ResolvedHref {
  value: string;
  confidence: Confidence;
  pattern: string;
  /** Imported server actions report the redirect statement, not the form attribute, as their evidence. */
  evidence?: { file: string; line: number; snippet: string };
}

export interface ResolveContext {
  rootDir: string;
  index: ScreenIndex;
  file: ParsedFile;
  depth?: number;
  /** param name → values bound at an inlined call site */
  paramValues?: Map<string, ResolvedHref[]>;
  /** called when breadth or depth limits trip, so the skip is counted rather than silent */
  onLimit?: (name: string) => void;
}

const MAX_DEPTH = 12; // binding chains are finite; this only guards pathological cycles
/** Conditionals and templates multiply candidates; beyond this a page is generating URLs, not linking screens. */
const MAX_CANDIDATES = 32;
export const UNRESOLVED = "${_}"; // no "?", "#", "&", "=" so URL splitting stays valid

/**
 * Folds an href expression into concrete path candidates using one-hop constant/prop/helper
 * resolution (ADR-0005 medium tier). Returns [] when nothing about the path is knowable.
 */
export function resolveHrefExpression(expr: t.Node, path: NodePath, ctx: ResolveContext): ResolvedHref[] {
  const depth = ctx.depth ?? 0;
  if (depth > MAX_DEPTH) { ctx.onLimit?.("resolve-depth-limit"); return []; }
  const next = { ...ctx, depth: depth + 1 };
  if (t.isStringLiteral(expr)) return [{ value: expr.value, confidence: "medium", pattern: "constant" }];
  if (t.isTemplateLiteral(expr)) return foldTemplate(expr, path, next);
  if (t.isConditionalExpression(expr)) return cap([...resolveHrefExpression(expr.consequent, path, next), ...resolveHrefExpression(expr.alternate, path, next)], ctx);
  if (t.isLogicalExpression(expr)) return cap([...resolveHrefExpression(expr.left, path, next), ...resolveHrefExpression(expr.right, path, next)], ctx);
  if (t.isTSAsExpression(expr) || t.isTSNonNullExpression(expr) || t.isParenthesizedExpression(expr)) return resolveHrefExpression(expr.expression, path, next);
  if (t.isIdentifier(expr)) return resolveIdentifier(expr.name, path, next);
  if (t.isCallExpression(expr)) return resolveHelperCall(expr, path, next);
  if (t.isMemberExpression(expr)) return resolveMemberFromDataArray(expr, path, next);
  if (t.isArrowFunctionExpression(expr) || t.isFunctionExpression(expr)) return resolveFunctionReturn(expr, path, next);
  return [];
}

function cap(list: ResolvedHref[], ctx: ResolveContext): ResolvedHref[] {
  if (list.length <= MAX_CANDIDATES) return list;
  ctx.onLimit?.("candidate-breadth-limit");
  return list.slice(0, MAX_CANDIDATES);
}

function foldTemplate(tpl: t.TemplateLiteral, path: NodePath, ctx: ResolveContext): ResolvedHref[] {
  let candidates: ResolvedHref[] = [{ value: "", confidence: "medium", pattern: "template" }];
  tpl.quasis.forEach((quasi, i) => {
    const text = quasi.value.cooked ?? "";
    candidates = candidates.map((c) => ({ ...c, value: c.value + text }));
    const expr = tpl.expressions[i];
    if (!expr) return;
    const parts = t.isExpression(expr) ? resolveHrefExpression(expr, path, ctx) : [];
    if (parts.length === 0) {
      candidates = candidates.map((c) => ({ ...c, value: c.value + UNRESOLVED, confidence: "low", pattern: "template-prefix" }));
    } else {
      candidates = cap(candidates.flatMap((c) => parts.map((p) => ({ value: c.value + p.value, confidence: lower(c.confidence, p.confidence), pattern: c.pattern }))), ctx);
    }
  });
  return candidates;
}

function resolveIdentifier(name: string, path: NodePath, ctx: ResolveContext): ResolvedHref[] {
  const binding = path.scope.getBinding(name);
  if (!binding) return [];
  if (binding.kind === "module") return resolveImported(name, binding, ctx);
  if (binding.kind === "param") return ctx.paramValues?.get(name) ?? resolveIteratedLiteral(name, binding, ctx) ?? resolvePropPassthrough(name, binding, ctx);
  const declarator = binding.path.node;
  if (!t.isVariableDeclarator(declarator) || !declarator.init) return [];
  if (t.isIdentifier(declarator.id)) return resolveHrefExpression(declarator.init, binding.path, ctx).map(tag("local-const"));
  if (t.isObjectPattern(declarator.id)) {
    const prop = declarator.id.properties.find((p): p is t.ObjectProperty => t.isObjectProperty(p) && t.isIdentifier(p.value) && p.value.name === name);
    const key = prop && t.isIdentifier(prop.key) ? prop.key.name : null;
    if (key && t.isCallExpression(declarator.init)) return resolveHelperCall(declarator.init, binding.path, ctx, key);
    if (key && t.isIdentifier(declarator.init)) return resolvePropPassthrough(key, binding, ctx); // const { closeHref } = props
  }
  return [];
}

/** `tabs.map((item) => <Link href={`${base}?tab=${item}` />)` → each literal tab. */
function resolveIteratedLiteral(name: string, binding: import("@babel/traverse").Binding, ctx: ResolveContext): ResolvedHref[] | null {
  const call = binding.scope.path.parentPath;
  if (!call?.isCallExpression() || !t.isMemberExpression(call.node.callee) || !t.isIdentifier(call.node.callee.object)) return null;
  const values = arrayLiteralValues(call.scope.getBinding(call.node.callee.object.name));
  return values ? values.map((value) => ({ value, confidence: "medium", pattern: "data-array" })) : null;
}

function arrayLiteralValues(binding: import("@babel/traverse").Binding | undefined): string[] | null {
  const decl = binding?.path.node;
  if (!decl || !t.isVariableDeclarator(decl)) return null;
  const init = t.isTSAsExpression(decl.init) ? decl.init.expression : decl.init;
  if (!t.isArrayExpression(init)) return null;
  const values = init.elements.filter(t.isStringLiteral).map((item) => item.value);
  return values.length === init.elements.length ? values : null;
}

/**
 * Href-building helpers. Local functions are inlined with their arguments bound. Otherwise a call whose
 * callee name contains "href" takes a path as first argument and an optional `{ key: "value" }` patch.
 * es-debt: allowlist semantics for filterDrawerHrefs/hrefWith; upgrade trigger = a benchmark repo
 * whose helper builds URLs differently (then evaluate the helper body instead).
 */
function resolveHelperCall(call: t.CallExpression, path: NodePath, ctx: ResolveContext, destructuredKey?: string): ResolvedHref[] {
  const callee = call.callee;
  const name = t.isIdentifier(callee) ? callee.name : t.isMemberExpression(callee) && t.isIdentifier(callee.property) ? callee.property.name : "";
  if (t.isIdentifier(callee)) {
    const binding = path.scope.getBinding(callee.name);
    const decl = binding?.path.node;
    if (binding && binding.kind !== "module" && t.isVariableDeclarator(decl) && (t.isArrowFunctionExpression(decl.init) || t.isFunctionExpression(decl.init))) {
      const inlined = resolveFunctionReturn(decl.init, binding.path, { ...ctx, paramValues: bindArguments(decl.init, call, path, ctx) });
      if (inlined.length) return inlined;
    }
    if (binding && t.isFunctionDeclaration(decl) && binding.kind !== "module" && !/href/i.test(name)) {
      const inlined = resolveFunctionReturn(decl, binding.path, ctx);
      if (inlined.length) return inlined;
    }
    if (binding && binding.kind === "param") {
      // `editHref(row.id)` where editHref is itself a parameter: resolve whatever the caller passed in.
      const passed = ctx.paramValues?.get(callee.name) ?? resolvePropPassthrough(callee.name, binding, ctx);
      if (passed.length) return passed;
    }
  }
  if (!/href/i.test(name) || call.arguments.length === 0) return [];
  const first = call.arguments[0];
  if (!t.isExpression(first)) return [];
  const bases = resolveHrefExpression(first, path, ctx);
  if (bases.length === 0) return [];
  const patch = call.arguments.find((a): a is t.ObjectExpression => t.isObjectExpression(a));
  const pairs: string[] = [];
  for (const prop of patch?.properties ?? []) {
    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) && t.isStringLiteral(prop.value)) pairs.push(`${prop.key.name}=${prop.value.value}`);
  }
  if (destructuredKey === "openHref" && /filter/i.test(name)) pairs.push("filter=open");
  const query = pairs.length ? `?${pairs.join("&")}` : "";
  return bases.map((b) => ({ value: b.value.split("?")[0] + query, confidence: "medium", pattern: "href-helper" }));
}

function lower(a: Confidence, b: Confidence): Confidence {
  const rank = { high: 3, medium: 2, low: 1 } as const;
  return rank[a] <= rank[b] ? a : b;
}

export function tag(pattern: string): (r: ResolvedHref) => ResolvedHref {
  return (r) => ({ ...r, pattern: r.pattern === "constant" ? pattern : `${pattern}>${r.pattern}` });
}
