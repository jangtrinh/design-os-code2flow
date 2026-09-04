import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ingest } from "../src/parser/ingest.js";
import { reactRouterAdapter } from "../src/parser/react-router/adapter.js";
import { staticHtmlAdapter } from "../src/parser/static-html/adapter.js";
import { diffFlow } from "../src/lint/flow-diff.js";
import { lintFlow } from "../src/lint/flow-lint.js";
import type { CanonicalFlowGraph } from "../src/schema/index.js";

const FIXTURE = fileURLToPath(new URL("../fixtures/synthetic/app-router-basic", import.meta.url));
const STATIC_FIXTURE = fileURLToPath(new URL("../fixtures/synthetic/static-site", import.meta.url));
const ROUTER_FIXTURE = fileURLToPath(new URL("../fixtures/synthetic/react-router-app", import.meta.url));

describe("flow lint + diff (pure over CanonicalFlowGraph)", () => {
  it("reports broken links, orphans, dead-ends, needs-sample and low-confidence with evidence", async () => {
    const graph = await ingest(FIXTURE);
    const r = lintFlow({ graph, samples: { samples: {}, needsSample: ["/[bracket"] }, meta: { "/": 1 } });
    const rules = Object.fromEntries(r.findings.map((f) => [f.rule + ":" + f.screen, f]));
    expect(rules["broken-link:/"]?.severity).toBe("error"); // <Link href="/nowhere">
    expect(rules["broken-link:/"]?.evidence).toMatch(/app\/page\.tsx:\d+/);
    expect(rules["needs-sample:/[bracket"]?.severity).toBe("warn");
    expect(r.findings.some((f) => f.rule === "orphan-screen")).toBe(true); // /[bracket, /wizard … nothing links to them
    expect(r.findings.some((f) => f.rule === "dead-end")).toBe(true);
    expect(r.findings.some((f) => f.rule === "not-captured" && f.screen === "/orders")).toBe(true); // meta only has "/"
    expect(r.findings.some((f) => f.screen === "/docs/[...parts]" && (f.rule === "orphan-screen" || f.rule === "dead-end"))).toBe(false); // a catch-all is reached by unmatched URLs, never by a link
    expect(r.totals.error).toBe(1);
    expect(r.findings[0].severity).toBe("error"); // sorted by severity
  });
  it("diffs two scans: screens, edges, confidence, counters", async () => {
    const before = await ingest(FIXTURE);
    const after = JSON.parse(JSON.stringify(before)) as CanonicalFlowGraph;
    after.screens = after.screens.filter((s) => s.id !== "/team"); after.screens.push({ id: "/new-page", kind: "route", filePath: "app/new-page/page.tsx" });
    const e = after.edges.find((x) => x.source === "/" && x.target === "/pricing")!; e.confidence = "low";
    after.edges = after.edges.filter((x) => x.source !== "/team"); after.edges.push({ ...e, id: "x", source: "/new-page", target: "/", trigger: "Home", confidence: "high" });
    after.counters["app/new-page/page.tsx"] = { normalizations: 2 };
    const d = diffFlow(before, after);
    expect(d.screens).toEqual({ added: ["/new-page"], removed: ["/team"] });
    expect(d.edges.added).toContain("screen|/new-page -> /|Home");
    expect(d.edges.removed.some((k) => k.startsWith("screen|/team ->"))).toBe(true);
    expect(d.edges.confidenceChanged).toEqual([{ edge: expect.stringContaining("/ -> /pricing"), from: "high", to: "low" }]);
    expect(d.counters).toEqual(expect.arrayContaining([{ name: "normalizations", from: expect.any(Number), to: expect.any(Number) }]));
    expect(diffFlow(before, before).summary).toBe("screens +0 −0 · edges +0 −0 · confidence changed 0 · counters changed 0");
  });
  it("keeps fixture broken links as lint errors", async () => {
    const staticGraph = (await staticHtmlAdapter.ingest(STATIC_FIXTURE, staticHtmlAdapter.detect(STATIC_FIXTURE)!)).graph;
    const routerGraph = (await reactRouterAdapter.ingest(ROUTER_FIXTURE, reactRouterAdapter.detect(ROUTER_FIXTURE)!)).graph;
    expect(lintFlow({ graph: staticGraph }).findings.find((finding) => finding.rule === "broken-link")?.severity).toBe("error");
    expect(lintFlow({ graph: routerGraph }).findings.find((finding) => finding.rule === "broken-link")?.severity).toBe("error");
  });
});
