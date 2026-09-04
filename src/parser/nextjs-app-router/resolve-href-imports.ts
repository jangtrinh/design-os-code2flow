import type { Binding } from "@babel/traverse";
import * as t from "@babel/types";
import { lineOf, snippetAt, traverseFile, type ParsedFile } from "./parse-source-file.js";
import { resolveSourceModule } from "./resolve-source-module.js";
import type { ResolveContext, ResolvedHref } from "./resolve-href-expression.js";

/** Resolves an imported literal, data array, or server-action redirect one module deep. */
export function resolveImported(name: string, binding: Binding, ctx: ResolveContext): ResolvedHref[] {
  const decl = binding.path.parentPath?.node;
  if (!decl || !t.isImportDeclaration(decl)) return [];
  const file = resolveSourceModule(decl.source.value, ctx.file.absPath, ctx.rootDir, ctx.onLimit);
  if (!file) return [];
  const imported = importedName(binding.path.node, name);
  const exported = findExportedString(file, imported);
  if (exported !== null) return [{ value: exported, confidence: "medium", pattern: "imported-constant" }];
  return findExportedServerActionRedirects(file, imported);
}

export function importedName(spec: t.Node, local: string): string {
  return t.isImportSpecifier(spec) ? (t.isIdentifier(spec.imported) ? spec.imported.name : spec.imported.value) : local;
}

export function findExportedArray(file: ParsedFile, name: string): t.ArrayExpression | null {
  const init = findVariableInit(file, name);
  return init ? arrayFromExpression(file, init) : null;
}

function findExportedString(file: ParsedFile, name: string): string | null {
  const init = findVariableInit(file, name);
  return init && t.isStringLiteral(init) ? init.value : null;
}

function findVariableInit(file: ParsedFile, name: string): t.Expression | null {
  const holder: { found: t.Expression | null } = { found: null };
  traverseFile(file, { VariableDeclarator(path) { if (t.isIdentifier(path.node.id, { name }) && path.node.init && t.isExpression(path.node.init)) { holder.found = path.node.init; path.stop(); } } });
  return holder.found;
}

/** `export const products = definitions.map(enrich)` remains static only if the mapper spreads its source object. */
function arrayFromExpression(file: ParsedFile, expr: t.Expression): t.ArrayExpression | null {
  const unwrapped = t.isTSAsExpression(expr) ? expr.expression : expr;
  if (t.isArrayExpression(unwrapped)) return unwrapped;
  if (!t.isCallExpression(unwrapped) || !t.isMemberExpression(unwrapped.callee) || !t.isIdentifier(unwrapped.callee.object) || !t.isIdentifier(unwrapped.callee.property, { name: "map" }) || !preservesObjectFields(file, unwrapped.arguments[0])) return null;
  const source = findVariableInit(file, unwrapped.callee.object.name);
  return source ? arrayFromExpression(file, source) : null;
}

function preservesObjectFields(file: ParsedFile, mapper: t.Node | null | undefined): boolean {
  if (t.isArrowFunctionExpression(mapper) || t.isFunctionExpression(mapper)) return functionSpreadsFirstParam(mapper);
  if (!t.isIdentifier(mapper)) return false;
  let fn: t.Function | null = null;
  traverseFile(file, {
    FunctionDeclaration(path) { if (path.node.id?.name === mapper.name) { fn = path.node; path.stop(); } },
    VariableDeclarator(path) { if (t.isIdentifier(path.node.id, { name: mapper.name }) && path.node.init && t.isFunction(path.node.init)) { fn = path.node.init; path.stop(); } },
  });
  return fn ? functionSpreadsFirstParam(fn) : false;
}

function functionSpreadsFirstParam(fn: t.Function): boolean {
  const param = fn.params[0];
  const name = t.isIdentifier(param) ? param.name : null;
  if (!name) return false;
  const returns = t.isBlockStatement(fn.body) ? fn.body.body.filter(t.isReturnStatement).map((s) => s.argument) : [fn.body];
  return returns.some((value) => t.isObjectExpression(value) && value.properties.some((p) => t.isSpreadElement(p) && t.isIdentifier(p.argument, { name })));
}

function findExportedServerActionRedirects(file: ParsedFile, name: string): ResolvedHref[] {
  const functions: t.Function[] = [];
  traverseFile(file, { ExportNamedDeclaration(path) {
    const declaration = path.node.declaration;
    if (t.isFunctionDeclaration(declaration) && declaration.id?.name === name) functions.push(declaration);
    if (t.isVariableDeclaration(declaration)) for (const declarator of declaration.declarations) if (t.isIdentifier(declarator.id, { name }) && declarator.init && t.isFunction(declarator.init)) functions.push(declarator.init);
  } });
  const out: ResolvedHref[] = [];
  traverseFile(file, { CallExpression(path) {
    if (!t.isIdentifier(path.node.callee) || !/^(redirect|permanentRedirect)$/.test(path.node.callee.name) || !t.isStringLiteral(path.node.arguments[0])) return;
    if (!functions.some((fn) => (fn.start ?? Infinity) <= (path.node.start ?? -1) && (fn.end ?? -1) >= (path.node.end ?? Infinity))) return;
    out.push({ value: path.node.arguments[0].value, confidence: "medium", pattern: "server-action-redirect", evidence: { file: file.file, line: lineOf(path.node), snippet: snippetAt(file, path.node) } });
  } });
  return out;
}
