import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, posix, relative } from "node:path";
import type { ActionEdge, Counters, ScreenNode } from "../../schema/index.js";
import type { IngestorAdapter, IngestResult, RouteResolver } from "../adapter-types.js";

interface HtmlFile { file: string; source: string; route: string }
interface Link { href: string; label: string; line: number; pattern: "anchor-href-literal" | "form-action-literal"; shell: boolean }

const tag = /<(a|form|button|dialog)\b([^>]*)>([\s\S]*?)<\/\1\s*>|<(a|form|button|dialog)\b([^>]*)\/?\s*>/gi;
const attr = /([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
const external = /^(https?:)?\/\/|^(mailto|tel):/;

export interface StaticHtmlDetection { files: string[] }

export const staticHtmlAdapter: IngestorAdapter<StaticHtmlDetection> = {
  id: "static-html",
  label: "Static HTML",
  detect(rootDir) {
    if (existsSync(join(rootDir, "package.json"))) return null;
    const files = htmlPaths(rootDir);
    return files.some((file) => /<a\b[^>]*\bhref\s*=/i.test(readFileSync(join(rootDir, file), "utf8"))) ? { files } : null;
  },
  async ingest(rootDir, detected) {
    const files = detected.files.map((file) => ({ file, source: readFileSync(join(rootDir, file), "utf8"), route: routeFor(file) }));
    const screens = files.map(({ file, route }) => ({ id: route, kind: "route" as const, filePath: file }));
    const resolver = makeResolver(screens);
    const counters: Counters = {};
    const stateScreens = new Map<string, ScreenNode>();
    const links = files.flatMap((file) => extractLinks(file, counters, stateScreens));
    const shellKeys = shellLinkKeys(links, files.length);
    const edges: ActionEdge[] = [];
    let seq = 0;
    for (const item of links) {
      const target = targetFor(item, resolver, stateScreens, counters);
      if (!target) continue;
      edges.push({ id: item.link.shell && shellKeys.has(item.key) ? `shell${++seq}` : `e${++seq}`, source: item.link.shell && shellKeys.has(item.key) ? "shell" : item.file.route, target, trigger: item.link.shell && shellKeys.has(item.key) ? `Nav: ${item.link.label}` : `${item.link.pattern === "form-action-literal" ? "Form" : "Link"}: ${item.link.label}`, confidence: "high", pattern: item.link.shell && shellKeys.has(item.key) ? "shell-nav-literal" : item.link.pattern, evidence: { file: item.file.file, line: item.link.line }, scope: item.link.shell && shellKeys.has(item.key) ? "shell" : "screen", resolved: !/^(external|missing):/.test(target), href: item.link.href });
    }
    for (const file of files) edges.push(...locationEdges(file, resolver, counters, () => `e${++seq}`));
    return { graph: { version: 1, framework: "static-html", rootDir, screens: [...screens, ...stateScreens.values()].sort((a, b) => a.id.localeCompare(b.id)), edges: dedupeShell(edges), counters }, resolver };
  },
};

function htmlPaths(root: string, dir = root): string[] { return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? (entry.name === "node_modules" || entry.name.startsWith(".") ? [] : htmlPaths(root, join(dir, entry.name))) : entry.name.endsWith(".html") ? [relative(root, join(dir, entry.name))] : []); }
function routeFor(file: string): string { const stem = file.replace(/\.html$/, ""); return (stem === "index" ? "/" : `/${stem.replace(/\/index$/, "")}`).replace(/\/+/g, "/"); }
function makeResolver(screens: ScreenNode[]): RouteResolver { return { screens, resolve(path) { const clean = path.split(/[?#]/)[0].replace(/\/+$/, "") || "/"; return screens.some((screen) => screen.id === clean) ? clean : null; } }; }
function attributes(raw: string): Record<string, string> { const result: Record<string, string> = {}; for (const match of raw.matchAll(attr)) result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? ""; return result; }
function text(raw: string): string { return raw.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 80); }
function extractLinks(file: HtmlFile, counters: Counters, states: Map<string, ScreenNode>): Array<{ file: HtmlFile; link: Link; key: string }> {
  const out: Array<{ file: HtmlFile; link: Link; key: string }> = [];
  for (const match of file.source.matchAll(tag)) { const name = (match[1] ?? match[4]).toLowerCase(); const attrs = attributes(match[2] ?? match[5] ?? ""); const raw = match[3] ?? ""; const line = file.source.slice(0, match.index).split("\n").length; if (name === "dialog" && attrs.id) states.set(`${file.route}#${attrs.id}`, { id: `${file.route}#${attrs.id}`, kind: "modal", parentScreenId: file.route, label: text(raw) || attrs.id, filePath: file.file }); if (name === "button" && /showModal\(\)/.test(attrs.onclick ?? "")) { const dialog = (attrs.onclick.match(/(?:getElementById|querySelector)\(['\"]#?([^'\"]+)/) ?? [])[1]; if (dialog) out.push({ file, link: { href: `#${dialog}`, label: text(raw) || "Open dialog", line, pattern: "anchor-href-literal", shell: false }, key: "" }); } const href = name === "a" ? attrs.href : name === "form" ? attrs.action : undefined; if (href !== undefined) out.push({ file, link: { href, label: text(raw) || attrs["aria-label"] || name, line, pattern: name === "a" ? "anchor-href-literal" : "form-action-literal", shell: /<header\b[^>]*>[\s\S]*$/.test(file.source.slice(0, match.index! + match[0].length)) && /<\/header>/i.test(file.source.slice(match.index!)) }, key: `${href}|${text(raw)}` }); }
  return out;
}
function shellLinkKeys(links: Array<{ key: string; link: Link }>, pages: number): Set<string> { const counts = new Map<string, number>(); for (const link of links) if (link.link.shell) counts.set(link.key, (counts.get(link.key) ?? 0) + 1); return new Set([...counts].filter(([, count]) => count * 2 >= pages).map(([key]) => key)); }
function targetFor(item: { file: HtmlFile; link: Link }, resolver: RouteResolver, states: Map<string, ScreenNode>, counters: Counters): string | null { const { href } = item.link; if (href.startsWith("#")) { const id = `${item.file.route}${href}`; if (states.has(id)) return id; counters[item.file.file] = { ...(counters[item.file.file] ?? {}), "anchor-hash": (counters[item.file.file]?.["anchor-hash"] ?? 0) + 1 }; return null; } if (external.test(href)) return `external:${href}`; const path = (href.startsWith("/") ? href : posix.normalize(posix.join(posix.dirname(item.file.route), href))).replace(/\.html(?=\?|#|$)/, ""); const route = resolver.resolve(path); if (!route) return `missing:${path.split(/[?#]/)[0]}`; const tab = path.match(/[?&]tab=([^&#]+)/); if (tab) { const id = `${route}?tab=${decodeURIComponent(tab[1])}`; if (!states.has(id)) states.set(id, { id, kind: "tab", parentScreenId: route, label: `${decodeURIComponent(tab[1])} tab`, filePath: resolver.screens.find((screen) => screen.id === route)?.filePath ?? item.file.file }); return id; } return route; }
function locationEdges(file: HtmlFile, resolver: RouteResolver, counters: Counters, nextId: () => string): ActionEdge[] { const edges: ActionEdge[] = []; for (const match of file.source.matchAll(/(?:location\.href|window\.open)\s*(?:=|\()\s*["']([^"']+)["']/g)) { const href = match[1]; const route = resolver.resolve(href); edges.push({ id: nextId(), source: file.route, target: route ?? `missing:${href}`, trigger: "script navigation", confidence: "high", pattern: "location-href-literal", evidence: { file: file.file, line: file.source.slice(0, match.index).split("\n").length }, scope: "screen", resolved: Boolean(route), href }); } return edges; }
function dedupeShell(edges: ActionEdge[]): ActionEdge[] { const seen = new Set<string>(); return edges.filter((edge) => edge.scope !== "shell" || !seen.has(`${edge.target}|${edge.trigger}`) && Boolean(seen.add(`${edge.target}|${edge.trigger}`))); }
