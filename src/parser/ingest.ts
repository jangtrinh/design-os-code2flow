import { resolve } from "node:path";
import type { CanonicalFlowGraph } from "../schema/index.js";
import type { IngestorAdapter, IngestResult } from "./adapter-types.js";
import { nextjsAppRouterAdapter } from "./nextjs-app-router/adapter.js";

/** Adapters in detection order; the first whose `detect` returns non-null wins (ADR-0002). */
export const adapters: IngestorAdapter[] = [nextjsAppRouterAdapter as IngestorAdapter];

export function detectAdapter(rootDir: string): { adapter: IngestorAdapter; detected: unknown } | null {
  for (const adapter of adapters) { const detected = adapter.detect(rootDir); if (detected) return { adapter, detected }; }
  return null;
}

/** Public seam of the Codebase Ingestor: repo root in, graph + route resolver out. Throws when no adapter matches. */
export async function ingestDetailed(repoRoot: string): Promise<IngestResult & { adapter: IngestorAdapter }> {
  const rootDir = resolve(repoRoot);
  const hit = detectAdapter(rootDir);
  if (!hit) throw new Error(`No compatible routes detected in ${rootDir}. Supported: ${adapters.map((a) => a.label).join(", ")}.`);
  return { ...(await hit.adapter.ingest(rootDir, hit.detected)), adapter: hit.adapter };
}

export async function ingest(repoRoot: string): Promise<CanonicalFlowGraph> { return (await ingestDetailed(repoRoot)).graph; }
