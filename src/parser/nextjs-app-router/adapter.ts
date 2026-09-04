import type { ActionEdge, Counters, ScreenNode } from "../../schema/index.js";
import type { IngestorAdapter, IngestResult } from "../adapter-types.js";
import { detectFramework, type DetectedFramework } from "../framework-detector.js";
import { buildScreenEdges, dedupeEdges, detectRouteAsModal } from "./build-screen-edges.js";
import { collectScreenFiles } from "./collect-screen-files.js";
import { detectShellNavigation } from "./detect-shell-navigation.js";
import { detectPageTitle } from "./page-title.js";
import type { ParsedFile } from "./parse-source-file.js";
import { extractNavigationCalls } from "./extract-navigation-calls.js";
import { buildRouteRegistry } from "./route-registry.js";
import { buildScreenIndex, type ScreenIndex } from "./screen-index.js";
import { extractHoverStateScreens } from "./hover-state-screens.js";

/** Two passes: index every screen (state keys, titles, route-as-modal), then edges + shell navigation. */
async function ingestNextApp(rootDir: string, detected: DetectedFramework): Promise<IngestResult> {
  const registry = buildRouteRegistry(rootDir, detected.appDir);
  const counters: Counters = {};
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
  const stateScreens = new Map<string, ScreenNode>();
  const edges: ActionEdge[] = [];
  const seq = { n: 0 };
  for (const index of indexes) {
    const calls = index.files.flatMap((parsed) => extractNavigationCalls(parsed));
    edges.push(...buildScreenEdges(index, calls, { rootDir, registry, counters, stateScreens, stateKeysByRoute, seq }));
    const hover = extractHoverStateScreens(index, counters);
    for (const state of hover.states) stateScreens.set(state.id, state);
    for (const edge of hover.edges) edges.push({ ...edge, id: `e${++seq.n}` });
  }
  edges.push(...detectShellNavigation(rootDir, detected.appDir, pages, registry, counters));
  const screens = [...registry.screens, ...[...stateScreens.values()].sort((a, b) => a.id.localeCompare(b.id))];
  return { graph: { version: 1, framework: "nextjs-app-router", rootDir, screens, edges: dedupeEdges(edges, counters), counters }, resolver: registry };
}

export const nextjsAppRouterAdapter: IngestorAdapter<DetectedFramework> = {
  id: "nextjs-app-router",
  label: "Next.js App Router",
  detect: detectFramework,
  ingest: ingestNextApp,
};
