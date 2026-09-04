import { existsSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import * as t from "@babel/types";
import type { ActionEdge, Counters } from "../../schema/index.js";
import { lineOf, parseSourceFile, snippetAt, traverseFile, type ParsedFile } from "./parse-source-file.js";
import type { RouteRegistry } from "./route-registry.js";

/** A component counts as app shell when at least this share of Route Screens render it. */
const SHELL_USAGE_SHARE = 0.5;

const LAYOUT_FILE = /^layout\.(tsx|jsx|js)$/;

/**
 * Shell Navigation Edges: links inside components that most screens render (sidebar, top nav, notification bell)
 * PLUS every `layout.{tsx,jsx,js}` under the app dir — a layout wraps every page beneath it unconditionally, so its
 * nav is shell nav regardless of any usage share (the root layout for all pages, a nested layout for its subtree).
 * Emitted once with scope "shell" so the canvas can hide them by default (ADR-0005).
 */
export function detectShellNavigation(rootDir: string, appDir: string, pages: ParsedFile[], registry: RouteRegistry, counters: Counters): ActionEdge[] {
  const usage = new Map<string, { count: number; source: string; fromFile: string }>();
  for (const page of pages) {
    const imports = importedComponents(page);
    const rendered = new Set<string>();
    traverseFile(page, { JSXOpeningElement(p) { if (t.isJSXIdentifier(p.node.name) && imports.has(p.node.name.name)) rendered.add(p.node.name.name); } });
    for (const name of rendered) {
      const entry = usage.get(name) ?? { count: 0, source: imports.get(name)!, fromFile: page.absPath };
      entry.count++;
      usage.set(name, entry);
    }
  }
  const shellFiles = new Set<string>();
  for (const [, u] of usage) {
    if (u.count / Math.max(pages.length, 1) < SHELL_USAGE_SHARE) continue;
    const file = resolveImport(u.source, u.fromFile, rootDir);
    if (!file) { bump(counters, relative(rootDir, u.fromFile), "shell-import-unresolved"); continue; }
    shellFiles.add(file);
    for (const sibling of siblingSources(file)) shellFiles.add(sibling); // one hop: nav-bell.tsx next to app-shell.tsx
  }
  for (const f of collectLayoutShellFiles(rootDir, appDir, counters)) shellFiles.add(f);
  const edges: ActionEdge[] = [];
  const seen = new Set<string>();
  let seq = 0;
  for (const abs of shellFiles) {
    const parsed = parseSourceFile(abs, relative(rootDir, abs));
    if (!parsed) { bump(counters, relative(rootDir, abs), "parse-error"); continue; }
    for (const link of literalHrefs(parsed)) {
      if (link.href === "" || link.href.startsWith("#")) { bump(counters, parsed.file, "shell-empty-href"); continue; }
      const target = /^(https?:)?\/\//.test(link.href) ? `external:${link.href}` : registry.resolve(link.href) ?? `missing:${link.href.split("?")[0]}`;
      if (seen.has(target)) { bump(counters, parsed.file, "merged-identical-edge"); continue; }
      seen.add(target);
      edges.push({ id: `shell${++seq}`, source: "shell", target, trigger: link.label ? `Nav: ${link.label}` : "Shell nav", confidence: "high", pattern: "shell-nav-literal", evidence: { file: parsed.file, line: link.line, snippet: link.snippet }, scope: "shell", resolved: !/^(external|missing):/.test(target), href: link.href });
    }
  }
  return edges;
}

function bump(counters: Counters, file: string, name: string): void {
  counters[file] ??= {};
  counters[file][name] = (counters[file][name] ?? 0) + 1;
}

function importedComponents(page: ParsedFile): Map<string, string> {
  const out = new Map<string, string>();
  for (const stmt of page.ast.program.body) {
    if (!t.isImportDeclaration(stmt) || stmt.source.value.startsWith(".")) continue; // relative = screen-local, not shell
    for (const spec of stmt.specifiers) if (/^[A-Z]/.test(spec.local.name)) out.set(spec.local.name, stmt.source.value);
  }
  return out;
}

function resolveImport(source: string, fromFile: string, rootDir: string): string | null {
  const base = source.startsWith("@/") ? join(rootDir, existsSync(join(rootDir, "src")) ? "src" : "", source.slice(2)) : source.startsWith(".") ? join(dirname(fromFile), source) : null;
  if (!base) return null;
  for (const c of [`${base}.tsx`, `${base}.ts`, join(base, "index.tsx"), join(base, "index.ts")]) if (existsSync(c)) return c;
  return null;
}

function siblingSources(file: string): string[] {
  const dir = dirname(file);
  return readdirSync(dir).filter((f) => /\.(tsx|ts)$/.test(f) && !/\.(test|spec|stories)\./.test(f)).map((f) => join(dir, f));
}

/**
 * Every layout.{tsx,jsx,js} under the app dir (root and nested), plus one hop into any component it renders
 * (a `<SiteHeader/>` that itself contains the real nav `<Link>`s, the common shape) — unconditionally, no usage
 * share: a layout wraps every page beneath it, so its nav (direct or one hop away) is always shell nav.
 */
function collectLayoutShellFiles(rootDir: string, appDir: string, counters: Counters): Set<string> {
  const files = new Set<string>();
  for (const abs of collectLayoutFiles(appDir)) {
    files.add(abs);
    const parsed = parseSourceFile(abs, relative(rootDir, abs));
    if (!parsed) { bump(counters, relative(rootDir, abs), "parse-error"); continue; }
    const imports = importedComponents(parsed);
    const rendered = new Set<string>();
    traverseFile(parsed, { JSXOpeningElement(p) { if (t.isJSXIdentifier(p.node.name) && imports.has(p.node.name.name)) rendered.add(p.node.name.name); } });
    for (const name of rendered) {
      const resolved = resolveImport(imports.get(name)!, abs, rootDir);
      if (!resolved) { bump(counters, parsed.file, "shell-import-unresolved"); continue; }
      files.add(resolved);
      for (const sibling of siblingSources(resolved)) files.add(sibling);
    }
  }
  return files;
}

/** Every layout.{tsx,jsx,js} under the app dir, root and nested, skipping api/parallel/private subtrees. */
function collectLayoutFiles(appDir: string): string[] {
  const out: string[] = [];
  walkLayouts(appDir, out);
  return out;
}

function walkLayouts(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "api" || entry.name.startsWith("@") || entry.name.startsWith("_")) continue;
      walkLayouts(join(dir, entry.name), out);
    } else if (LAYOUT_FILE.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
}

