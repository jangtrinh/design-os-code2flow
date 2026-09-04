/**
 * CanonicalFlowGraph — the single contract between every Ingestor Adapter
 * (src/parser) and the viewer (src/viewer). See ADR-0002, ADR-0005, ADR-0006.
 * Story data is NOT here; it lives in the Story Manifest (code2flow.stories.json).
 */

/** Route Screen = URL route; State Screen = modal/drawer, tab, or wizard step nested under a route. */
export type ScreenKind = "route" | "modal" | "tab" | "wizard-step" | "tooltip" | "popover" | "dropdown";

/** Transition Confidence tier per ADR-0005. */
export type Confidence = "high" | "medium" | "low";

/** Where an edge originates: a specific screen, or the app shell shared by all screens. */
export type EdgeScope = "screen" | "shell";

export interface SourceEvidence {
  file: string; // path relative to repo root
  line: number;
  snippet?: string;
}

export interface ScreenNode {
  id: string; // route path ("/iam/users/[id]") or route + state query ("/iam/users/[id]?drawer=edit-roles")
  kind: ScreenKind;
  parentScreenId?: string; // State Screens only
  label?: string; // human label for State Screens (e.g. "Edit roles drawer")
  title?: string; // detected page title for Route Screens
  filePath: string; // page.tsx that owns this screen (relative to repo root)
  dynamic?: boolean; // contains [param]
  catchAll?: boolean; // contains [...param]
  routeAsModal?: boolean; // page renders its content inside an always-open Dialog
  /** CSS selector for the Action Trigger that opens this hover State Screen during capture. */
  hoverTriggerSelector?: string;
}

export interface ActionEdge {
  id: string;
  source: string; // ScreenNode id, or "shell" when scope === "shell"
  target: string; // ScreenNode id, "not-found", "external:<url>", "missing:<path>" (no such route), or "dynamic:<expr>"
  trigger: string; // e.g. 'Button: Pay Now'
  triggerKind?: "click" | "hover";
  confidence: Confidence;
  pattern: string; // detection heuristic name, used by the recall harness
  evidence: SourceEvidence;
  scope: EdgeScope;
  resolved: boolean; // false when target is external/runtime-only
  component?: string; // React component that owns the Action Trigger (or receives the href prop)
  href?: string; // the href as resolved from source (concrete URL when it had no runtime parts), for samples and the drawer
}

/** Per-file counters for anything the adapter saw but did not turn into a screen or edge. */
export type Counters = Record<string, Record<string, number>>;

export interface CanonicalFlowGraph {
  version: 1;
  /** adapter id, e.g. "nextjs-app-router", "static-html", "react-router" */
  framework: string;
  rootDir: string;
  screens: ScreenNode[];
  edges: ActionEdge[];
  counters: Counters;
}
