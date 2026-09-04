import { describe, expect, it } from "vitest";
import { ingest } from "../src/parser/ingest.js";

import { fileURLToPath } from "node:url";
const FIXTURE = fileURLToPath(new URL("../fixtures/synthetic/app-router-basic", import.meta.url));
const key = (e: { source: string; target: string }) => `${e.source} -> ${e.target}`;

describe("ingest → high-tier edges (seam)", () => {
  it("emits literal Link, form, router.push, notFound and external/missing targets", async () => {
    const graph = await ingest(FIXTURE);
    const keys = graph.edges.map(key);
    expect(keys).toContain("/ -> /pricing");
    expect(keys).toContain("/ -> /blog/[slug]");
    expect(keys).toContain("/ -> not-found");
    expect(keys).toContain("/ -> external:https://example.com");
    expect(keys).toContain("/ -> missing:/nowhere");
    expect(keys).toContain("/pricing -> /docs/[...parts]");
    const pricing = graph.edges.find((e) => key(e) === "/ -> /pricing")!;
    expect(pricing.trigger).toBe("Button: See pricing");
    expect(pricing.confidence).toBe("high");
    expect(pricing.evidence.file).toBe("app/page.tsx");
    expect(graph.edges.find((e) => key(e) === "/pricing -> /docs/[...parts]")?.trigger).toBe("Button: Checkout");
  });
  it("counts hash anchors and self-loop redirects instead of drawing them", async () => {
    const graph = await ingest(FIXTURE);
    expect(graph.counters["app/page.tsx"]).toEqual({ "anchor-hash": 1, normalizations: 1, "parse-cache-hit": 1 }); // buildScreenIndex reuses collectScreenFiles' parse of the page file (round-8 perf item 2)
    expect(graph.edges.some((e) => e.target === "/" && e.source === "/")).toBe(false);
  });
});
