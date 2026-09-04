import { join } from "node:path";
import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import type { Counters, ScreenNode } from "../../schema/index.js";
import { parseSourceFile, traverseFile, type ParseCache, type ParsedFile } from "./parse-source-file.js";
import { stateKindForKey } from "./state-screens.js";
import { collectArrayLiteral, collectMembershipArray, collectStateAlias } from "./state-key-aliases.js";

/** A JSX attribute value seen on a component usage: `<Foo closeHref={expr} />`. */
export interface PropUsage { expr: t.Expression; parsed: ParsedFile; path: NodePath }

/** Everything the edge builder needs to know about one Route Screen's source files. */
export interface ScreenIndex {
  screen: ScreenNode;
  files: ParsedFile[];
  /** query keys the page reads that address State Screens (sp.modal, first(sp.tab), searchParams.get("step")) */
  stateKeys: Set<string>;
  /** component name → prop name → usages across the screen's files (one-hop prop passthrough) */
  props: Map<string, Map<string, PropUsage[]>>;
  /** component name → State Screen it is rendered under (`modal === "x" && <Comp/>`, `open ? <Comp/> : null`) */
  componentState: Map<string, { key: string; value: string } | { local: true }>;
  /** state values the page compares against (`stepParam === "models"`), proving those State Screens exist even without an edge */
  declaredStates: { key: string; value: string }[];
  /** useState setter name → component it gates (`const [open, setOpen] = useState()` + `open ? <Comp/> : null`) */
  setterToComponent: Map<string, string>;
  /** every component rendered behind a condition (`x ? <C/> : null`, `x && <C/>`), whatever the test is */
  conditionallyRendered: Set<string>;
  /** function name → call sites (`buildColumns((id) => …)`), for argument passthrough into non-component helpers */
  calls: Map<string, { args: t.CallExpression["arguments"]; parsed: ParsedFile; path: NodePath }[]>;
}

export function buildScreenIndex(rootDir: string, screen: ScreenNode, files: string[], cache?: ParseCache, counters?: Counters): ScreenIndex {
  const parsed = files.map((f) => parseSourceFile(join(rootDir, f), f, cache, counters)).filter((p): p is ParsedFile => p !== null);
  const index: ScreenIndex = { screen, files: parsed, stateKeys: new Set(), props: new Map(), componentState: new Map(), declaredStates: [], setterToComponent: new Map(), calls: new Map(), conditionallyRendered: new Set() };
  const stateVars = new Map<string, string>(); // local alias → state key, e.g. stepParam → step
  const aliasValues = new Map<string, { key: string; value: string }>(); // `const filterOpen = first(sp.filter) === "open"`
  const arrayLiterals = new Map<string, string[]>(); // `const steps = ["account", "plan", "confirm"] as const`
  const setters = new Map<string, string>(); // state var → setter name
  const componentGate = new Map<string, string>(); // component → local boolean that gates its render
  for (const file of parsed) {
    const isPage = file.file === screen.filePath;
    traverseFile(file, {
      MemberExpression(path) { if (isPage) collectStateKey(path.node, index.stateKeys); },
      CallExpression(path) {
        if (isPage) { collectSearchParamsGet(path.node, index.stateKeys); collectMembershipArray(path.node, stateVars, arrayLiterals, index); }
        if (t.isIdentifier(path.node.callee)) {
          const list = index.calls.get(path.node.callee.name) ?? [];
          list.push({ args: path.node.arguments, parsed: file, path });
          index.calls.set(path.node.callee.name, list);
        }
      },
      VariableDeclarator(path) {
        if (isPage) { collectDestructuredKeys(path.node, index.stateKeys); collectStateAlias(path.node, stateVars, aliasValues); collectArrayLiteral(path.node, arrayLiterals); }
        collectUseStateSetter(path.node, setters);
      },
      BinaryExpression(path) { if (isPage) collectDeclaredState(path.node, stateVars, index); },
      JSXOpeningElement(path) { collectProps(path, file, index); },
      LogicalExpression(path) { collectConditionalRender(path.node.left, path.node.right, index, stateVars, aliasValues, componentGate); },
      ConditionalExpression(path) { collectConditionalRender(path.node.test, path.node.consequent, index, stateVars, aliasValues, componentGate); },
    });
  }
  for (const [component, state] of index.componentState) {
    if (!("local" in state)) continue;
    for (const [stateVar, setter] of setters) if (componentGate.get(component) === stateVar) index.setterToComponent.set(setter, component);
  }
  return index;
}

/** `stepParam === "models"` where stepParam aliases sp.step → State Screen ?step=models exists. */
function collectDeclaredState(node: t.BinaryExpression, aliases: Map<string, string>, index: ScreenIndex): void {
  if (node.operator !== "===" && node.operator !== "==") return;
  const [a, b] = [node.left, node.right];
  const ident = t.isIdentifier(a) ? a : t.isIdentifier(b) ? b : null;
  const lit = t.isStringLiteral(a) ? a : t.isStringLiteral(b) ? b : null;
  if (!ident || !lit) return;
  const key = aliases.get(ident.name) ?? (stateKindForKey(ident.name) ? ident.name : null);
  if (!key || lit.value === "" || index.declaredStates.some((d) => d.key === key && d.value === lit.value)) return;
  index.stateKeys.add(key);
  index.declaredStates.push({ key, value: lit.value });
}

