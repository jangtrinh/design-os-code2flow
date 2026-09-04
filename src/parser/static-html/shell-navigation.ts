import type { HtmlTag } from "./html-tag-scanner.js";

/** Returns true when a tag occurs within an open header element. */
export function isInHeader(tag: HtmlTag, headerDepth: number): boolean {
  return headerDepth > 0 && !tag.closing;
}

/** Selects links shared in headers on at least half of the route screens. */
export function sharedShellKeys(
  keys: Array<{ key: string; shell: boolean }>,
  pageCount: number,
): Set<string> {
  const counts = new Map<string, number>();
  for (const item of keys) {
    if (item.shell) counts.set(item.key, (counts.get(item.key) ?? 0) + 1);
  }
  return new Set(
    [...counts]
      .filter(([, count]) => count * 2 >= pageCount)
      .map(([key]) => key),
  );
}

/** Removes duplicate shell transitions while retaining the first source evidence. */
export function dedupeShellEdges<
  T extends { scope: string; target: string; trigger: string },
>(edges: T[]): T[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    if (edge.scope !== "shell") return true;
    const key = `${edge.target}|${edge.trigger}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
