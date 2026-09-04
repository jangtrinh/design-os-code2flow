import type { ScreenKind, ScreenNode } from "../../schema/index.js";

/**
 * Query keys that address a State Screen when the owning page reads them (ADR-0005).
 * Everything else (search, page, id, scope, from, edit, __state) is filtering, not a screen.
 */
const STATE_KEY_KINDS: Record<string, ScreenKind> = {
  modal: "modal",
  drawer: "modal",
  filter: "modal", // filter drawers are overlays
  dialog: "modal",
  sheet: "modal",
  tab: "tab",
  status: "tab", // status tabs in list pages
  view: "tab",
  step: "wizard-step",
};

export function stateKindForKey(key: string): ScreenKind | null {
  return STATE_KEY_KINDS[key] ?? null;
}

/** When several state keys appear (`?tab=user&drawer=edit`), the innermost overlay is the screen the user lands on. */
const KEY_PRIORITY = ["step", "modal", "dialog", "sheet", "drawer", "filter", "tab", "status", "view"];

/** Splits an href into route path and the state-addressing query pair, dropping filter-only params. */
export function splitStateQuery(href: string, keysReadByPage: Set<string>): { path: string; stateKey?: string; stateValue?: string; hash?: string } {
  const [pathAndQuery, hash] = href.split("#");
  const [path, query = ""] = pathAndQuery.split("?");
  let best: { key: string; value: string } | null = null;
  for (const pair of query.split("&")) {
    const [key, value] = pair.split("=");
    if (!key || value === undefined || value.includes("${")) continue;
    if (!stateKindForKey(key) || !keysReadByPage.has(key)) continue;
    if (!best || KEY_PRIORITY.indexOf(key) < KEY_PRIORITY.indexOf(best.key)) best = { key, value: safeDecode(value) };
  }
  return best ? { path, stateKey: best.key, stateValue: best.value, hash } : { path, hash };
}

/** A malformed percent-escape in a target repo is their bug, not a reason to abort the whole ingest. */
function safeDecode(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

export function stateScreenId(routeId: string, key: string, value: string): string {
  return `${routeId}?${key}=${value}`;
}

export function humanize(value: string): string {
  const words = value.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function makeStateScreen(routeId: string, key: string, value: string, filePath: string): ScreenNode {
  const kind = stateKindForKey(key) ?? "modal";
  const label = kind === "wizard-step" ? `Step ${humanize(value)}` : kind === "tab" ? `${humanize(value)} tab` : `${humanize(value)} ${key === "filter" ? "drawer" : key}`;
  return { id: stateScreenId(routeId, key, value), kind, parentScreenId: routeId, label, filePath };
}

/** State Screen for an overlay toggled by a `useState` boolean: id is route + '#' + kebab(component). */
export function makeLocalOverlayScreen(routeId: string, componentName: string, filePath: string): ScreenNode {
  const kebab = componentName.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  return { id: `${routeId}#${kebab}`, kind: "modal", parentScreenId: routeId, label: humanize(kebab), filePath };
}
