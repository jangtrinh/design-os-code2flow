import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { lineOf, snippetAt, traverseFile, type ParsedFile } from "./parse-source-file.js";
import { triggerLabelFor } from "./trigger-label.js";

export type NavCallKind = "link" | "anchor" | "form" | "router-push" | "redirect" | "not-found" | "prop-href" | "open-overlay";

/** One navigation intent found in source, before target resolution. */
export interface NavCall {
  kind: NavCallKind;
  /** Literal path when the href/argument is a plain string; otherwise null and `expression` is set. */
  literal: string | null;
  expression: t.Expression | t.JSXEmptyExpression | null;
  file: string;
  line: number;
  snippet: string;
  trigger: string;
  /** Babel path of the call/attribute, kept for scope-aware href resolution. */
  path: NodePath;
  /** Enclosing React component name (function or const arrow), used to attribute edges to State Screens. */
  component: string | null;
  /** For prop-href / open-overlay: the component receiving the href prop, or the useState setter being called. */
  targetComponent?: string;
  /** `<a target="_blank">`: an unresolved href is an external link, not a runtime route. */
  external?: boolean;
  /** Source text of the href expression, for `external:`/`dynamic:` target ids. */
  exprText?: string;
}

const JSX_HREF_ELEMENTS: Record<string, { attr: string; kind: NavCallKind }> = {
  Link: { attr: "href", kind: "link" },
  NavLink: { attr: "href", kind: "link" },
  a: { attr: "href", kind: "anchor" },
  form: { attr: "action", kind: "form" },
};
const ROUTER_METHODS = new Set(["push", "replace"]);
const REDIRECT_FUNCTIONS = new Set(["redirect", "permanentRedirect"]);

/** Extracts <Link href>, <a href>, <form action>, router.push/replace(), redirect(), notFound() from one file. */
export function extractNavigationCalls(parsed: ParsedFile): NavCall[] {
  const calls: NavCall[] = [];
  const serverActionModule = /^\s*["']use server["'];/m.test(parsed.source);
  const push = (kind: NavCallKind, node: t.Node, path: NodePath, value: t.Node | null | undefined): void => {
    const literal = value && t.isStringLiteral(value) ? value.value : templateWithoutExpressions(value);
    calls.push({
      kind,
      literal,
      expression: literal !== null || !value ? null : (value as t.Expression),
      file: parsed.file,
      line: lineOf(node),
      snippet: snippetAt(parsed, node),
      trigger: triggerLabelFor(path),
      path,
      component: enclosingComponentName(path),
    });
  };

  traverseFile(parsed, {
    JSXOpeningElement(path) {
      const name = path.node.name;
      if (!t.isJSXIdentifier(name)) return;
      const spec = JSX_HREF_ELEMENTS[name.name];
      if (!spec) {
        if (/^[A-Z]/.test(name.name)) collectPropHrefs(path, name.name);
        return;
      }
      const attr = path.node.attributes.find((a): a is t.JSXAttribute => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name) && a.name.name === spec.attr);
      if (!attr || !attr.value) return;
      const value = t.isJSXExpressionContainer(attr.value) ? attr.value.expression : attr.value;
      push(spec.kind, attr, path, value);
      const last = calls[calls.length - 1];
      last.exprText = parsed.source.slice(value.start ?? 0, value.end ?? 0);
      last.external = path.node.attributes.some((a) => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name) && a.name.name === "target" && t.isStringLiteral(a.value) && a.value.value === "_blank");
    },
    CallExpression(path) {
      const callee = path.node.callee;
      if (t.isMemberExpression(callee) && t.isIdentifier(callee.property) && ROUTER_METHODS.has(callee.property.name) && t.isIdentifier(callee.object) && /router/i.test(callee.object.name)) {
        push("router-push", path.node, path, path.node.arguments[0]);
      } else if (!serverActionModule && t.isIdentifier(callee) && REDIRECT_FUNCTIONS.has(callee.name)) {
        push("redirect", path.node, path, path.node.arguments[0]);
      } else if (t.isIdentifier(callee) && callee.name === "notFound") {
        push("not-found", path.node, path, null);
      } else if (t.isIdentifier(callee) && /^(set|open|show)[A-Z]/.test(callee.name) && (path.node.arguments.length === 0 || t.isBooleanLiteral(path.node.arguments[0], { value: true }))) {
        // `setDrawerOpen(true)`: opening a locally toggled overlay (ADR-0005 medium tier)
        calls.push({ kind: "open-overlay", literal: null, expression: null, file: parsed.file, line: lineOf(path.node), snippet: snippetAt(parsed, path.node), trigger: triggerLabelFor(path), path, component: enclosingComponentName(path), targetComponent: callee.name });
      }
    },
  });
  return calls;

  /** `<ApprovalDetailPanel approveHref={x} />`: an href handed to a component is a navigation intent of this screen. */
  function collectPropHrefs(path: NodePath<t.JSXOpeningElement>, componentName: string): void {
    for (const attr of path.node.attributes) {
      if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name) || !attr.value) continue;
      const propName = attr.name.name;
      if (!/^(href|to)$|Href$|href$/.test(propName)) continue;
      const value = t.isJSXExpressionContainer(attr.value) ? attr.value.expression : attr.value;
      const literal = t.isStringLiteral(value) ? value.value : templateWithoutExpressions(value);
      calls.push({
        kind: "prop-href",
        literal,
        expression: literal !== null ? null : (value as t.Expression),
        file: parsed.file,
        line: lineOf(attr),
        snippet: snippetAt(parsed, attr),
        trigger: `${componentName}: ${humanizeProp(propName)}`,
        path,
        component: enclosingComponentName(path),
        targetComponent: componentName,
      });
    }
  }
}

/** approveHref → "Approve", closeHref → "Close", href → "Link". */
function humanizeProp(prop: string): string {
  const base = prop.replace(/[Hh]ref$/, "").replace(/^to$/, "");
  if (!base) return "Link";
  const words = base.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** `\`/a/b\`` with zero `${}` parts is as good as a string literal. */
function templateWithoutExpressions(node: t.Node | null | undefined): string | null {
  if (node && t.isTemplateLiteral(node) && node.expressions.length === 0) return node.quasis[0].value.cooked ?? null;
  return null;
}

/** Nearest enclosing `function Foo()` or `const Foo = () =>` whose name starts with a capital letter. */
export function enclosingComponentName(path: NodePath): string | null {
  let current: NodePath | null = path;
  while (current) {
    if (current.isFunctionDeclaration() && current.node.id && /^[A-Z]/.test(current.node.id.name)) return current.node.id.name;
    if ((current.isArrowFunctionExpression() || current.isFunctionExpression()) && current.parentPath?.isVariableDeclarator()) {
      const id = current.parentPath.node.id;
      if (t.isIdentifier(id) && /^[A-Z]/.test(id.name)) return id.name;
    }
    current = current.parentPath;
  }
  return null;
}
