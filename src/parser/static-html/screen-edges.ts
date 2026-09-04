import { posix } from "node:path";
import type { ActionEdge, Counters, ScreenNode } from "../../schema/index.js";
import type { RouteResolver } from "../adapter-types.js";
import { htmlTagLabel, scanHtmlTags } from "./html-tag-scanner.js";
import { isInHeader } from "./shell-navigation.js";

export interface HtmlFile {
  file: string;
  source: string;
  route: string;
}
interface HtmlLink {
  href: string;
  label: string;
  line: number;
  pattern: "anchor-href-literal" | "form-action-literal";
  shell: boolean;
}
export interface CollectedLink {
  file: HtmlFile;
  link: HtmlLink;
  key: string;
}
const externalHref = /^(https?:)?\/\/|^(mailto|tel):/;

/** Collects literal links, form actions, and dialog-opening button transitions. */
export function collectHtmlLinks(
  file: HtmlFile,
  stateScreens: Map<string, ScreenNode>,
): CollectedLink[] {
  const links: CollectedLink[] = [];
  let headerDepth = 0;
  for (const tag of scanHtmlTags(file.source)) {
    if (tag.name === "header" && tag.closing) {
      headerDepth = Math.max(0, headerDepth - 1);
      continue;
    }
    const shell = isInHeader(tag, headerDepth);
    if (tag.name === "dialog" && !tag.closing && tag.attributes.id) {
      const id = `${file.route}#${tag.attributes.id}`;
      stateScreens.set(id, {
        id,
        kind: "modal",
        parentScreenId: file.route,
        label: htmlTagLabel(file.source, tag) || tag.attributes.id,
        filePath: file.file,
      });
    }
    if (
      tag.name === "button" &&
      !tag.closing &&
      /showModal\(\)/.test(tag.attributes.onclick ?? "")
    ) {
      const dialogId = dialogIdFromOnClick(tag.attributes.onclick);
      if (dialogId)
        links.push(
          createLink(
            file,
            `#${dialogId}`,
            htmlTagLabel(file.source, tag) || "Open dialog",
            tag.line,
            false,
          ),
        );
    }
    const href =
      tag.name === "a"
        ? tag.attributes.href
        : tag.name === "form"
          ? tag.attributes.action
          : undefined;
    if (!tag.closing && href !== undefined) {
      links.push(
        createLink(
          file,
          href,
          htmlTagLabel(file.source, tag) ||
            tag.attributes["aria-label"] ||
            tag.name,
          tag.line,
          shell,
          tag.name === "form",
        ),
      );
    }
    if (tag.name === "header" && !tag.closing) headerDepth += 1;
  }
  return links;
}

/** Resolves a collected literal link, retaining non-emitted hash links as counters. */
export function edgeForHtmlLink(
  item: CollectedLink,
  resolver: RouteResolver,
  stateScreens: Map<string, ScreenNode>,
  counters: Counters,
  shell: boolean,
  id: string,
): ActionEdge | null {
  const target = targetForHtmlHref(
    item.file,
    item.link.href,
    resolver,
    stateScreens,
    counters,
  );
  if (!target) return null;
  return {
    id,
    source: shell ? "shell" : item.file.route,
    target,
    trigger: shell
      ? `Nav: ${item.link.label}`
      : `${item.link.pattern === "form-action-literal" ? "Form" : "Link"}: ${item.link.label}`,
    confidence: "high",
    pattern: shell ? "shell-nav-literal" : item.link.pattern,
    evidence: { file: item.file.file, line: item.link.line },
    scope: shell ? "shell" : "screen",
    resolved: !/^(external|missing):/.test(target),
    href: item.link.href,
  };
}

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

function createLink(
  file: HtmlFile,
  href: string,
  label: string,
  line: number,
  shell: boolean,
  form = false,
): CollectedLink {
  return {
    file,
    link: {
      href,
      label,
      line,
      shell,
      pattern: form ? "form-action-literal" : "anchor-href-literal",
    },
    key: `${href}|${label}`,
  };
}
function dialogIdFromOnClick(onclick: string): string | null {
  return (
    (onclick.match(/(?:getElementById|querySelector)\(['"]#?([^'"]+)/) ??
      [])[1] ?? null
  );
}
function targetForHtmlHref(
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
