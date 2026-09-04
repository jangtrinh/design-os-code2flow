import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parseSourceFile, type ParsedFile } from "./parse-source-file.js";

const moduleCache = new Map<string, ParsedFile | null>();
const tsconfigCache = new Map<string, { baseUrl: string; paths: Record<string, string[]> }>();

/** Resolves a local or configured import without following dependencies outside the target repository. */
export function resolveSourceModule(source: string, fromFile: string, rootDir: string, onLimit?: (name: string) => void): ParsedFile | null {
  const bases = source.startsWith(".") ? [resolve(dirname(fromFile), source)] : moduleBases(source, rootDir);
  for (const base of bases) {
    if (!base.startsWith(rootDir + "/")) { onLimit?.("import-outside-repo"); continue; }
    const stem = base.replace(/\.(js|jsx|mjs)$/, "");
    for (const candidate of [base, `${stem}.ts`, `${stem}.tsx`, `${stem}.js`, `${stem}.jsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
      if (!existsSync(candidate) || !statSync(candidate).isFile()) continue;
      if (!moduleCache.has(candidate)) moduleCache.set(candidate, parseSourceFile(candidate, relative(rootDir, candidate)));
      return moduleCache.get(candidate) ?? null;
    }
  }
  return null;
}

function moduleBases(source: string, rootDir: string): string[] {
  const config = tsconfigFor(rootDir);
  const matches = Object.entries(config.paths).flatMap(([pattern, targets]) => {
    const star = pattern.indexOf("*");
    if (star < 0 ? source !== pattern : !source.startsWith(pattern.slice(0, star)) || !source.endsWith(pattern.slice(star + 1))) return [];
    const value = star < 0 ? "" : source.slice(star, source.length - (pattern.length - star - 1));
    return targets.map((target) => resolve(rootDir, config.baseUrl, target.replace("*", value)));
  });
  return matches.length ? matches : source.startsWith("@/") ? [join(rootDir, existsSync(join(rootDir, "src")) ? "src" : "", source.slice(2))] : [];
}

function tsconfigFor(rootDir: string): { baseUrl: string; paths: Record<string, string[]> } {
  const cached = tsconfigCache.get(rootDir);
  if (cached) return cached;
  try {
    const compilerOptions = JSON.parse(readFileSync(join(rootDir, "tsconfig.json"), "utf8")).compilerOptions ?? {};
    const config = { baseUrl: typeof compilerOptions.baseUrl === "string" ? compilerOptions.baseUrl : ".", paths: typeof compilerOptions.paths === "object" && compilerOptions.paths ? compilerOptions.paths : {} };
    tsconfigCache.set(rootDir, config);
    return config;
  } catch {
    const config = { baseUrl: ".", paths: {} };
    tsconfigCache.set(rootDir, config);
    return config;
  }
}
