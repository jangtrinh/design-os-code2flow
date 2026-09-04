import { posix } from "node:path";
import type { Counters, ScreenNode } from "../../schema/index.js";
import type { RouteResolver } from "../adapter-types.js";
import type { HtmlFile } from "./screen-edges.js";

const externalHref = /^(https?:)?\/\/|^(mailto|tel):/;

/** Resolves a literal HTML href to a route, State Screen, or external target. */
export function targetForHtmlHref(
  file: HtmlFile,
  href: string,
  resolver: RouteResolver,
  stateScreens: Map<string, ScreenNode>,
  counters: Counters,
): string | null {
  if (href.startsWith("#")) {
    const id = `${file.route}${href}`;
    if (stateScreens.has(id)) return id;
    incrementCounter(counters, file.file, "anchor-hash");
    return null;
  }
  if (externalHref.test(href)) {
    incrementCounter(
      counters,
      file.file,
      href.startsWith("mailto:") ? "mailto-link" : "external-link",
    );
    return `external:${href}`;
  }
  const path = resolveHtmlHref(file.route, href);
  const route = resolver.resolve(path);
  if (!route) return `missing:${path.split(/[?#]/)[0]}`;
  const tab = path.match(/[?&]tab=([^&#]+)/);
  if (!tab) return route;
  const value = decodeURIComponent(tab[1]);
  const id = `${route}?tab=${value}`;
  if (!stateScreens.has(id))
    stateScreens.set(id, {
      id,
      kind: "tab",
      parentScreenId: route,
      label: `${value} tab`,
      filePath:
        resolver.screens.find((screen) => screen.id === route)?.filePath ??
        file.file,
    });
  return id;
}

function resolveHtmlHref(route: string, href: string): string {
  return (
    href.startsWith("/")
      ? href
      : posix.normalize(posix.join(posix.dirname(route), href))
  ).replace(/\.html(?=\?|#|$)/, "");
}

function incrementCounter(
  counters: Counters,
  file: string,
  counter: string,
): void {
  const perFile = counters[file] ?? {};
  perFile[counter] = (perFile[counter] ?? 0) + 1;
  counters[file] = perFile;
}
