import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import * as t from "@babel/types";
import type { ActionEdge, Counters, ScreenNode } from "../../schema/index.js";
import type { IngestorAdapter } from "../adapter-types.js";
import { lineOf, parseSourceFile, snippetAt, traverseFile, type ParsedFile } from "../nextjs-app-router/parse-source-file.js";
import { enclosingComponentName } from "../nextjs-app-router/extract-navigation-calls.js";
import { triggerLabelFor } from "../nextjs-app-router/trigger-label.js";
import { buildReactRouteRegistry } from "./route-registry.js";

export interface DetectedReactRouter { files: string[] }

export const reactRouterAdapter: IngestorAdapter<DetectedReactRouter> = {
  id: "react-router",
  label: "React Router",
  detect(rootDir) {
    const packagePath = join(rootDir, "package.json");
    if (!existsSync(packagePath)) return null;
    try {
      const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      if (!pkg.dependencies?.["react-router"] && !pkg.dependencies?.["react-router-dom"] && !pkg.devDependencies?.["react-router"] && !pkg.devDependencies?.["react-router-dom"]) return null;
    } catch { return null; }
    const files = sourceFiles(rootDir);
    return files.some((file) => /createBrowserRouter|<Routes\b|<Route\b/.test(readFileSync(file, "utf8"))) ? { files } : null;
  },
  async ingest(rootDir, detected) {
    const counters: Counters = {};
    const files = detected.files.flatMap((abs) => { const parsed = parseSourceFile(abs, relative(rootDir, abs)); if (!parsed) { bump(counters, relative(rootDir, abs), "parse-error"); return []; } return [parsed]; });
    const registry = buildReactRouteRegistry(files);
    const states = new Map<string, ScreenNode>();
    for (const file of files) collectSearchParamStates(file, registry.componentRoutes, states);
    const edges = files.flatMap((file) => extractEdges(file, registry.componentRoutes, registry.shellComponents, registry.resolve, registry.screens, states, counters)).map((edge, index) => ({ ...edge, id: `e${index + 1}` }));
    return { graph: { version: 1, framework: "react-router", rootDir, screens: [...registry.screens, ...states.values()].sort((a, b) => a.id.localeCompare(b.id)), edges, counters }, resolver: registry };
  },
};

function extractEdges(file: ParsedFile, owners: Map<string, string>, shells: Set<string>, resolve: (path: string) => string | null, screens: ScreenNode[], states: Map<string, ScreenNode>, counters: Counters): ActionEdge[] {
  const edges: ActionEdge[] = [];
  let sequence = 0;
  const ownerFor = (path: Parameters<typeof enclosingComponentName>[0]) => enclosingComponentName(path);
  const sourceFor = (path: Parameters<typeof enclosingComponentName>[0]) => owners.get(ownerFor(path) ?? "") ?? routeObjectPath(path) ?? screens[0]?.id;
  const add = (path: Parameters<typeof enclosingComponentName>[0], value: string, pattern: string, confidence: "high" | "medium" = "high") => {
    const source = sourceFor(path); if (!source) { bump(counters, file.file, "navigation-without-route"); return; }
    if (value.startsWith("#")) { bump(counters, file.file, "anchor-hash"); return; }
    const [pathname, query] = value.split("?", 2);
    const target = value.startsWith("http") ? `external:${value}` : query !== undefined ? state(resolve(pathname || source) ?? source, `?${query}`, file.file, states) : value.startsWith("?") ? state(source, value, file.file, states) : resolve(value);
    const edgeTarget = target ?? `missing:${value.split("?")[0]}`;
    const scope = shells.has(ownerFor(path) ?? "") ? "shell" : "screen";
    edges.push({ id: `rr-${file.file}-${++sequence}`, source: scope === "shell" ? "shell" : source, target: edgeTarget, trigger: triggerLabelFor(path), confidence, pattern, evidence: { file: file.file, line: lineOf(path.node), snippet: snippetAt(file, path.node) }, scope, resolved: Boolean(target) && !edgeTarget.startsWith("external:") });
  };
  traverseFile(file, {
    JSXOpeningElement(path) {
      if (!t.isJSXIdentifier(path.node.name)) return;
      const name = path.node.name.name;
      if (!["Link", "NavLink", "Navigate"].includes(name)) return;
      const value = stringAttribute(path.node, "to");
      if (value !== null) add(path, value, name === "Navigate" ? "navigate-element" : "link-to");
      else { const template = templateAttribute(path.node, "to"); if (template) add(path, template, "link-to-template", "medium"); else bump(counters, file.file, "unresolved-to"); }
    },
    CallExpression(path) {
      const argument = path.node.arguments[0];
      if ((t.isNumericLiteral(argument) || t.isUnaryExpression(argument, { operator: "-" }) && t.isNumericLiteral(argument.argument)) && t.isIdentifier(path.node.callee) && /navigate/i.test(path.node.callee.name)) { bump(counters, file.file, "navigate-history-offset"); return; }
      if (t.isStringLiteral(argument) && t.isIdentifier(path.node.callee) && (path.node.callee.name === "redirect" || /navigate/i.test(path.node.callee.name))) add(path, argument.value, path.node.callee.name === "redirect" ? "redirect" : "use-navigate");
      if (t.isIdentifier(path.node.callee) && /^set[A-Z].*(Open|Visible)$/.test(path.node.callee.name) && t.isBooleanLiteral(argument, { value: true }) && /<Dialog\b/.test(file.source)) {
        const source = sourceFor(path); if (!source) return;
        const dialogId = dialogIdentifier(file) ?? "dialog";
        const id = `${source}#${dialogId}`; if (!states.has(id)) states.set(id, { id, kind: "modal", parentScreenId: source, label: dialogId, filePath: file.file });
        edges.push({ id: `rr-${file.file}-${++sequence}`, source, target: id, trigger: triggerLabelFor(path), confidence: "medium", pattern: "open-overlay-usestate-setter", evidence: { file: file.file, line: lineOf(path.node), snippet: snippetAt(file, path.node) }, scope: "screen", resolved: true });
      }
      if (t.isIdentifier(path.node.callee) && /^setSearchParams$/.test(path.node.callee.name) && t.isObjectExpression(argument)) {
        const tab = argument.properties.find((p): p is t.ObjectProperty => t.isObjectProperty(p) && t.isIdentifier(p.key, { name: "tab" }) && t.isStringLiteral(p.value));
        const tabValue = tab && t.isStringLiteral(tab.value) ? tab.value.value : null;
        const source = sourceFor(path); if (tabValue && source) add(path, `?tab=${tabValue}`, "search-params-tab");
      }
    },
  });
  return edges;
}

