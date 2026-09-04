import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { loadConfig } from "../schema/code2flow-config.js";
import { featureIdFor } from "../schema/feature-match.js";
import { loadManifest, type Story } from "../schema/story-manifest.js";
import type { CanonicalFlowGraph } from "../schema/index.js";

export interface RenderView { id: string; title: string; hash: string; file: string }

const safe = (value: string): string => value.replace(/[^A-Za-z0-9._-]/g, "-");

/** Enumerates exactly the map, feature, and story routes the exported viewer understands. */
export function renderViews(rootDir: string, flags: Record<string, string | true>): RenderView[] {
  const graph = JSON.parse(readFileSync(join(rootDir, ".code2flow", "graph.json"), "utf8")) as CanonicalFlowGraph;
  const config = loadConfig(rootDir); const manifest = loadManifest(rootDir);
  const features = manifest?.features ?? config.features ?? [];
  const routeOf = (id: string): string => graph.screens.find((screen) => screen.id === id)?.parentScreenId ?? id;
  const featureOf = (id: string): string => featureIdFor(routeOf(id), features);
  const ids = [...new Set(graph.screens.map((screen) => featureOf(screen.id)))];
  const wantedFeature = typeof flags.feature === "string" ? flags.feature : undefined;
  const wantedStory = typeof flags.story === "string" ? flags.story : undefined;
  if (wantedFeature && !ids.includes(wantedFeature)) throw new RenderUsageError(`unknown --feature "${wantedFeature}"; valid feature ids: ${ids.join(", ")}`);
  const stories = manifest?.stories ?? [];
  if (wantedStory && !stories.some((story) => story.id === wantedStory)) throw new RenderUsageError(`unknown --story "${wantedStory}"; valid story ids: ${stories.map((story) => story.id).join(", ") || "(none)"}`);
  const product = basename(rootDir); const selectedFeatures = wantedFeature ? [wantedFeature] : ids;
  const views: RenderView[] = wantedFeature || wantedStory ? [] : [{ id: "map", title: `${product} map`, hash: "#map", file: `${safe(product)}-map.png` }];
  for (const feature of selectedFeatures) views.push({ id: `feature:${feature}`, title: feature, hash: `#f/${encodeURIComponent(feature)}`, file: `${safe(product)}-${safe(feature)}.png` });
  const selectedStories = stories.filter((story) => (!wantedStory || story.id === wantedStory) && (!wantedFeature || storyFeature(story, featureOf) === wantedFeature));
  for (const story of selectedStories) {
    const feature = storyFeature(story, featureOf);
    // Present lanes give hand-outs their story ordering; omit a step so no frame is focused or dimmed.
    views.push({ id: `story:${story.id}`, title: story.title, hash: `#f/${encodeURIComponent(feature)}/s/${encodeURIComponent(story.id)}/present`, file: `${safe(product)}-${safe(feature)}-${safe(story.id)}.png` });
  }
  return views;
}

function storyFeature(story: Story, fallback: (entry: string) => string): string { return story.feature ?? fallback(story.entry); }
export class RenderUsageError extends Error {}
