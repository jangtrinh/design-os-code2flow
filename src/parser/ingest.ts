import { resolve } from "node:path";
import type { ActionEdge, CanonicalFlowGraph, Counters, ScreenNode } from "../schema/index.js";
import { detectFramework } from "./framework-detector.js";
import { buildScreenEdges, dedupeEdges, detectRouteAsModal } from "./nextjs-app-router/build-screen-edges.js";
import { collectScreenFiles } from "./nextjs-app-router/collect-screen-files.js";
import { detectShellNavigation } from "./nextjs-app-router/detect-shell-navigation.js";
import { detectPageTitle } from "./nextjs-app-router/page-title.js";
import type { ParsedFile } from "./nextjs-app-router/parse-source-file.js";
import { extractNavigationCalls } from "./nextjs-app-router/extract-navigation-calls.js";
import { buildRouteRegistry } from "./nextjs-app-router/route-registry.js";
import { buildScreenIndex, type ScreenIndex } from "./nextjs-app-router/screen-index.js";

/**
 * Public seam of the Codebase Ingestor: repo root in, CanonicalFlowGraph out.
 * Throws when no supported framework is detected (the CLI turns that into a user message).
 */
export async function ingest(repoRoot: string): Promise<CanonicalFlowGraph> {
  const rootDir = resolve(repoRoot);
  const detected = detectFramework(rootDir);
  if (!detected) throw new Error(`No compatible routes detected in ${rootDir}. Supported: Next.js App Router.`);
  const registry = buildRouteRegistry(rootDir, detected.appDir);
  const counters: Counters = {};
  // Pass 1: index every screen so cross-screen hrefs know which query keys address State Screens on the target.
  const indexes: ScreenIndex[] = [];
  const pages: ParsedFile[] = [];
  const stateKeysByRoute = new Map<string, Set<string>>();
  for (const screen of registry.screens) {
    const files = collectScreenFiles(rootDir, screen);
    const index = buildScreenIndex(rootDir, screen, files);
    for (const f of files) if (!index.files.some((p) => p.file === f)) counters[f] = { "parse-error": 1 };
    if (detectRouteAsModal(index)) screen.routeAsModal = true;
    const page = index.files.find((f) => f.file === screen.filePath);
    if (page) { pages.push(page); screen.title = detectPageTitle(page); }
    stateKeysByRoute.set(screen.id, index.stateKeys);
    indexes.push(index);
  }
  // Pass 2: edges.
  const stateScreens = new Map<string, ScreenNode>();
  const edges: ActionEdge[] = [];
  const seq = { n: 0 };
  for (const index of indexes) {
    const calls = index.files.flatMap((parsed) => extractNavigationCalls(parsed));
    edges.push(...buildScreenEdges(index, calls, { rootDir, registry, counters, stateScreens, stateKeysByRoute, seq }));
  }
  edges.push(...detectShellNavigation(rootDir, detected.appDir, pages, registry, counters));
  const screens = [...registry.screens, ...[...stateScreens.values()].sort((a, b) => a.id.localeCompare(b.id))];
  return { version: 1, framework: detected.framework, rootDir, screens, edges: dedupeEdges(edges, counters), counters };
}
