import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { reactRouterAdapter } from "../src/parser/react-router/adapter.js";

const fixture = fileURLToPath(new URL("../fixtures/synthetic/react-router-app", import.meta.url));
const key = (edge: { source: string; target: string }) => `${edge.source} -> ${edge.target}`;

describe("React Router adapter", () => {
  it("emits canonical nested routes and state screens", async () => {
    const detected = reactRouterAdapter.detect(fixture); expect(detected).not.toBeNull();
    const graph = (await reactRouterAdapter.ingest(fixture, detected!)).graph;
    expect(graph.screens.map((screen) => screen.id)).toEqual(["/", "/[...rest]", "/checkout", "/old-users", "/settings", "/settings?tab=billing", "/settings?tab=profile", "/thanks", "/users", "/users/[id]", "/users#invite-dialog"]);
  });

  it("keeps navigation evidence, resolver behavior, shell scope, and skipped history", async () => {
    const result = await reactRouterAdapter.ingest(fixture, reactRouterAdapter.detect(fixture)!);
    const graph = result.graph;
    expect(result.resolver.resolve("/users/alice")).toBe("/users/[id]");
    expect(graph.edges.map(key)).toEqual(expect.arrayContaining(["/ -> /users/[id]", "/users -> /users/[id]", "/users -> missing:/nowhere", "/checkout -> /thanks", "/old-users -> /users", "/users -> /users#invite-dialog", "shell -> /", "shell -> /users", "shell -> /settings"]));
    const dataLink = graph.edges.find((edge) => edge.pattern === "link-to-template")!;
    expect(dataLink).toMatchObject({ source: "/users", target: "/users/[id]", confidence: "medium", evidence: { file: "src/routes.tsx" } });
    for (const edge of graph.edges) { expect(edge.evidence.line).toBeGreaterThan(0); expect(["high", "medium"]).toContain(edge.confidence); }
    expect(graph.edges.filter((edge) => edge.scope === "shell")).toHaveLength(3);
    expect(graph.counters["src/routes.tsx"]["navigate-history-offset"]).toBe(1);
  });
});
