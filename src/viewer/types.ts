import type { ActionEdge, CanonicalFlowGraph, ScreenNode } from "../schema/index.js";
import type { NameValue, Text } from "../schema/audience-text.js";
import type { StageInfo } from "../schema/stage-bridge-protocol.js";

export type { NameValue, StageInfo, Text };

export interface ShotMeta { url: string; width: number; height: number; dialog?: { width: number; height: number } }
export interface ScreenTitles { h1: string; dialogTitle: string; activeTab: string; docTitle: string }
export interface Feature { id: string; title: string; match: string[]; order: number; /** title before Audience Names were applied */ baseTitle?: string }
/** v3 adds audience copy (ADR-0008): step title, caption (audience), note and cue (presenter-only). */
export interface StoryStep { screen: string; via?: string; title?: Text; caption?: Text; note?: Text; cue?: Text }
export interface StoryBranch { title: string; from: string; steps: (string | StoryStep)[] }
/** Story Manifest v2 story (schema/story-manifest.ts, duplicated here because that module imports node:fs). */
/** `title` is the current-locale string (set by the viewer); `titleText` keeps the manifest's localized value. */
export interface Story { id: string; title: string; titleText?: Text; description?: Text; feature?: string; order?: number; entry: string; screens: string[]; source?: string; acceptance?: string[]; steps?: (string | StoryStep)[]; branches?: StoryBranch[]; exit?: string[] }

/** Everything the viewer needs, loaded once from `.code2flow/` (serve) or inlined (export). */
export interface ViewerData {
  graph: CanonicalFlowGraph;
  meta: Record<string, ShotMeta>;
  titles: Record<string, ScreenTitles>;
  urls: Record<string, string | null>;
  stories: Story[];
  features: Feature[];
  /** image URL (or data URI) for a screen's full capture / dialog crop; null when not captured */
  shotUrl: (id: string) => string | null;
  dialogUrl: (id: string) => string | null;
  productName: string;
  /** Story Manifest v3: locales (first = default) and Audience Names keyed by feature id or screen id */
  locales?: string[];
  names?: Record<string, NameValue>;
  /** live app for the Stage; absent or `live: false` = captured (exports are always captured) */
  stage?: StageInfo;
}

export interface Bundle { source: string; target: string; edges: ActionEdge[]; primary: ActionEdge; confidence: ActionEdge["confidence"]; missing: boolean }
export interface Stub { id: string; kind: "portal" | "missing" | "not-found"; label: string; feature?: string; /** caption override, e.g. "MISSING SCREEN" for a story screen the code lacks */ caption?: string }
export interface FrameStats { inplace: number; intra: number; dismiss: number; sinks: Record<string, number>; low: number }

export type Selection = ScreenNode | Bundle | null;

export interface ViewState {
  level: "map" | "feature";
  feature: string | null;
  story: string | null;
  mode: "inspect" | "present" | "play";
  selected: Selection;
  step: number;
  playFocus: boolean;
  showDismiss: boolean;
  showTray: boolean;
}
