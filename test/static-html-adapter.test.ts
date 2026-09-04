import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { staticHtmlAdapter } from "../src/parser/static-html/adapter.js";

const fixture = fileURLToPath(new URL("../fixtures/synthetic/static-site", import.meta.url));

describe("static HTML adapter", () => {
  it("emits routes, state screens, literal navigation, shell navigation, and missing links", async () => {
    const detected = staticHtmlAdapter.detect(fixture)!;
    const { graph } = await staticHtmlAdapter.ingest(fixture, detected);
    expect(graph.screens.map((screen) => screen.id)).toEqual(expect.arrayContaining(["/", "/docs", "/#help", "/pricing?tab=monthly"]));
    expect(graph.edges).toEqual(expect.arrayContaining([expect.objectContaining({ source: "/", target: "/pricing", scope: "screen" }), expect.objectContaining({ source: "/", target: "/#help" }), expect.objectContaining({ source: "shell", target: "/docs", scope: "shell" }), expect.objectContaining({ target: "missing:/gone" }), expect.objectContaining({ target: "/contact", pattern: "location-href-literal" })]));
  });
});
