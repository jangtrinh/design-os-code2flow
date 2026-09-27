import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CanonicalFlowGraph } from "./canonical-flow-graph.js";
import { assertValidFeatureIds, type FeatureConfig } from "./code2flow-config.js";
import { nameText, textOf, type NameValue, type Text } from "./audience-text.js";

export { nameText, textOf, type NameValue, type Text };

/**
 * Story Manifest (ADR-0006, v2 per ADR-0007, v3 per ADR-0008). v1/v2 files stay valid: every v3 field is optional.
 * v3 adds audience copy for the Stage: `locales`, `names` (Audience Names), and per-step `title`/`caption`/`note`/`cue`.
 */
export interface StoryStep {
  screen: string;
  /** Action Trigger label matched against detected edges (ADR-0006) — never free prose. */
  via?: string;
  /** audience name of this step inside this story */
  title?: Text;
  /** one line under the frame, for the audience */
  caption?: Text;
  /** presenter-only: what to point at and why */
  note?: Text;
  /** presenter-only: what to do or say to arrive here */
  cue?: Text;
}
export interface StoryBranch { title: string; from: string; steps: (string | StoryStep)[] }
export interface Story {
  id: string; title: Text; description?: Text; source?: string; entry: string; screens: string[]; acceptance?: string[];
  feature?: string; order?: number; steps?: (string | StoryStep)[]; branches?: StoryBranch[]; exit?: string[];
}
export interface StoryManifest { version: 1 | 2 | 3; note?: string; locales?: string[]; names?: Record<string, NameValue>; features?: FeatureConfig[]; stories: Story[] }

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
  const version = raw.version === 3 ? 3 : raw.version === 2 ? 2 : 1;
  return { version, note: raw.note, locales: Array.isArray(raw.locales) && raw.locales.length ? raw.locales : undefined, names: raw.names, features: raw.features, stories };
}

export interface ManifestIssue { story: string; level: "error" | "warn"; message: string }

/**
 * Validates a manifest against the graph: unknown screen ids, entries outside their story, and (v2)
 * consecutive steps with no detected transition — the PRD-vs-code drift signal. Nothing is auto-deleted.
 */
export function validateManifest(m: StoryManifest, graph: CanonicalFlowGraph, knownFeatures: readonly string[] = []): ManifestIssue[] {
  const ids = new Set(graph.screens.map((s) => s.id)); const issues: ManifestIssue[] = [];
  // A story whose `feature` names no feature id is unreachable in the viewer (its hash is ignored); only a caller that knows the features can tell.
  const featureIds = new Set([...knownFeatures, ...(m.features ?? []).map((f) => f.id)]);
  const hasEdge = (a: string, b: string, via?: string): boolean => graph.edges.some((e) => e.scope === "screen" && e.source === a && e.target === b && (!via || e.trigger.toLowerCase().includes(via.toLowerCase())));
  const seen = new Set<string>();
  for (const st of m.stories) {
    if (!st.id || !st.title) issues.push({ story: st.id ?? "?", level: "error", message: "story needs id and title" });
    if (seen.has(st.id)) issues.push({ story: st.id, level: "error", message: "duplicate story id" }); seen.add(st.id);
    if (st.feature && featureIds.size && !featureIds.has(st.feature)) issues.push({ story: st.id, level: "warn", message: `feature "${st.feature}" is not a feature id (code2flow.config.json or this manifest): the story is unreachable in the viewer` });
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
  issues.push(...validateAudienceCopy(m, graph));
  return issues;
}

const LOOKS_LIKE_PROSE = /[.!?:"“”]\s|[.!?]$/;
/** v3 audience copy (ADR-0008 §2): every Text in every locale, names that point at something, `via` that is a label. All warnings. */
function validateAudienceCopy(m: StoryManifest, graph: CanonicalFlowGraph): ManifestIssue[] {
  const issues: ManifestIssue[] = []; const locales = m.locales ?? [];
  // A plain string is default-locale text only; an object must name every locale.
  const missing = (t: Text | undefined): string[] => (t == null || locales.length < 2 ? [] : typeof t === "string" ? locales.slice(1) : locales.filter((l) => typeof t[l] !== "string" || !t[l]));
  const check = (story: string, where: string, t: Text | undefined): void => { const gone = missing(t); if (gone.length) issues.push({ story, level: "warn", message: `${where}: no ${gone.join(", ")} text` }); };
  const screens = new Set(graph.screens.map((s) => s.id)); const features = new Set([...(m.features ?? []).map((f) => f.id)]);
  const seenNames = new Map<string, string>();
  for (const [key, value] of Object.entries(m.names ?? {})) {
    // Feature ids may also come from code2flow.config.json or the default top-segment features: only a manifest that lists features can prove a key wrong.
    if (!key.startsWith("/") && m.features?.length && !features.has(key)) issues.push({ story: "names", level: "warn", message: `names["${key}"] is neither a screen id nor a feature id in this manifest` });
    else if (key.startsWith("/") && !screens.has(key)) issues.push({ story: "names", level: "warn", message: `names["${key}"]: unknown screen (not in graph.json)` });
    check("names", `names["${key}"]`, nameText(value));
    const shown = textOf(nameText(value), locales[0]).trim().toLowerCase();
    if (shown && seenNames.has(shown)) issues.push({ story: "names", level: "warn", message: `names["${key}"] and names["${seenNames.get(shown)}"] show the same name "${textOf(nameText(value), locales[0])}"` });
    else if (shown) seenNames.set(shown, key);
  }
  for (const st of m.stories) {
    if (m.version !== 3 && (st.steps ?? []).some((s) => typeof s === "object" && (s.note || s.cue || s.caption))) issues.push({ story: st.id, level: "warn", message: "steps carry v3 fields (caption/note/cue): set \"version\": 3" });
    check(st.id, "title", st.title); check(st.id, "description", st.description);
    for (const [i, s] of (st.steps ?? []).entries()) {
      if (typeof s !== "object") continue;
      for (const k of ["title", "caption", "note", "cue"] as const) check(st.id, `steps[${i}].${k}`, s[k]);
      if (m.version === 3 && s.via && (s.via.length > 60 || LOOKS_LIKE_PROSE.test(s.via))) issues.push({ story: st.id, level: "warn", message: `steps[${i}].via "${s.via.slice(0, 40)}…" reads like a sentence: via is the Action Trigger label; put directions in "cue"` });
    }
  }
  return issues;
}
