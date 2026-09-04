import type { ActionEdge, Counters, ScreenNode } from "../../schema/index.js";
import type { RouteResolver } from "../adapter-types.js";
import { htmlTagLabel, scanHtmlTags } from "./html-tag-scanner.js";
import { targetForHtmlHref } from "./html-link-targets.js";
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
  pattern: "anchor-href-literal" | "form-action-literal" | "button-showmodal";
  shell: boolean;
}
export interface CollectedLink {
  file: HtmlFile;
  link: HtmlLink;
  key: string;
}
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
            false,
            "button-showmodal",
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
  rootDir: string,
  resolver: RouteResolver,
  stateScreens: Map<string, ScreenNode>,
  counters: Counters,
  shell: boolean,
  id: string,
): ActionEdge | null {
  const target = targetForHtmlHref(
    item.file,
    item.link.href,
    rootDir,
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
      : `${item.link.pattern === "form-action-literal" ? "Form" : item.link.pattern === "button-showmodal" ? "Button" : "Link"}: ${item.link.label}`,
    confidence: "high",
    pattern: shell ? "shell-nav-literal" : item.link.pattern,
    evidence: { file: item.file.file, line: item.link.line },
    scope: shell ? "shell" : "screen",
    resolved: !/^(external|missing):/.test(target),
    href: item.link.href,
  };
}

function createLink(
  file: HtmlFile,
  href: string,
  label: string,
  line: number,
  shell: boolean,
  form = false,
  pattern?: HtmlLink["pattern"],
): CollectedLink {
  return {
    file,
    link: {
      href,
      label,
      line,
      shell,
      pattern: pattern ?? (form ? "form-action-literal" : "anchor-href-literal"),
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
