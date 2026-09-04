import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CanonicalFlowGraph } from "./canonical-flow-graph.js";
import { assertValidFeatureIds, type FeatureConfig } from "./code2flow-config.js";

/** Story Manifest (ADR-0006, v2 per ADR-0007). v1 files stay valid: `features`, `steps`, `branches`, `exit` are optional. */
export interface StoryStep { screen: string; via?: string }
export interface StoryBranch { title: string; from: string; steps: (string | StoryStep)[] }
export interface Story {
  id: string; title: string; source?: string; entry: string; screens: string[]; acceptance?: string[];
  feature?: string; order?: number; steps?: (string | StoryStep)[]; branches?: StoryBranch[]; exit?: string[];
}
export interface StoryManifest { version: 1 | 2; note?: string; features?: FeatureConfig[]; stories: Story[] }

export const MANIFEST_FILE = "code2flow.stories.json";

const stepScreen = (s: string | StoryStep): string | undefined => (typeof s === "string" ? s : s?.screen);
/** `screens` when given, else every screen named by `steps` and `branches` (v2 authors often omit the list). */
export function storyScreens(st: Story): string[] {
  if (Array.isArray(st.screens) && st.screens.length) return st.screens;
  const out: string[] = [];
  for (const s of st.steps ?? []) { const id = stepScreen(s); if (id && !out.includes(id)) out.push(id); }
  for (const b of st.branches ?? []) for (const s of [b.from, ...(b.steps ?? [])]) { const id = stepScreen(s); if (id && !out.includes(id)) out.push(id); }
  return out;
}

export function loadManifest(rootDir: string): StoryManifest | null {
  const f = join(rootDir, MANIFEST_FILE);
  if (!existsSync(f)) return null;
  const raw = JSON.parse(readFileSync(f, "utf8")) as Partial<StoryManifest>;
  if (!Array.isArray(raw.stories)) throw new Error(`${MANIFEST_FILE}: "stories" must be an array`);
  assertValidFeatureIds(raw.features, MANIFEST_FILE);
  const stories = (raw.stories as Story[]).map((st) => ({ ...st, screens: storyScreens(st) }));
  return { version: raw.version === 2 ? 2 : 1, note: raw.note, features: raw.features, stories };
}

export interface ManifestIssue { story: string; level: "error" | "warn"; message: string }

/**
 * Validates a manifest against the graph: unknown screen ids, entries outside their story, and (v2)
 * consecutive steps with no detected transition — the PRD-vs-code drift signal. Nothing is auto-deleted.
 */
export function validateManifest(m: StoryManifest, graph: CanonicalFlowGraph): ManifestIssue[] {
  const ids = new Set(graph.screens.map((s) => s.id)); const issues: ManifestIssue[] = [];
  const hasEdge = (a: string, b: string, via?: string): boolean => graph.edges.some((e) => e.scope === "screen" && e.source === a && e.target === b && (!via || e.trigger.toLowerCase().includes(via.toLowerCase())));
  const seen = new Set<string>();
  for (const st of m.stories) {
    if (!st.id || !st.title) issues.push({ story: st.id ?? "?", level: "error", message: "story needs id and title" });
    if (seen.has(st.id)) issues.push({ story: st.id, level: "error", message: "duplicate story id" }); seen.add(st.id);
    const screens = storyScreens(st);
    if (!screens.length) issues.push({ story: st.id, level: "error", message: "screens must be a non-empty array (or name them in steps/branches)" });
    for (const [i, s] of (st.steps ?? []).entries()) if (!stepScreen(s)) issues.push({ story: st.id, level: "error", message: `steps[${i}] needs a "screen" id (route path such as /products/[slug]?tab=pricing)` });
    for (const [bi, b] of (st.branches ?? []).entries()) { if (!b.from) issues.push({ story: st.id, level: "error", message: `branches[${bi}] needs "from"` }); for (const [i, s] of (b.steps ?? []).entries()) if (!stepScreen(s)) issues.push({ story: st.id, level: "error", message: `branches[${bi}].steps[${i}] needs a "screen" id` }); }
    for (const id of screens) if (!ids.has(id)) issues.push({ story: st.id, level: "warn", message: `unknown screen ${id} (not in graph.json)` });
    if (st.entry && !ids.has(st.entry)) issues.push({ story: st.id, level: "warn", message: `entry ${st.entry} is not a screen` });
    else if (st.entry && !screens.includes(st.entry)) issues.push({ story: st.id, level: "warn", message: `entry ${st.entry} is not listed in screens` });
    const chains: { title: string; steps: (string | StoryStep)[] }[] = [];
    if (st.steps?.length) chains.push({ title: "main path", steps: st.steps });
    for (const [bi, b] of (st.branches ?? []).entries()) chains.push({ title: `branch "${b.title ?? "#" + (bi + 1)}"`, steps: [b.from, ...(b.steps ?? [])].filter((x) => stepScreen(x)) });
    for (const c of chains) {
      const norm = c.steps.map((s) => (typeof s === "string" ? { screen: s } : s));
      for (let i = 1; i < norm.length; i++) {
        const a = norm[i - 1].screen, b = norm[i].screen;
        const knownBoth = ids.has(a) && ids.has(b);
        if (knownBoth && hasEdge(a, b, norm[i].via)) continue;
        // An unknown endpoint already gets its own "unknown screen" warning above; this one still fires
        // (suffixed) so a ghost step is never silently skipped — "nothing vanishes silently".
        issues.push({ story: st.id, level: "warn", message: `${c.title}: no detected transition ${a} → ${b}${norm[i].via ? ` via "${norm[i].via}"` : ""} (PRD asserts it, code does not)${knownBoth ? "" : " (endpoint not in graph)"}` });
      }
    }
  }
  return issues;
}
