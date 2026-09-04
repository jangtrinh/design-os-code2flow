import * as t from "@babel/types";
import { stateKindForKey } from "./state-screens.js";
import type { ScreenIndex } from "./screen-index.js";

/** `const stepParam = first(sp.step)` / `const modal = first(sp.modal)` → alias → key */
export function collectStateAlias(node: t.VariableDeclarator, aliases: Map<string, string>, aliasValues: Map<string, { key: string; value: string }>): void {
  if (!t.isIdentifier(node.id) || !node.init) return;
  const key = stateKeyInExpression(node.init, aliases);
  if (!key) return;
  aliases.set(node.id.name, key);
  const init = node.init;
  if (t.isBinaryExpression(init) && (init.operator === "===" || init.operator === "==")) {
    const lit = t.isStringLiteral(init.right) ? init.right : t.isStringLiteral(init.left) ? init.left : null;
    if (lit) aliasValues.set(node.id.name, { key, value: lit.value });
  }
}

/**
 * Finds the searchParams key an expression addresses, one hop through aliases: a bare identifier that is
 * itself a known key name (`tab`, from `const { tab } = await searchParams`) or an already-collected alias
 * of one (`stepParam`, from `const stepParam = first(sp.step)`).
 */
function stateKeyInExpression(node: t.Node, aliases?: Map<string, string>): string | null {
  if (t.isIdentifier(node)) return aliases?.get(node.name) ?? (stateKindForKey(node.name) ? node.name : null);
  if (t.isMemberExpression(node) && t.isIdentifier(node.object) && /^(sp|searchParams)$/.test(node.object.name) && t.isIdentifier(node.property) && stateKindForKey(node.property.name)) return node.property.name;
  if (t.isCallExpression(node)) for (const a of node.arguments) { const k = stateKeyInExpression(a, aliases); if (k) return k; }
  if (t.isConditionalExpression(node)) return stateKeyInExpression(node.test, aliases);
  if (t.isBinaryExpression(node) || t.isLogicalExpression(node)) return stateKeyInExpression(node.left, aliases) ?? stateKeyInExpression(node.right, aliases);
  if (t.isTSAsExpression(node)) return stateKeyInExpression(node.expression, aliases);
  return null;
}

/** `["overview", "pricing", "faq"] as const` / a plain array literal → its string elements, else []. */
function stringArrayElements(node: t.Node): string[] {
  const literal = t.isTSAsExpression(node) ? node.expression : node;
  if (!t.isArrayExpression(literal)) return [];
  return literal.elements.filter((e): e is t.StringLiteral => t.isStringLiteral(e)).map((e) => e.value);
}

/** `const steps = ["account", "plan", "confirm"] as const` → steps → its literal elements, for membership checks below. */
export function collectArrayLiteral(node: t.VariableDeclarator, arrayLiterals: Map<string, string[]>): void {
  if (!t.isIdentifier(node.id) || !node.init) return;
  const elements = stringArrayElements(node.init);
  if (elements.length > 0) arrayLiterals.set(node.id.name, elements);
}

/**
 * `tabs.includes(tab as TabKey)` / `tabs.includes(key)` where `tabs` is a known string-literal array (inline or
 * a same-file const) and `key` addresses a searchParams key (directly or via a one-hop alias): every literal in
 * `tabs` is a value the page switches on for that key, so it is a State Screen even without its own equality check.
 */
export function collectMembershipArray(node: t.CallExpression, aliases: Map<string, string>, arrayLiterals: Map<string, string[]>, index: ScreenIndex): void {
  const callee = node.callee;
  if (!t.isMemberExpression(callee) || callee.computed || !t.isIdentifier(callee.property, { name: "includes" })) return;
  const key = node.arguments[0] ? stateKeyInExpression(node.arguments[0], aliases) : null;
  if (!key) return;
  const elements = t.isIdentifier(callee.object) ? (arrayLiterals.get(callee.object.name) ?? []) : stringArrayElements(callee.object);
  for (const value of elements) {
    if (value === "" || index.declaredStates.some((d) => d.key === key && d.value === value)) continue;
    index.stateKeys.add(key);
    index.declaredStates.push({ key, value });
  }
}
