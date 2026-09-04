import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import type { Confidence } from "../../schema/index.js";
import { resolveHrefExpression, tag, type ResolveContext, type ResolvedHref, UNRESOLVED } from "./resolve-href-expression.js";

const STATE_KEYS = new Set(["modal", "drawer", "tab", "step", "filter", "status", "view", "dialog", "sheet"]);

/** Folds a local function return and the State Screen query keys it adds through URLSearchParams. */
export function resolveFunctionReturn(fn: t.ArrowFunctionExpression | t.FunctionExpression | t.FunctionDeclaration, path: NodePath, ctx: ResolveContext): ResolvedHref[] {
  const returns: t.Expression[] = [];
  if (t.isExpression(fn.body)) returns.push(fn.body);
  else for (const stmt of fn.body.body) if (t.isReturnStatement(stmt) && stmt.argument) returns.push(stmt.argument);
  const fnPath = findChildPath(path, fn);
  const base = returns.flatMap((r) => resolveHrefExpression(r, fnPath ?? path, ctx)).map(tag("function-return"));
  const pairs = t.isBlockStatement(fn.body) ? searchParamsSetPairs(fn.body, fnPath ?? path, ctx) : [];
  if (pairs.length === 0) return base;
  return base.flatMap((b) => pairs.map((pair) => ({ ...b, value: b.value.replace(/\?\$\{_\}$/, "") + `?${pair}`, confidence: "medium" as Confidence, pattern: `${b.pattern}>search-params-set` })));
}

/** Resolves each argument in the caller's scope before inlining a local href helper. */
export function bindArguments(fn: t.ArrowFunctionExpression | t.FunctionExpression, call: t.CallExpression, path: NodePath, ctx: ResolveContext): Map<string, ResolvedHref[]> {
  const values = new Map<string, ResolvedHref[]>();
  fn.params.forEach((param, i) => {
    const name = t.isIdentifier(param) ? param.name : t.isAssignmentPattern(param) && t.isIdentifier(param.left) ? param.left.name : null;
    const arg = call.arguments[i];
    if (!name || !arg || !t.isExpression(arg)) return;
    values.set(name, t.isArrowFunctionExpression(arg) || t.isFunctionExpression(arg) ? resolveFunctionReturn(arg, path, ctx) : resolveHrefExpression(arg, path, ctx));
  });
  return values;
}

function searchParamsSetPairs(body: t.BlockStatement, path: NodePath, ctx: ResolveContext): string[] {
  const pairs: string[] = [];
  const visit = (node: t.Node): void => {
    if (t.isCallExpression(node) && t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.property, { name: "set" }) && t.isStringLiteral(node.arguments[0]) && STATE_KEYS.has(node.arguments[0].value) && t.isExpression(node.arguments[1])) {
      for (const v of resolveHrefExpression(node.arguments[1], path, ctx)) if (v.value && !v.value.includes(UNRESOLVED)) pairs.push(`${node.arguments[0].value}=${v.value}`);
    }
    for (const key of t.VISITOR_KEYS[node.type] ?? []) {
      const child = (node as unknown as Record<string, t.Node | t.Node[] | null>)[key];
      if (Array.isArray(child)) child.forEach((c) => c && visit(c)); else if (child) visit(child);
    }
  };
  visit(body);
  return pairs;
}

function findChildPath(path: NodePath, node: t.Node): NodePath | null {
  if (path.node === node) return path;
  const holder: { found: NodePath | null } = { found: null };
  path.traverse({ enter(p: NodePath) { if (p.node === node) { holder.found = p; p.stop(); } } });
  return holder.found;
}
