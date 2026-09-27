import { describe, expect, it } from "vitest";
import type { CanonicalFlowGraph } from "../src/schema/index.js";
import { featureWalk } from "../src/viewer/feature-walk.js";

const edge = (source: string, target: string, confidence: "high" | "medium" | "low" = "high") => ({ id: `${source}>${target}`, source, target, trigger: "Link", confidence, pattern: "p", evidence: { file: "f", line: 1 }, scope: "screen" as const, resolved: true });
const graph = (routes: string[], states: [string, string][], edges: ReturnType<typeof edge>[]): CanonicalFlowGraph => ({ version: 1, framework: "x", rootDir: "/", counters: {}, edges,
  screens: [...routes.map((id) => ({ id, kind: "route" as const, filePath: "f" })), ...states.map(([id, parent]) => ({ id, kind: "modal" as const, parentScreenId: parent, filePath: "f" }))] });

describe("featureWalk: the order a user reaches a feature's screens", () => {
  it("walks breadth-first from the entry, high confidence first, each route followed by its states", () => {
    const g = graph(["/a", "/b", "/c", "/d"], [["/b?modal=x", "/b"]], [edge("/a", "/c", "low"), edge("/a", "/b", "high"), edge("/b", "/d"), edge("/b?modal=x", "/d")]);
    expect(featureWalk(g, () => true, "/a")).toEqual(["/a", "/b", "/b?modal=x", "/c", "/d"]);
  });
  it("starts from the least-reached route without a hint, and walks each unreached part in flow order", () => {
    const g = graph(["/start", "/home", "/z", "/lost"], [], [edge("/start", "/home"), edge("/home", "/z"), edge("/z", "/home")]);
    expect(featureWalk(g, () => true)).toEqual(["/lost", "/start", "/home", "/z"]); // /lost and /start both have 0 inbound edges; ties break by id
    expect(featureWalk(g, () => true, "/home")).toEqual(["/home", "/z", "/lost", "/start"]);
  });
  it("keeps only the feature's screens and lists each exactly once", () => {
    const g = graph(["/shop", "/shop/cart", "/admin"], [], [edge("/shop", "/admin"), edge("/shop", "/shop/cart"), edge("/shop/cart", "/shop")]);
    const walk = featureWalk(g, (id) => id.startsWith("/shop"), "/shop");
    expect(walk).toEqual(["/shop", "/shop/cart"]); expect(new Set(walk).size).toBe(walk.length);
  });
});
