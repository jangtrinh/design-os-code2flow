import { describe, expect, it } from "vitest";
import { ingest } from "../src/parser/ingest.js";

import { fileURLToPath } from "node:url";
const FIXTURE = fileURLToPath(new URL("../fixtures/synthetic/app-router-basic", import.meta.url));
const key = (e: { source: string; target: string }) => `${e.source} -> ${e.target}`;

describe("ingest → shell navigation, wizard steps, function-param passthrough (seam)", () => {
  it("emits shell edges once from components most pages render, resolving nav data arrays", async () => {
    const graph = await ingest(FIXTURE);
    const shell = graph.edges.filter((e) => e.scope === "shell");
    expect(shell.map((e) => e.target).sort()).toEqual(["/", "/about", "/orders", "/pricing", "/team", "/team/settings", "/wizard"]);
    expect(shell.find((e) => e.target === "/orders")?.trigger).toBe("Nav: Orders");
    expect(graph.counters["components/shell/nav-items.ts"]?.["shell-empty-href"]).toBe(1);
    expect(graph.edges.filter((e) => e.scope === "screen" && e.target === "/pricing" && e.evidence.file.includes("shell"))).toHaveLength(0);
  });
  it("discovers wizard steps from the page's step comparisons and links to them via URLSearchParams.set", async () => {
    const graph = await ingest(FIXTURE);
    const steps = graph.screens.filter((s) => s.parentScreenId === "/wizard" && s.kind === "wizard-step").map((s) => s.id).sort();
    expect(steps).toEqual(["/wizard?step=details", "/wizard?step=review"]);
    const keys = graph.edges.map(key);
    expect(keys).toContain("/wizard -> /wizard?step=details");
    expect(keys).toContain("/wizard -> /wizard?step=review");
  });
  it("follows an href builder passed as a function argument into a non-component helper", async () => {
    const graph = await ingest(FIXTURE);
    const e = graph.edges.find((x) => key(x) === "/team -> /team?drawer=edit");
    expect(e?.confidence).toBe("medium");
    expect(e?.trigger).toBe("Link: Edit");
  });
});
