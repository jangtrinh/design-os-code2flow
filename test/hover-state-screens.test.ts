import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { ingest } from "../src/parser/ingest.js";

const FIXTURE = fileURLToPath(new URL("../fixtures/synthetic/hover-states", import.meta.url));

describe("ingest → hover-opened State Screens (seam)", () => {
  it("emits Radix-style and literal mouse-enter overlays with hover Action Edges, while counting CSS-only reveal", async () => {
    const graph = await ingest(FIXTURE);
    const states = graph.screens.filter((screen) => screen.id.startsWith("/#hover-"));
    expect(states).toHaveLength(4);
    expect(states.map((screen) => screen.kind)).toEqual(expect.arrayContaining(["tooltip", "popover", "dropdown"]));
    expect(states.every((screen) => screen.hoverTriggerSelector?.startsWith("[data-testid="))).toBe(true);
    expect(graph.edges.filter((edge) => edge.triggerKind === "hover")).toHaveLength(4);
    expect(graph.edges.filter((edge) => edge.triggerKind === "hover").every((edge) => edge.confidence === "high")).toBe(true);
    expect(graph.counters["app/page.tsx"]?.["hover-trigger-unresolved"]).toBeGreaterThanOrEqual(1);
  });
});