function state(route: string, query: string, file: string, states: Map<string, ScreenNode>): string {
  const id = `${route}${query}`; if (!states.has(id)) states.set(id, { id, kind: "tab", parentScreenId: route, label: query.slice(1), filePath: file }); return id;
}
function collectSearchParamStates(file: ParsedFile, owners: Map<string, string>, states: Map<string, ScreenNode>): void {
  if (!file.source.includes("useSearchParams")) return;
  const component = [...owners.keys()].find((name) => {
    const start = file.source.indexOf(`function ${name}`);
    const body = file.source.slice(start, file.source.indexOf("export function", start + 1) || undefined);
    return start >= 0 && body.includes("useSearchParams");
  });
  const route = component ? owners.get(component) : undefined;
  if (!route) return;
  const start = file.source.indexOf(`function ${component}`);
  const body = file.source.slice(start, file.source.indexOf("export function", start + 1) || undefined);
  const values = new Set<string>();
  for (const match of body.matchAll(/(?:const|let)\s+\w+\s*=\s*\[([^\]]+)\]/g)) for (const value of match[1].matchAll(/["']([^"']+)["']/g)) values.add(value[1]);
  for (const match of body.matchAll(/(?:===|==)\s*["']([^"']+)["']|["']([^"']+)["']\s*(?:===|==)/g)) values.add(match[1] ?? match[2]);
  for (const value of values) if (value) state(route, `?tab=${value}`, file.file, states);
}
function dialogIdentifier(file: ParsedFile): string | null { const match = /<Dialog\b[^>]*\bid=["']([^"']+)["']/.exec(file.source); return match?.[1] ?? null; }
function routeObjectPath(path: Parameters<typeof enclosingComponentName>[0]): string | null {
  const object = path.findParent((parent) => parent.isObjectExpression());
  if (!object?.isObjectExpression()) return null;
  const prop = object.node.properties.find((item): item is t.ObjectProperty => t.isObjectProperty(item) && t.isIdentifier(item.key, { name: "path" }) && t.isStringLiteral(item.value));
  return prop && t.isStringLiteral(prop.value) ? `/${prop.value.value}`.replace(/\/+/g, "/") : null;
}
function stringAttribute(node: t.JSXOpeningElement, name: string): string | null { const attr = node.attributes.find((a): a is t.JSXAttribute => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name, { name })); return t.isStringLiteral(attr?.value) ? attr.value.value : attr?.value && t.isJSXExpressionContainer(attr.value) && t.isStringLiteral(attr.value.expression) ? attr.value.expression.value : null; }
function templateAttribute(node: t.JSXOpeningElement, name: string): string | null { const attr = node.attributes.find((a): a is t.JSXAttribute => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name, { name })); const value = attr?.value; const expression = value && t.isJSXExpressionContainer(value) ? value.expression : null; if (!expression || !t.isTemplateLiteral(expression)) return null; const text = expression.quasis.map((part, index) => `${part.value.cooked ?? ""}${index < expression.expressions.length ? "x" : ""}`).join(""); return text.startsWith("/") ? text : null; }
function bump(counters: Counters, file: string, name: string): void { counters[file] ??= {}; counters[file][name] = (counters[file][name] ?? 0) + 1; }
function sourceFiles(root: string): string[] { const out: string[] = []; const walk = (dir: string) => { for (const entry of readdirSync(dir, { withFileTypes: true })) { if (entry.name === "node_modules" || entry.name.startsWith(".")) continue; const full = join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full); } }; walk(root); return out; }