interface LiteralHref { href: string; label?: string; line: number; snippet: string }

/** `<Link href="/x">Label</Link>` and `{ href: "/x", label: "Users" }` entries in nav data. */
function literalHrefs(parsed: ParsedFile): LiteralHref[] {
  const out: LiteralHref[] = [];
  traverseFile(parsed, {
    JSXOpeningElement(p) {
      if (!t.isJSXIdentifier(p.node.name) || !/^(Link|a|NavLink)$/.test(p.node.name.name)) return;
      const attr = p.node.attributes.find((a): a is t.JSXAttribute => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name) && a.name.name === "href");
      if (attr && t.isStringLiteral(attr.value)) out.push({ href: attr.value.value, line: lineOf(attr), snippet: snippetAt(parsed, attr) });
    },
    ObjectExpression(p) {
      const props = p.node.properties.filter((q): q is t.ObjectProperty => t.isObjectProperty(q) && t.isIdentifier(q.key));
      const href = props.find((q) => (q.key as t.Identifier).name === "href");
      if (!href || !t.isStringLiteral(href.value)) return;
      const label = props.find((q) => /^(label|title|name)$/.test((q.key as t.Identifier).name));
      out.push({ href: href.value.value, label: label && t.isStringLiteral(label.value) ? label.value.value : undefined, line: lineOf(href), snippet: snippetAt(parsed, href) });
    },
    // nav data as tuples: `const links = [["Home", "/"], ["Products", "/products"]] as const` mapped into <Link href={href}>
    ArrayExpression(p) {
      const strings = p.node.elements.filter((e): e is t.StringLiteral => t.isStringLiteral(e));
      if (strings.length < 2 || strings.length !== p.node.elements.length) return;
      const href = strings.find((e) => /^(\/|https?:\/\/)/.test(e.value)); if (!href) return;
      const label = strings.find((e) => e !== href);
      out.push({ href: href.value, label: label?.value, line: lineOf(href), snippet: snippetAt(parsed, href) });
    },
  });
  return out;
}
