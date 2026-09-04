import { describe, expect, it } from "vitest";
import { ingest } from "../src/parser/ingest.js";
import { buildRouteRegistry } from "../src/parser/nextjs-app-router/route-registry.js";

import { fileURLToPath } from "node:url";
const FIXTURE = fileURLToPath(new URL("../fixtures/synthetic/app-router-basic", import.meta.url));

describe("ingest → route screens (seam)", () => {
  it("maps page files to route ids, strips groups, skips api and parallel slots", async () => {
    const graph = await ingest(FIXTURE);
    expect(graph.screens.filter((s) => s.kind === "route").map((s) => s.id)).toEqual(["/", "/[bracket", "/about", "/blog/[slug]", "/docs/[...parts]", "/edge-cases", "/orders", "/pricing", "/products", "/signup", "/team", "/team/settings", "/wizard"]);
    expect(graph.screens.find((s) => s.id === "/blog/[slug]")?.dynamic).toBe(true);
    expect(graph.screens.find((s) => s.id === "/docs/[...parts]")?.catchAll).toBe(true);
  });
  it("resolves concrete paths to parametric routes, preferring the most static match", () => {
    const reg = buildRouteRegistry(FIXTURE, FIXTURE + "/app");
    expect(reg.resolve("/blog/hello-world?x=1")).toBe("/blog/[slug]");
    expect(reg.resolve("/docs/a/b/c")).toBe("/docs/[...parts]");
    expect(reg.resolve("/pricing/")).toBe("/pricing");
    expect(reg.resolve("/nope")).toBeNull();
  });
  it("rejects a directory without a supported framework, including an invalid package.json", async () => {
    await expect(ingest(fileURLToPath(new URL("../fixtures/synthetic/not-a-next-app", import.meta.url)))).rejects.toThrow(/No compatible routes/);
    await expect(ingest(fileURLToPath(new URL("../fixtures/synthetic/bad-package-json", import.meta.url)))).rejects.toThrow(/No compatible routes/);
  });
});
