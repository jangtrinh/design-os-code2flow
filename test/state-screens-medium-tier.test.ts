import { describe, expect, it } from "vitest";
import { ingest } from "../src/parser/ingest.js";

import { fileURLToPath } from "node:url";
const FIXTURE = fileURLToPath(new URL("../fixtures/synthetic/app-router-basic", import.meta.url));
const key = (e: { source: string; target: string }) => `${e.source} -> ${e.target}`;

describe("ingest → query-param State Screens and medium tier (seam)", () => {
  it("creates tab and drawer State Screens from hrefs the page reads via searchParams", async () => {
    const graph = await ingest(FIXTURE);
    const ids = graph.screens.map((s) => s.id);
    expect(ids).toContain("/orders?tab=archived");
    expect(ids).toContain("/orders?drawer=details");
    expect(graph.screens.find((s) => s.id === "/orders?drawer=details")).toMatchObject({ kind: "modal", parentScreenId: "/orders" });
    expect(graph.screens.find((s) => s.id === "/orders?tab=archived")?.kind).toBe("tab");
  });
  it("resolves template+constant, helper call, and prop passthrough at medium confidence", async () => {
    const graph = await ingest(FIXTURE);
    const byKey = new Map(graph.edges.map((e) => [key(e), e]));
    expect(byKey.get("/orders -> /orders?tab=archived")?.confidence).toBe("medium");
    expect(byKey.get("/orders -> /orders?drawer=details")?.trigger).toBe("Button: Details");
    const close = byKey.get("/orders?drawer=details -> /orders");
    expect(close?.confidence).toBe("medium");
    expect(close?.pattern).toContain("prop-passthrough");
  });
  it("counts a helper-built self redirect as a normalization", async () => {
    const graph = await ingest(FIXTURE);
    expect(graph.counters["app/orders/page.tsx"]?.normalizations).toBe(1);
  });
});
