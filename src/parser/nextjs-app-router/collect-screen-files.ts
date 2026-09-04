import { readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import * as t from "@babel/types";
import type { ScreenNode } from "../../schema/index.js";
import { parseSourceFile, traverseFile } from "./parse-source-file.js";
import { resolveSourceModule } from "./resolve-source-module.js";

const SOURCE_EXT = /\.(tsx|ts|jsx|js)$/;
const PAGE_FILE = /^page\.(tsx|jsx|ts|js)$/;
const LAYOUT_FILE = /^(layout|template|loading|error|not-found)\.(tsx|jsx|ts|js)$/;

/**
 * Files owned by one Route Screen: everything under its directory except
 * subtrees that are themselves routes (contain a page file) or are parallel/api segments.
 * layout/loading/error files are skipped here; shell-wide navigation is phase 04.
 */
export function collectScreenFiles(rootDir: string, screen: ScreenNode): string[] {
  const screenDir = join(rootDir, dirname(screen.filePath));
  const out: string[] = [];
  walk(screenDir, rootDir, out, true);
  const seen = new Set(out);
  for (let i = 0; i < out.length; i++) collectImports(join(rootDir, out[i]), rootDir, out, seen);
  return out;
}

/** One Route Screen owns the local components it imports, including their nested local components. */
function collectImports(file: string, rootDir: string, out: string[], seen: Set<string>): void {
  const parsed = parseSourceFile(file, relative(rootDir, file));
  if (!parsed) return;
  const renderedWithProps = new Set<string>();
  traverseFile(parsed, { JSXOpeningElement(path) {
    if (!path.node.name || path.node.name.type !== "JSXIdentifier") return;
    if (path.node.attributes.some((attribute) => attribute.type === "JSXAttribute" && attribute.name.type === "JSXIdentifier" && attribute.name.name !== "key")) renderedWithProps.add(path.node.name.name);
  } });
  traverseFile(parsed, { ImportDeclaration(path) {
    if (!path.node.specifiers.some((specifier) => renderedWithProps.has(specifier.local.name))) return;
    const resolved = resolveSourceModule(path.node.source.value, file, rootDir);
    if (!resolved || seen.has(resolved.file) || !isHrefWrapper(resolved)) return;
    seen.add(resolved.file);
    out.push(resolved.file);
  } });
}

/** Keep imported components only when a component prop flows straight into Link.href, not every presentational import. */
function isHrefWrapper(file: NonNullable<ReturnType<typeof parseSourceFile>>): boolean {
  let found = false;
  traverseFile(file, { JSXOpeningElement(path) {
    if (!t.isJSXIdentifier(path.node.name, { name: "Link" })) return;
    const attr = path.node.attributes.find((attribute): attribute is t.JSXAttribute => t.isJSXAttribute(attribute) && t.isJSXIdentifier(attribute.name, { name: "href" }) && t.isJSXExpressionContainer(attribute.value));
    const value = attr?.value;
    if (!value || !t.isJSXExpressionContainer(value) || t.isJSXEmptyExpression(value.expression)) return;
    const subject = t.isIdentifier(value.expression) ? value.expression : t.isMemberExpression(value.expression) && t.isIdentifier(value.expression.object) ? value.expression.object : null;
    const binding = subject && path.scope.getBinding(subject.name);
    if (binding?.kind !== "param") return;
    const fn = binding.scope.path;
    const component = fn.isFunctionDeclaration() ? fn.node.id?.name : fn.parentPath?.isVariableDeclarator() && t.isIdentifier(fn.parentPath.node.id) ? fn.parentPath.node.id.name : null;
    if (component && /^[A-Z]/.test(component)) { found = true; path.stop(); }
  } });
  return found;
}

function walk(dir: string, rootDir: string, out: string[], isScreenRoot: boolean): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  if (!isScreenRoot && entries.some((e) => e.isFile() && PAGE_FILE.test(e.name))) return; // another screen's subtree
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "api" || entry.name.startsWith("@")) continue;
      walk(join(dir, entry.name), rootDir, out, false);
    } else if (SOURCE_EXT.test(entry.name) && !LAYOUT_FILE.test(entry.name) && !/\.(test|spec|stories)\./.test(entry.name)) {
      out.push(relative(rootDir, join(dir, entry.name)));
    }
  }
}
