import type { CanonicalFlowGraph, RouteSamples, ScreenNode } from "../schema/index.js";

export type Severity = "error" | "warn" | "info";
export interface LintFinding { rule: string; severity: Severity; screen: string; feature: string; message: string; evidence?: string }
export interface LintReport { findings: LintFinding[]; byFeature: Record<string, { error: number; warn: number; info: number }>; totals: { error: number; warn: number; info: number } }

export interface LintInputs {
  graph: CanonicalFlowGraph;
  samples?: RouteSamples;
  /** screen id → capture meta; a route missing here was not captured */
  meta?: Record<string, unknown>;
  /** story entries are allowed to have no inbound edge */
  storyEntries?: string[];
  /** route id → feature id (defaults to the top URL segment) */
  featureOf?: (routeId: string) => string;
}

const DISMISS = /cancel|close|dismiss|back|✕|^Dialog|^Drawer|^Sheet/i;

/**
 * The "flow linter": what a PO or CI should act on, derived only from the graph and capture outputs.
 * Every rule names the screen and the reason; nothing is hidden by severity.
 */
export function lintFlow(input: LintInputs): LintReport {
  const { graph } = input;
  const featureOf = input.featureOf ?? ((id: string) => id.split("/")[1] || "account");
  const routes = graph.screens.filter((s) => s.kind === "route");
  const routeOf = (id: string): string => graph.screens.find((s) => s.id === id)?.parentScreenId ?? id;
  const entries = new Set(input.storyEntries ?? []);
  const findings: LintFinding[] = [];
  const add = (rule: string, severity: Severity, screen: ScreenNode | string, message: string, evidence?: string): void => {
    const id = typeof screen === "string" ? screen : screen.id;
    findings.push({ rule, severity, screen: id, feature: featureOf(routeOf(id)), message, evidence });
  };
  const screenEdges = graph.edges.filter((e) => e.scope === "screen");
  const inbound = new Map<string, number>(); const outbound = new Map<string, number>(); const inplace = new Map<string, number>();
  for (const e of screenEdges) {
    const s = routeOf(e.source), t = routeOf(e.target);
    if (s === t) { if (e.source === e.target) inplace.set(s, (inplace.get(s) ?? 0) + 1); continue; }
    outbound.set(s, (outbound.get(s) ?? 0) + 1);
    if (!/^(not-found|external:|dynamic:|missing:)/.test(e.target)) inbound.set(t, (inbound.get(t) ?? 0) + 1);
  }
  const shellTargets = new Set(graph.edges.filter((e) => e.scope === "shell").map((e) => e.target));
  for (const r of routes) {
    const isEntry = entries.has(r.id) || r.id === "/" || /sign-?in|log-?in|welcome|launchpad|404|403/i.test(r.id);
    if (!inbound.get(r.id) && !shellTargets.has(r.id) && !isEntry) add("orphan-screen", "warn", r, "no transition reaches this screen and it is not in the sidebar", r.filePath);
    if (!outbound.get(r.id) && !inplace.get(r.id) && !/404|403|not-found/i.test(r.id)) add("dead-end", "info", r, "no transition leaves this screen (no button, link or form leads anywhere)", r.filePath);
    if (input.meta && !(r.id in input.meta)) add("not-captured", "info", r, "no screenshot (no URL, or capture failed)");
  }
  for (const e of screenEdges) {
    if (e.target.startsWith("missing:")) add("broken-link", "error", e.source, `"${e.trigger}" links to ${e.target.slice(8)}, which is not a route`, `${e.evidence.file}:${e.evidence.line}`);
    if (e.confidence === "low" && !DISMISS.test(e.trigger)) add("low-confidence", "info", e.source, `"${e.trigger}" → ${e.target} needs review (${e.pattern})`, `${e.evidence.file}:${e.evidence.line}`);
  }
  for (const id of input.samples?.needsSample ?? []) add("needs-sample", "warn", id, "dynamic route with no concrete URL: add it to code2flow.config.json routeExamples");
  for (const [file, c] of Object.entries(graph.counters)) {
    if (c["login-redirect"]) add("login-gated", "warn", file, `${c["login-redirect"]} screen(s) redirected to a sign-in page during capture: pass --storage-state`);
    if (c["capture-failed"]) add("capture-failed", "warn", file, `${c["capture-failed"]} capture(s) failed`);
  }
  findings.sort((a, b) => rank(a.severity) - rank(b.severity) || a.feature.localeCompare(b.feature) || a.screen.localeCompare(b.screen));
  const byFeature: LintReport["byFeature"] = {}; const totals = { error: 0, warn: 0, info: 0 };
  for (const f of findings) { (byFeature[f.feature] ??= { error: 0, warn: 0, info: 0 })[f.severity]++; totals[f.severity]++; }
  return { findings, byFeature, totals };
}

function rank(s: Severity): number { return s === "error" ? 0 : s === "warn" ? 1 : 2; }

export function formatLintReport(r: LintReport): string {
  const lines: string[] = [];
  for (const f of r.findings) lines.push(`  ${f.severity.padEnd(5)} ${f.rule.padEnd(15)} ${f.screen}  ${f.message}${f.evidence ? `  (${f.evidence})` : ""}`);
  const feats = Object.entries(r.byFeature).map(([k, v]) => `${k}: ${v.error}E/${v.warn}W/${v.info}I`).join(" · ");
  lines.push(`lint  ${r.totals.error} error(s), ${r.totals.warn} warning(s), ${r.totals.info} info  ${feats ? "· " + feats : ""}`);
  return lines.join("\n");
}
