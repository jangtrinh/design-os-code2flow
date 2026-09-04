import { readFileSync } from "node:fs";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import type { Visitor } from "@babel/traverse";
import type * as t from "@babel/types";
import type { Counters } from "../../schema/index.js";

// Babel 8 ships ESM; some bundlers still expose the function under `.default`.
const traverse: (ast: t.Node, visitor: Visitor) => void =
  (traverseModule as unknown as { default?: typeof traverseModule }).default ?? traverseModule;

export interface ParsedFile {
  file: string; // relative to repo root
  absPath: string;
  source: string;
  ast: t.File;
}

/** One cache per ingest call: the same absolute path is otherwise parsed once per screen that owns or imports it. */
export type ParseCache = Map<string, ParsedFile | null>;

export function parseSourceFile(absPath: string, relPath: string, cache?: ParseCache, counters?: Counters): ParsedFile | null {
  if (cache?.has(absPath)) {
    if (counters) bump(counters, relPath, "parse-cache-hit");
    return cache.get(absPath) ?? null;
  }
  const parsed = ((): ParsedFile | null => {
    try {
      const source = readFileSync(absPath, "utf8");
      const ast = parse(source, { sourceType: "module", plugins: ["jsx", "typescript"], errorRecovery: true });
      return { file: relPath, absPath, source, ast };
    } catch {
      return null; // unreadable or unparsable: caller counts it under "parse-error"
    }
  })();
  cache?.set(absPath, parsed);
  return parsed;
}

function bump(counters: Counters, file: string, name: string): void {
  counters[file] ??= {};
  counters[file][name] = (counters[file][name] ?? 0) + 1;
}

export function traverseFile(parsed: ParsedFile, visitor: Visitor): void {
  traverse(parsed.ast, visitor);
}

/** One-line snippet at a node's start line, trimmed, capped for evidence display. */
export function snippetAt(parsed: ParsedFile, node: t.Node): string {
  const line = node.loc?.start.line ?? 0;
  return (parsed.source.split("\n")[line - 1] ?? "").trim().slice(0, 140);
}

export function lineOf(node: t.Node): number {
  return node.loc?.start.line ?? 0;
}

