import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface DetectedFramework {
  framework: "nextjs-app-router";
  /** Directory that contains the App Router tree (".../app" or ".../src/app"). */
  appDir: string;
}

/** Detects a Next.js App Router project by package.json dependency + app directory convention. */
export function detectFramework(rootDir: string): DetectedFramework | null {
  const pkgPath = join(rootDir, "package.json");
  if (!existsSync(pkgPath)) return null;
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(pkgPath, "utf8"));
    pkg = parsed && typeof parsed === "object" ? (parsed as typeof pkg) : null;
  } catch {
    pkg = null; // unreadable or invalid package.json → "no compatible routes", not a crash
  }
  const hasNext = Boolean(pkg?.dependencies?.next ?? pkg?.devDependencies?.next);
  if (!hasNext) return null;
  for (const candidate of ["src/app", "app"]) {
    const appDir = join(rootDir, candidate);
    if (existsSync(appDir)) return { framework: "nextjs-app-router", appDir };
  }
  return null;
}
