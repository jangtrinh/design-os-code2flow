import * as t from "@babel/types";
import type { ScreenNode } from "../../schema/index.js";
import type { ParsedFile } from "../nextjs-app-router/parse-source-file.js";
import { traverseFile } from "../nextjs-app-router/parse-source-file.js";

export interface ReactRouteRegistry {
  screens: ScreenNode[];
  componentRoutes: Map<string, string>;
  shellComponents: Set<string>;
  resolve(path: string): string | null;
}

interface FoundRoute { path: string; component: string | null; file: string; shell: boolean }

export function buildReactRouteRegistry(files: ParsedFile[]): ReactRouteRegistry {
  const found: FoundRoute[] = [];
  for (const file of files) traverseFile(file, {
    JSXElement(path) {
      if (!t.isJSXIdentifier(path.node.openingElement.name, { name: "Route" })) return;
      const value = jsxAttribute(path.node.openingElement, "path");
      const parent = path.findParent((p) => p.isJSXElement() && t.isJSXIdentifier(p.node.openingElement.name, { name: "Route" }));
      const parentPath = parent && parent.isJSXElement() ? jsxAttribute(parent.node.openingElement, "path") : null;
      const fullPath = joinPath(parentPath, value ?? (jsxAttribute(path.node.openingElement, "index") !== null ? "" : null));
      if (fullPath) found.push({ path: fullPath, component: elementComponent(path.node.openingElement), file: file.file, shell: path.node.children.some((child) => t.isJSXElement(child) && t.isJSXIdentifier(child.openingElement.name, { name: "Route" })) });
    },
    CallExpression(path) {
      if (!t.isIdentifier(path.node.callee, { name: "createBrowserRouter" }) || !t.isArrayExpression(path.node.arguments[0])) return;
      collectObjects(path.node.arguments[0], null, file.file, found);
    },
  });
  const seen = new Set<string>();
  const componentRoutes = new Map<string, string>();
  const shellComponents = new Set<string>();
  const screens = found.flatMap((route) => {
    const id = canonicalPath(route.path);
    if (seen.has(id)) return [];
    seen.add(id);
    if (route.component) componentRoutes.set(route.component, id);
    if (route.component && route.shell) shellComponents.add(route.component);
    return [{ id, kind: "route" as const, filePath: route.file, dynamic: id.includes("[" ) || undefined, catchAll: id.includes("[...") || undefined }];
  }).sort((a, b) => a.id.localeCompare(b.id));
  return { screens, componentRoutes, shellComponents, resolve: resolver(screens) };
}

function collectObjects(array: t.ArrayExpression, parent: string | null, file: string, out: FoundRoute[]): void {
  for (const item of array.elements) {
    if (!t.isObjectExpression(item)) continue;
    const path = objectString(item, "path");
    const fullPath = joinPath(parent, path ?? (objectHas(item, "index") ? "" : null));
    const children = objectArray(item, "children");
    if (fullPath) out.push({ path: fullPath, component: objectElementComponent(item), file, shell: Boolean(children) });
    if (children) collectObjects(children, fullPath ?? parent, file, out);
  }
}

function jsxAttribute(node: t.JSXOpeningElement, name: string): string | null {
  const attr = node.attributes.find((a): a is t.JSXAttribute => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name, { name }));
  if (!attr) return null;
  if (t.isStringLiteral(attr.value)) return attr.value.value;
  return attr.value && t.isJSXExpressionContainer(attr.value) && t.isStringLiteral(attr.value.expression) ? attr.value.expression.value : null;
}

function elementComponent(node: t.JSXOpeningElement): string | null {
  const attr = node.attributes.find((a): a is t.JSXAttribute => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name, { name: "element" }));
  if (!attr || !t.isJSXExpressionContainer(attr.value) || !t.isJSXElement(attr.value.expression)) return null;
  return t.isJSXIdentifier(attr.value.expression.openingElement.name) ? attr.value.expression.openingElement.name.name : null;
}

function property(item: t.ObjectExpression, name: string): t.Expression | null {
  const prop = item.properties.find((p): p is t.ObjectProperty => t.isObjectProperty(p) && ((t.isIdentifier(p.key) && p.key.name === name) || (t.isStringLiteral(p.key) && p.key.value === name)));
  return prop && t.isExpression(prop.value) ? prop.value : null;
}
function objectString(item: t.ObjectExpression, name: string): string | null { const value = property(item, name); return t.isStringLiteral(value) ? value.value : null; }
function objectArray(item: t.ObjectExpression, name: string): t.ArrayExpression | null { const value = property(item, name); return t.isArrayExpression(value) ? value : null; }
function objectHas(item: t.ObjectExpression, name: string): boolean { return property(item, name) !== null; }
function objectElementComponent(item: t.ObjectExpression): string | null {
  const value = property(item, "element");
  return t.isJSXElement(value) && t.isJSXIdentifier(value.openingElement.name) ? value.openingElement.name.name : null;
}
function joinPath(parent: string | null, child: string | null): string | null { if (child === null) return null; if (child.startsWith("/")) return child; return `${parent === "/" ? "" : parent ?? ""}/${child}`; }
function canonicalPath(path: string): string { const clean = (path.replace(/\/+$/, "") || "/").replace(/:([^/]+)/g, "[$1]").replace(/\*/g, "[...rest]"); return clean.startsWith("/") ? clean : `/${clean}`; }
function resolver(screens: ScreenNode[]): (path: string) => string | null {
  const candidates = screens.map((screen) => ({ id: screen.id, regex: new RegExp(`^${screen.id.split("/").map((part) => part === "[...rest]" ? ".+" : /^\[.+\]$/.test(part) ? "[^/]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("/")}$`) })).sort((a, b) => Number(a.id.includes("[...")) - Number(b.id.includes("[...")));
  return (path) => { const clean = path.split(/[?#]/)[0].replace(/\/+$/, "") || "/"; return screens.find((s) => s.id === clean)?.id ?? candidates.find((c) => !c.id.includes("[...rest]") && c.regex.test(clean))?.id ?? null; };
}
