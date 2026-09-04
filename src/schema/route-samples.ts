import type { Counters } from "./canonical-flow-graph.js";

/**
 * Concrete URLs that reach each dynamic route, so `snapshot` has something real to open.
 * Lives in the schema layer: produced by an adapter, consumed by the framework-agnostic snapshot step (ADR-0002).
 */
export interface RouteSamples {
  /** route id → concrete URLs, in discovery order (code literals first, then config, then anchors found on captured pages) */
  samples: Record<string, string[]>;
  /** dynamic routes with no sample from any source */
  needsSample: string[];
}

/** Increments `counters[file][name]`: the one way anything seen-but-not-emitted is recorded. */
export function bump(counters: Counters, file: string, name: string): void {
  counters[file] ??= {};
  counters[file][name] = (counters[file][name] ?? 0) + 1;
}
