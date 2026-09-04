import type { ActionEdge } from "../../schema/index.js";
import type { RouteResolver } from "../adapter-types.js";
import type { HtmlFile } from "./screen-edges.js";

/** Finds literal location.href and window.open navigation in one HTML source file. */
export function locationEdgesForHtmlFile(
  file: HtmlFile,
  resolver: RouteResolver,
  nextId: () => string,
): ActionEdge[] {
  const edges: ActionEdge[] = [];
  const navigation =
    /(?:location\.href|window\.open)\s*(?:=|\()\s*["']([^"']+)["']/g;
  for (const match of file.source.matchAll(navigation)) {
    const href = match[1];
    const target = resolver.resolve(href) ?? `missing:${href}`;
    const index = match.index ?? 0;
    edges.push({
      id: nextId(),
      source: file.route,
      target,
      trigger: "script navigation",
      confidence: "high",
      pattern: "location-href-literal",
      evidence: {
        file: file.file,
        line: file.source.slice(0, index).split("\n").length,
      },
      scope: "screen",
      resolved: !target.startsWith("missing:"),
      href,
    });
  }
  return edges;
}
