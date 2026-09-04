import { readFileSync } from "node:fs";
import type { ActionEdge, Counters, ScreenNode } from "../../schema/index.js";
import type { IngestorAdapter } from "../adapter-types.js";
import {
  createStaticHtmlResolver,
  hasPackageManifest,
  htmlPaths,
  routeForHtmlFile,
} from "./route-registry.js";
import {
  collectHtmlLinks,
  edgeForHtmlLink,
  type HtmlFile,
} from "./screen-edges.js";
import { locationEdgesForHtmlFile } from "./script-navigation.js";
import { dedupeShellEdges, sharedShellKeys } from "./shell-navigation.js";

export interface StaticHtmlDetection {
  files: string[];
}

/** Detects and ingests plain HTML sites into the canonical flow graph. */
export const staticHtmlAdapter: IngestorAdapter<StaticHtmlDetection> = {
  id: "static-html",
  label: "Static HTML",
  detect(rootDir) {
    if (hasPackageManifest(rootDir)) return null;
    const files = htmlPaths(rootDir);
    const hasAnchor = files.some((file) =>
      /<a\b[^>]*\bhref\s*=/i.test(readFileSync(`${rootDir}/${file}`, "utf8")),
    );
    return hasAnchor ? { files } : null;
  },
  async ingest(rootDir, detected) {
    const files: HtmlFile[] = detected.files.map((file) => ({
      file,
      source: readFileSync(`${rootDir}/${file}`, "utf8"),
      route: routeForHtmlFile(file),
    }));
    const routeScreens: ScreenNode[] = files.map(({ file, route }) => ({
      id: route,
      kind: "route",
      filePath: file,
    }));
    const resolver = createStaticHtmlResolver(routeScreens);
    const counters: Counters = {};
    const stateScreens = new Map<string, ScreenNode>();
    const links = files.flatMap((file) => collectHtmlLinks(file, stateScreens));
    const shellKeys = sharedShellKeys(
      links.map(({ key, link }) => ({ key, shell: link.shell })),
      files.length,
    );
    const edges: ActionEdge[] = [];
    let sequence = 0;
    for (const item of links) {
      const shell = item.link.shell && shellKeys.has(item.key);
      const edge = edgeForHtmlLink(
        item,
        rootDir,
        resolver,
        stateScreens,
        counters,
        shell,
        shell ? `shell${++sequence}` : `e${++sequence}`,
      );
      if (edge) edges.push(edge);
    }
    for (const file of files)
      edges.push(
        ...locationEdgesForHtmlFile(file, resolver, () => `e${++sequence}`),
      );
    return {
      graph: {
        version: 1,
        framework: "static-html",
        rootDir,
        screens: [...routeScreens, ...stateScreens.values()].sort((a, b) =>
          a.id.localeCompare(b.id),
        ),
        edges: countedShellDedupe(edges, counters),
        counters,
      },
      resolver,
    };
  },
};

function countedShellDedupe(edges: ActionEdge[], counters: Counters): ActionEdge[] {
  const deduped = dedupeShellEdges(edges);
  const dropped = edges.length - deduped.length;
  if (dropped) counters.shell = { "duplicate-shell-edge": dropped };
  return deduped;
}
