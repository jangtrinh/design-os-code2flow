import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { ScreenNode } from "../../schema/index.js";
import type { RouteResolver } from "../adapter-types.js";

/** Recursively lists HTML files, excluding hidden and dependency directories. */
export function htmlPaths(rootDir: string, directory = rootDir): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" || entry.name.startsWith(".")
        ? []
        : htmlPaths(rootDir, fullPath);
    }
    return entry.name.endsWith(".html") ? [relative(rootDir, fullPath)] : [];
  });
}

/** Converts an HTML file path to its canonical route-screen id. */
export function routeForHtmlFile(file: string): string {
  const stem = file.replace(/\.html$/, "");
  const route = stem === "index" ? "/" : `/${stem.replace(/\/index$/, "")}`;
  return route.replace(/\/{2,}/g, "/");
}

/** Builds the framework-neutral resolver for concrete static-site routes. */
export function createStaticHtmlResolver(screens: ScreenNode[]): RouteResolver {
  return {
    screens,
    resolve(path: string): string | null {
      const clean =
        path
          .split(/[?#]/)[0]
          .replace(/\/{2,}/g, "/")
          .replace(/\/+$/, "") || "/";
      return screens.some((screen) => screen.id === clean) ? clean : null;
    },
  };
}

/** Returns whether the root is a framework project that static HTML must not claim. */
export function hasPackageManifest(rootDir: string): boolean {
  return existsSync(join(rootDir, "package.json"));
}
