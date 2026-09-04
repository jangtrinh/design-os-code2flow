import { featureIdFor } from "../schema/feature-match.js";
import type { ScreenNode } from "../schema/index.js";
import type { Feature, Story, StoryStep, ViewerData, ViewState } from "./types.js";

export const DISMISS = /cancel|close|dismiss|back|✕|^Dialog|^Drawer|^Sheet/i;
export const RANK = { high: 3, medium: 2, low: 1 } as const;

/** Module-level context: set once by `initData`, read by every view. */
export let D: ViewerData;
export const byId = new Map<string, ScreenNode>();
export let routes: ScreenNode[] = [];
export let states: ScreenNode[] = [];
export const shellTargets = new Set<string>();
export const featById: Record<string, Feature> = {};

export const state: ViewState = { level: "map", feature: null, story: null, mode: "inspect", selected: null, step: 0, showDismiss: false, showTray: false };

export function initData(data: ViewerData): void {
  D = data;
  byId.clear(); for (const s of data.graph.screens) byId.set(s.id, s);
  routes = data.graph.screens.filter((s) => s.kind === "route");
  states = data.graph.screens.filter((s) => s.kind !== "route");
  shellTargets.clear(); for (const e of data.graph.edges) if (e.scope === "shell") shellTargets.add(e.target);
  for (const k of Object.keys(featById)) delete featById[k];
  for (const f of data.features) featById[f.id] = f;
  // v2 stories may name `steps`/`branches` and omit `screens`; every view (rail, present, drop targets) reads `screens`.
  for (const st of data.stories) if (!st.screens || !st.screens.length) st.screens = deriveStoryScreens(st);
}

/** Every screen id named anywhere in a story: the main path plus every branch (round-1 finding: navigation.ts:19 crashed on a `screens`-less v2 story). */
function deriveStoryScreens(st: Story): string[] {
  const ids = new Set<string>();
  for (const s of normalizeSteps(st.steps ?? [])) ids.add(s.screen);
  for (const b of st.branches ?? []) { ids.add(b.from); for (const s of normalizeSteps(b.steps)) ids.add(s.screen); }
  return [...ids];
}

/** Default features when the config declares none: top URL segment, plus `access` (sign-in-like) and `account` (root, settings, notifications). */
export function defaultFeatures(routeIds: string[]): Feature[] {
  const segs = [...new Set(routeIds.map((r) => r.split("/")[1]).filter(Boolean))].sort();
  const access = routeIds.filter((r) => /sign-?in|log-?in|welcome|launchpad|403|404|onboard/i.test(r));
  const account = routeIds.filter((r) => r === "/" || /^\/(settings|notifications|profile|account)(\/|$)/.test(r));
  const out: Feature[] = [];
  if (access.length) out.push({ id: "access", title: "Access", match: access, order: 0 });
  segs.forEach((s, i) => { if (!/^(settings|notifications|profile|account)$/.test(s)) out.push({ id: s, title: humanize("/" + s), match: [`/${s}/**`], order: i + 1 }); });
  if (account.length) out.push({ id: "account", title: "Account & shell", match: [...new Set(account)], order: 99 });
  return out;
}

export function routeOf(id: string): string | null { const s = byId.get(id); return s ? s.parentScreenId ?? s.id : null; }
/**
 * Uses the shared `featureIdFor` (schema/feature-match.ts) for pattern matching, then a viewer-only
 * safety net: `featureIdFor`'s segment fallback can name a feature id nothing registered (a config
 * that declares features not covering every route). Every map/inspect view buckets routes by
 * `featureOf(id) === f.id` for `f` in `D.features`, so an unregistered id would silently drop the
 * route from the canvas — proven by a test in test/hardening-wave-2.test.ts.
 */
export function featureOf(id: string): string {
  const r = routeOf(id) ?? id;
  const guess = featureIdFor(r, D.features);
  if (D.features.some((f) => f.id === guess)) return guess;
  return D.features.find((f) => f.id === "account")?.id ?? D.features[0]?.id ?? "app";
}
export function storiesOf(routeId: string): Story[] { return D.stories.filter((s) => s.screens.some((id) => routeOf(id) === routeId)); }
export function storyFeature(st: Story): string { return st.feature ?? featureOf(st.entry); }
/** Normalised chain: v2 `steps` (main path) or, for v1, `screens` in manifest order. */
export function normalizeSteps(steps: (string | StoryStep)[]): StoryStep[] { return steps.map((s) => (typeof s === "string" ? { screen: s } : s)); }
export function storyPath(st: Story): StoryStep[] { return normalizeSteps(st.steps?.length ? st.steps : st.screens); }

export function humanize(id: string): string { const seg = id.split("/").filter(Boolean).pop() ?? "home"; return seg.replace(/[-_[\].]+/g, " ").replace(/^\w/, (c) => c.toUpperCase()); }
export function routeTitle(id: string): string { const t = D.titles[id]; return t?.h1 || byId.get(id)?.title || humanize(id); }
export function realTitle(id: string): string {
  const t = D.titles[id] ?? { h1: "", dialogTitle: "", activeTab: "" };
  const s = byId.get(id);
  if (!s || s.kind === "route") return t.h1 || s?.title || humanize(id);
  if (t.dialogTitle) return t.dialogTitle;
  if (s.kind === "tab" && t.activeTab) return t.activeTab.replace(/\s*\d+$/, "");
  return (s.label ?? "").replace(/ (modal|drawer|tab)$/i, "") || s.kind;
}
export function textW(s: string, glyph: number): number { return s.length * glyph; }
export function fitText(s: string, maxW: number, glyph: number): string { const n = Math.floor(maxW / glyph); return s.length <= n ? s : n > 1 ? s.slice(0, Math.max(1, n - 1)) + "…" : "…"; }
const HTML_ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** Safe in text AND attribute positions (drawer chips interpolate confidence into class=""). */
export function escapeHtml(s: unknown): string { return String(s ?? "").replace(/[&<>"']/g, (c) => HTML_ESC[c]); }
