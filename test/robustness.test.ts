import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ingest } from "../src/parser/ingest.js";

const FIXTURE = fileURLToPath(new URL("../fixtures/synthetic/app-router-basic", import.meta.url));
const key = (e: { source: string; target: string }) => `${e.source} -> ${e.target}`;

describe("ingest → robustness against real-world target repos (seam)", () => {
  it("survives malformed percent-escapes, directory barrel imports, and bracket directory names", async () => {
    const graph = await ingest(FIXTURE); // would throw URIError / EISDIR / RegExp SyntaxError before the fix
    const keys = graph.edges.map(key);
    expect(keys).toContain("/edge-cases -> /edge-cases?tab=50%");
    expect(keys).toContain("/edge-cases -> /edge-cases?tab=%E0%A4%A");
    expect(graph.screens.some((s) => s.id === "/[bracket")).toBe(true);
  });
  it("produces identical edge ids across two ingest() calls in one process", async () => {
    const a = await ingest(FIXTURE);
    const b = await ingest(FIXTURE);
    expect(a.edges.map((e) => e.id)).toEqual(b.edges.map((e) => e.id));
    expect(a.edges[0]?.id).toBe("e1");
  });
  it("keeps distinct triggers to the same screen and counts every merged duplicate", async () => {
    const graph = await ingest(FIXTURE);
    const merged = Object.values(graph.counters).reduce((n, c) => n + (c["merged-prop-href-duplicate"] ?? 0) + (c["merged-identical-edge"] ?? 0), 0);
    expect(merged).toBeGreaterThan(0); // /orders: prop-href closeHref + inner router.push(closeHref)
    const toOrders = graph.edges.filter((e) => e.scope === "screen" && e.target === "/orders").map((e) => e.trigger);
    expect(new Set(toOrders).size).toBe(toOrders.length);
    // the prop-href on <OrderDrawer closeHref> merges only because OrderDrawer itself pushes closeHref
    const close = graph.edges.find((e) => key(e) === "/orders?drawer=details -> /orders");
    expect(close?.component).toBe("OrderDrawer");
    expect(close?.pattern.startsWith("prop-href")).toBe(false);
  });
  it("populates page titles from `export const metadata` and leaves untitled pages undefined", async () => {
    const graph = await ingest(FIXTURE);
    expect(graph.screens.find((s) => s.id === "/pricing")?.title).toBe("Pricing plans");
    expect(graph.screens.find((s) => s.id === "/orders")?.title).toBeUndefined();
  });
  it("resolves TS-style `./x.js` import specifiers to the .ts source (medium tier, not dynamic)", async () => {
    const graph = await ingest(FIXTURE);
    const e = graph.edges.find((x) => key(x) === "/edge-cases -> /edge-cases?tab=50%");
    expect(e?.confidence).toBe("medium");
  });
});
