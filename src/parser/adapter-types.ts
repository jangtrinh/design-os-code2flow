import type { CanonicalFlowGraph, ScreenNode } from "../schema/index.js";

/** Concrete-path → route-screen-id resolver every adapter provides, so route samples and url maps stay framework-agnostic. */
export interface RouteResolver {
  screens: ScreenNode[];
  /** "/users/alice" or "/users/[id]" → "/users/[id]"; null when no route matches. */
  resolve(path: string): string | null;
}

export interface IngestResult { graph: CanonicalFlowGraph; resolver: RouteResolver }

/**
 * A pluggable Codebase Ingestor (ADR-0002). `detect` is cheap and side-effect free; `ingest` does the work.
 * Screen ids follow one convention for every adapter: route path with `[param]` / `[...rest]` segments,
 * State Screens as `<route>?key=value` or `<route>#local-overlay`.
 */
export interface IngestorAdapter<D = unknown> {
  id: string;
  label: string;
  detect(rootDir: string): D | null;
  ingest(rootDir: string, detected: D): Promise<IngestResult>;
}
