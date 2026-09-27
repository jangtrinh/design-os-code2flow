import type { CanonicalFlowGraph } from "../schema/index.js";
import { audienceName } from "./audience-names.js";
import { D, featById, featureOf, storyFeature, storyPath, state } from "./data-model.js";
import { t } from "./stage-strings.js";
import type { Story } from "./types.js";

export const WALK_PREFIX = "walk:";
const RANK = { high: 0, medium: 1, low: 2 } as const;

/**
 * A feature walk (ADR-0008 §1): the feature's Route Screens in the order a user reaches them — breadth-first over
 * detected screen edges from the entry, higher confidence first — each followed by its State Screens. Parts the entry
 * does not reach are walked the same way from their least-reached route, so every screen appears exactly once. Pure.
 */
export function featureWalk(graph: CanonicalFlowGraph, inFeature: (id: string) => boolean, entryHint?: string): string[] {
  const routes = graph.screens.filter((s) => s.kind === "route" && inFeature(s.id)).map((s) => s.id);
  const routeSet = new Set(routes); const parentOf = new Map(graph.screens.map((s) => [s.id, s.parentScreenId ?? s.id]));
  const edges = graph.edges.filter((e) => e.scope === "screen" && routeSet.has(parentOf.get(e.source) ?? "") && routeSet.has(parentOf.get(e.target) ?? ""))
    .map((e) => ({ from: parentOf.get(e.source)!, to: parentOf.get(e.target)!, rank: RANK[e.confidence] })).filter((e) => e.from !== e.to);
  const inbound = new Map(routes.map((r) => [r, 0])); for (const e of edges) inbound.set(e.to, (inbound.get(e.to) ?? 0) + 1);
  const byReach = [...routes].sort((a, b) => inbound.get(a)! - inbound.get(b)! || a.localeCompare(b));
  const order: string[] = []; const seen = new Set<string>();
  const walkFrom = (start: string): void => {
    const queue = [start];
    while (queue.length) {
      const r = queue.shift()!; if (seen.has(r)) continue; seen.add(r); order.push(r);
      for (const e of edges.filter((x) => x.from === r).sort((a, b) => a.rank - b.rank || a.to.localeCompare(b.to))) if (!seen.has(e.to)) queue.push(e.to);
    }
  };
  if (entryHint && routeSet.has(entryHint)) walkFrom(entryHint);
  for (const r of byReach) if (!seen.has(r)) walkFrom(r); // another part of the feature: start where nothing leads in
  const states = (r: string): string[] => graph.screens.filter((s) => s.parentScreenId === r).map((s) => s.id);
  return order.flatMap((r) => [r, ...states(r)]);
}

const walkCache = new WeakMap<object, Map<string, string[]>>(); // per loaded data set: the walk is pure over D
/** The walk of one feature as a Story the Stage can play; the entry is the first story entry of the feature, if any. */
export function walkStory(featureId: string): Story {
  let byFeature = walkCache.get(D); if (!byFeature) { byFeature = new Map(); walkCache.set(D, byFeature); }
  let ids = byFeature.get(featureId);
  if (!ids) { const stories = D.stories.filter((s) => storyFeature(s) === featureId); ids = featureWalk(D.graph, (id) => featureOf(id) === featureId, stories[0]?.entry); byFeature.set(featureId, ids); }
  const title = `${audienceName(featureId) ?? featById[featureId]?.title ?? featureId} · ${t("allScreens")}`;
  return { id: WALK_PREFIX + featureId, title, feature: featureId, entry: ids[0] ?? "", screens: ids, steps: ids };
}

/** The story Play shows for the current state: the selected (or first) authored story, or the feature walk. */
export function playStory(): Story | undefined {
  const feature = state.feature; if (!feature) return undefined;
  if (state.story?.startsWith(WALK_PREFIX)) return walkStory(feature);
  const stories = D.stories.filter((s) => storyFeature(s) === feature);
  return stories.find((s) => s.id === (state.story ?? stories[0]?.id)) ?? (stories.length ? undefined : walkStory(feature));
}

/** Where ⌘K should present a screen: the current story when it holds the screen, else its feature walk. */
export function stageTargetFor(screenId: string): { feature: string; story: string; step: number } {
  const feature = featureOf(screenId); const current = playStory();
  const story = current && state.feature === feature && storyPath(current).some((p) => p.screen === screenId) ? current : walkStory(feature);
  return { feature, story: story.id, step: Math.max(0, storyPath(story).findIndex((p) => p.screen === screenId)) };
}

/* ---------- progress: the last step per story, per browser ---------- */
const PROGRESS = "c2f-stage-progress";
const readProgress = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(PROGRESS) ?? "{}") as Record<string, number>; } catch { return {}; } };
export function rememberStep(storyId: string, step: number): void { try { localStorage.setItem(PROGRESS, JSON.stringify({ ...readProgress(), [storyId]: step })); } catch { /* storage blocked: no resume, no error */ } }
export function resumeStep(storyId: string): number { const n = readProgress()[storyId]; return Number.isInteger(n) && n >= 0 ? n : 0; }
