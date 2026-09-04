import * as t from "@babel/types";
import { traverseFile, type ParsedFile } from "./parse-source-file.js";
import { jsxText } from "./trigger-label.js";

/** Detected page title: `export const metadata = { title: "…" }`, else the first `<h1>` text, else undefined. */
export function detectPageTitle(page: ParsedFile): string | undefined {
  const holder: { meta?: string; h1?: string } = {};
  traverseFile(page, {
    VariableDeclarator(p) {
      if (holder.meta || !t.isIdentifier(p.node.id, { name: "metadata" }) || !t.isObjectExpression(p.node.init)) return;
      const title = p.node.init.properties.find((q): q is t.ObjectProperty => t.isObjectProperty(q) && t.isIdentifier(q.key, { name: "title" }));
      if (title && t.isStringLiteral(title.value)) holder.meta = title.value.value;
    },
    JSXElement(p) {
      if (holder.h1) return;
      const name = p.node.openingElement.name;
      if (t.isJSXIdentifier(name, { name: "h1" })) holder.h1 = jsxText(p.node) || undefined;
    },
  });
  return holder.meta ?? holder.h1;
}
