import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

/** Names of JSX elements whose text is a good Action Trigger label. */
const CLICKABLE = new Set(["Button", "button", "a", "Link", "NavLink", "DropdownMenuItem", "MenuItem", "TabsTrigger", "Checkbox"]);

/** Collects visible text inside a JSX element (recursing through children), e.g. 'Sign in with VID'. */
export function jsxText(node: t.JSXElement | t.JSXFragment): string {
  const parts: string[] = [];
  for (const child of node.children) {
    if (t.isJSXText(child)) parts.push(child.value.trim());
    else if (t.isJSXExpressionContainer(child) && t.isStringLiteral(child.expression)) parts.push(child.expression.value);
    else if (t.isJSXElement(child) || t.isJSXFragment(child)) parts.push(jsxText(child));
  }
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, MAX_LABEL);
}

const MAX_LABEL = 80;

export function jsxElementName(node: t.JSXElement): string {
  let name = node.openingElement.name;
  const parts: string[] = [];
  while (t.isJSXMemberExpression(name)) { parts.unshift(name.property.name); name = name.object; }
  if (t.isJSXIdentifier(name)) parts.unshift(name.name);
  return parts.join(".") || "element";
}

/**
 * Derives a human trigger label for a navigation call: nearest enclosing clickable JSX element's
 * text, else the element name, else the enclosing function/component name.
 */
export function triggerLabelFor(path: NodePath): string {
  let current: NodePath | null = path;
  let fallbackElement: string | null = null;
  while (current) {
    if (current.isJSXElement()) {
      const name = jsxElementName(current.node);
      const text = jsxText(current.node);
      if (CLICKABLE.has(name) && text) return `${prettyName(clickableChildName(current.node) ?? name)}: ${text}`;
      if (text && !fallbackElement) fallbackElement = `${prettyName(name)}: ${text}`;
      if (!fallbackElement) fallbackElement = prettyName(name);
    }
    if (current.isFunctionDeclaration() && current.node.id) return fallbackElement ?? current.node.id.name;
    if (current.isVariableDeclarator() && t.isIdentifier(current.node.id)) return fallbackElement ?? current.node.id.name;
    current = current.parentPath;
  }
  return fallbackElement ?? "navigation";
}

/** `<Link><Button>Pay</Button></Link>`: the Button is what the user perceives as the trigger. */
function clickableChildName(node: t.JSXElement): string | null {
  for (const child of node.children) {
    if (t.isJSXElement(child)) {
      const name = jsxElementName(child);
      if (name === "Button" || name === "button") return name;
    }
  }
  return null;
}

function prettyName(name: string): string {
  return name === "a" ? "Link" : name === "button" ? "Button" : name;
}
