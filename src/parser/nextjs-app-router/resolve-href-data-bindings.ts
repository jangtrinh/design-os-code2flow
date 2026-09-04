import type { Binding, NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { lineOf, snippetAt } from "./parse-source-file.js";
import { findExportedArray, importedName } from "./resolve-href-imports.js";
import { resolveSourceModule } from "./resolve-source-module.js";
import { resolveHrefExpression, tag, type ResolveContext, type ResolvedHref } from "./resolve-href-expression.js";

/** `function Dialog({ closeHref })` → resolve the corresponding component prop at its one-hop usage. */
export function resolvePropPassthrough(propName: string, binding: Binding, ctx: ResolveContext): ResolvedHref[] {
  const owner = owningFunctionName(binding);
  if (!owner) return [];
  const usages = ctx.index.props.get(owner.name)?.get(propName) ?? [];
  if (usages.length) return usages.flatMap((u) => resolveHrefExpression(u.expr, u.path, { ...ctx, file: u.parsed })).map(tag("prop-passthrough"));
  return resolveCallSiteArgument(propName, binding, ctx);
}

/** `function buildColumns(editHref)` called as `buildColumns((id) => …)`: use the argument in the matching slot. */
export function resolveCallSiteArgument(paramName: string, binding: Binding, ctx: ResolveContext): ResolvedHref[] {
  const owner = owningFunctionName(binding);
  const fnNode = owner?.fn.node;
  if (!owner || !fnNode || !t.isFunction(fnNode)) return [];
  const position = fnNode.params.findIndex((p) => (t.isIdentifier(p) && p.name === paramName) || (t.isAssignmentPattern(p) && t.isIdentifier(p.left) && p.left.name === paramName));
  if (position < 0) return [];
  const out: ResolvedHref[] = [];
  for (const site of ctx.index.calls.get(owner.name) ?? []) {
    const arg = site.args[position];
    if (arg && t.isExpression(arg)) out.push(...resolveHrefExpression(arg, site.path, { ...ctx, file: site.parsed }));
  }
  return out.map(tag("call-site-arg"));
}

/** `item.href` where item comes from a literal data array directly or through one component object prop. */
export function resolveMemberFromDataArray(expr: t.MemberExpression, path: NodePath, ctx: ResolveContext): ResolvedHref[] {
  if (!t.isIdentifier(expr.object) || !t.isIdentifier(expr.property) || expr.computed) return [];
  const binding = path.scope.getBinding(expr.object.name);
  if (!binding) return [];
  const propertyName = expr.property.name;
  const found = binding.kind === "param" ? arrayIteratedBy(binding, ctx) ?? arrayBehindProp(expr.object.name, binding, ctx) : arrayIndexedBy(binding, ctx);
  if (!found) return [];
  const pattern = found.imported ? found.usage ? "prop-object-href-data-module" : "data-module" : found.usage ? "prop-object-href-data-array" : "data-array";
  return found.array.elements.flatMap((element) => {
    if (!t.isObjectExpression(element)) return [];
    const property = element.properties.find((candidate): candidate is t.ObjectProperty => t.isObjectProperty(candidate) && t.isIdentifier(candidate.key) && candidate.key.name === propertyName);
    return property && t.isStringLiteral(property.value) ? [{ value: property.value.value, confidence: "medium" as const, pattern, evidence: found.usage ? { file: found.usage.parsed.file, line: lineOf(found.usage.path.node), snippet: snippetAt(found.usage.parsed, found.usage.path.node) } : undefined }] : [];
  });
}

interface ArraySource { array: t.ArrayExpression; imported: boolean; usage?: { parsed: ResolveContext["file"]; path: NodePath } }

function arrayIteratedBy(binding: Binding, ctx: ResolveContext): ArraySource | null {
  const call = binding.scope.path.parentPath;
  if (!call?.isCallExpression() || !t.isMemberExpression(call.node.callee) || !t.isIdentifier(call.node.callee.object)) return null;
  return arrayBoundTo(call.scope.getBinding(call.node.callee.object.name), call.node.callee.object.name, ctx);
}

function arrayIndexedBy(binding: Binding, ctx: ResolveContext): ArraySource | null {
  const declarator = binding.path.node;
  if (!t.isVariableDeclarator(declarator) || !t.isMemberExpression(declarator.init) || !declarator.init.computed || !t.isIdentifier(declarator.init.object)) return null;
  return arrayBoundTo(binding.path.scope.getBinding(declarator.init.object.name), declarator.init.object.name, ctx);
}

function arrayBoundTo(binding: Binding | undefined, name: string, ctx: ResolveContext): ArraySource | null {
  if (!binding) return null;
  const decl = binding.path.node;
  if (t.isVariableDeclarator(decl) && t.isArrayExpression(decl.init)) return { array: decl.init, imported: false };
  if (t.isVariableDeclarator(decl) && decl.init && t.isExpression(decl.init)) {
    const derived = derivedArray(decl.init, binding, ctx);
    if (derived) return derived;
  }
  if (binding.kind !== "module") return null;
  const importDecl = binding.path.parentPath?.node;
  if (!importDecl || !t.isImportDeclaration(importDecl)) return null;
  const file = resolveSourceModule(importDecl.source.value, ctx.file.absPath, ctx.rootDir, ctx.onLimit);
  const array = file ? findExportedArray(file, importedName(binding.path.node, name)) : null;
  return array ? { array, imported: true } : null;
}

/** A filtered list is still the same static source only when both conditional branches lead to it. */
function derivedArray(expr: t.Expression, binding: Binding, ctx: ResolveContext): ArraySource | null {
  if (t.isConditionalExpression(expr)) {
    const consequent = derivedArray(expr.consequent, binding, ctx);
    const alternate = derivedArray(expr.alternate, binding, ctx);
    return consequent && alternate && consequent.array === alternate.array ? consequent : null;
  }
  if (!t.isCallExpression(expr) || !t.isMemberExpression(expr.callee) || !t.isIdentifier(expr.callee.object) || !t.isIdentifier(expr.callee.property, { name: "filter" })) return t.isIdentifier(expr) ? arrayBoundTo(binding.path.scope.getBinding(expr.name), expr.name, ctx) : null;
  return arrayBoundTo(binding.path.scope.getBinding(expr.callee.object.name), expr.callee.object.name, ctx);
}

function arrayBehindProp(propName: string, binding: Binding, ctx: ResolveContext): ArraySource | null {
  const owner = owningFunctionName(binding);
  if (!owner) return null;
  for (const usage of ctx.index.props.get(owner.name)?.get(propName) ?? []) {
    if (!t.isIdentifier(usage.expr)) continue;
    const outerBinding = usage.path.scope.getBinding(usage.expr.name);
    const array = outerBinding?.kind === "param" ? arrayIteratedBy(outerBinding, { ...ctx, file: usage.parsed }) : null;
    if (array) return { ...array, usage };
  }
  return null;
}

function owningFunctionName(binding: Binding): { name: string; fn: NodePath } | null {
  const fn = binding.scope.path;
  if (fn.isFunctionDeclaration() && fn.node.id) return { name: fn.node.id.name, fn };
  if (fn.parentPath?.isVariableDeclarator() && t.isIdentifier(fn.parentPath.node.id)) return { name: fn.parentPath.node.id.name, fn };
  return null;
}