/** `const [drawerOpen, setDrawerOpen] = useState(...)` */
function collectUseStateSetter(node: t.VariableDeclarator, setters: Map<string, string>): void {
  if (!t.isArrayPattern(node.id) || !t.isCallExpression(node.init) || !t.isIdentifier(node.init.callee, { name: "useState" })) return;
  const [v, s] = node.id.elements;
  if (t.isIdentifier(v) && t.isIdentifier(s)) setters.set(v.name, s.name);
}

/** `sp.modal`, `searchParams.step` */
function collectStateKey(node: t.MemberExpression, keys: Set<string>): void {
  if (!t.isIdentifier(node.object) || !/^(sp|searchParams|params|query)$/.test(node.object.name)) return;
  if (t.isIdentifier(node.property) && !node.computed && stateKindForKey(node.property.name)) keys.add(node.property.name);
}

/** `searchParams.get("modal")` */
function collectSearchParamsGet(node: t.CallExpression, keys: Set<string>): void {
  const c = node.callee;
  if (t.isMemberExpression(c) && t.isIdentifier(c.property) && c.property.name === "get" && t.isStringLiteral(node.arguments[0]) && stateKindForKey(node.arguments[0].value)) keys.add(node.arguments[0].value);
}

/** `const { modal, tab } = sp` */
function collectDestructuredKeys(node: t.VariableDeclarator, keys: Set<string>): void {
  if (!t.isObjectPattern(node.id) || !t.isIdentifier(node.init) || !/^(sp|searchParams)$/.test(node.init.name)) return;
  for (const p of node.id.properties) if (t.isObjectProperty(p) && t.isIdentifier(p.key) && stateKindForKey(p.key.name)) keys.add(p.key.name);
}

function collectProps(path: NodePath<t.JSXOpeningElement>, file: ParsedFile, index: ScreenIndex): void {
  const name = path.node.name;
  if (!t.isJSXIdentifier(name) || !/^[A-Z]/.test(name.name)) return;
  for (const attr of path.node.attributes) {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name) || !attr.value) continue;
    const expr = t.isJSXExpressionContainer(attr.value) ? attr.value.expression : attr.value;
    if (t.isJSXEmptyExpression(expr)) continue;
    const byProp = index.props.get(name.name) ?? new Map<string, PropUsage[]>();
    const list = byProp.get(attr.name.name) ?? [];
    list.push({ expr, parsed: file, path });
    byProp.set(attr.name.name, list);
    index.props.set(name.name, byProp);
  }
}

/** `modal === "approve-confirm" && selected ? <Dialog/>` → Dialog rendered under State Screen modal=approve-confirm. */
function collectConditionalRender(test: t.Expression, rendered: t.Expression | t.PrivateName, index: ScreenIndex, aliases: Map<string, string>, aliasValues: Map<string, { key: string; value: string }>, componentGate: Map<string, string>): void {
  const component = renderedComponentName(rendered);
  if (!component) return;
  index.conditionallyRendered.add(component);
  if (index.componentState.has(component)) return;
  const eq = findStateEquality(test, aliases) ?? (t.isIdentifier(test) ? aliasValues.get(test.name) ?? null : null);
  if (eq) index.componentState.set(component, eq);
  else if (t.isIdentifier(test) && /open|show|visible/i.test(test.name)) {
    index.componentState.set(component, { local: true });
    componentGate.set(component, test.name);
  }
}

function renderedComponentName(node: t.Node): string | null {
  if (!t.isJSXElement(node)) return null;
  const n = node.openingElement.name;
  return t.isJSXIdentifier(n) && /^[A-Z]/.test(n.name) ? n.name : null;
}

/** Finds `key === "value"` anywhere inside a (possibly &&-chained) test. */
function findStateEquality(test: t.Expression, aliases: Map<string, string>): { key: string; value: string } | null {
  if (t.isLogicalExpression(test)) return findStateEquality(test.left, aliases) ?? findStateEquality(test.right, aliases);
  if (t.isBinaryExpression(test) && (test.operator === "===" || test.operator === "==")) {
    const [a, b] = [test.left, test.right];
    const ident = t.isIdentifier(a) ? a : t.isIdentifier(b) ? b : null;
    const lit = t.isStringLiteral(a) ? a : t.isStringLiteral(b) ? b : null;
    if (!ident || !lit) return null;
    const key = aliases.get(ident.name) ?? (stateKindForKey(ident.name) ? ident.name : null);
    if (key) return { key, value: lit.value };
  }
  return null;
}
