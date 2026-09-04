import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { staticHtmlAdapter } from "../src/parser/static-html/adapter.js";

const fixture = fileURLToPath(
  new URL("../fixtures/synthetic/static-site", import.meta.url),
);

describe("static HTML adapter", () => {
  it("emits the static-site contract with fully evidenced literal edges", async () => {
    const detected = staticHtmlAdapter.detect(fixture)!;
    const { graph } = await staticHtmlAdapter.ingest(fixture, detected);
    expect(graph.screens.map(({ id, kind }) => ({ id, kind }))).toEqual([
      { id: "/", kind: "route" },
      { id: "/#help", kind: "modal" },
      { id: "/about", kind: "route" },
      { id: "/contact", kind: "route" },
      { id: "/docs", kind: "route" },
      { id: "/pricing", kind: "route" },
      { id: "/pricing?tab=monthly", kind: "tab" },
      { id: "/team", kind: "route" },
    ]);
    expect(
      graph.edges.map(
        ({ source, target, trigger, confidence, evidence, scope }) => ({
          source,
          target,
          trigger,
          confidence,
          evidence,
          scope,
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        {
          source: "shell",
          target: "/docs",
          trigger: "Nav: Docs",
          confidence: "high",
          evidence: { file: "about.html", line: 1 },
          scope: "shell",
        },
        {
          source: "/",
          target: "/pricing",
          trigger: "Link: Pricing",
          confidence: "high",
          evidence: { file: "index.html", line: 2 },
          scope: "screen",
        },
        {
          source: "/",
          target: "/#help",
          trigger: "Link: Help",
          confidence: "high",
          evidence: { file: "index.html", line: 4 },
          scope: "screen",
        },
        {
          source: "/about",
          target: "/contact",
          trigger: "Form: Contact",
          confidence: "high",
          evidence: { file: "about.html", line: 2 },
          scope: "screen",
        },
        {
          source: "/contact",
          target: "/contact",
          trigger: "script navigation",
          confidence: "high",
          evidence: { file: "contact.html", line: 3 },
          scope: "screen",
        },
        {
          source: "/pricing",
          target: "/pricing?tab=monthly",
          trigger: "Link: Monthly",
          confidence: "high",
          evidence: { file: "pricing.html", line: 2 },
          scope: "screen",
        },
        {
          source: "/pricing",
          target: "missing:/gone",
          trigger: "Link: Gone",
          confidence: "high",
          evidence: { file: "pricing.html", line: 3 },
          scope: "screen",
        },
        {
          source: "/pricing",
          target: "external:https://example.test/pricing",
          trigger: "Link: External pricing",
          confidence: "high",
          evidence: { file: "pricing.html", line: 4 },
          scope: "screen",
        },
        {
          source: "/",
          target: "external:mailto:hello@example.test",
          trigger: "Link: Email us",
          confidence: "high",
          evidence: { file: "index.html", line: 3 },
          scope: "screen",
        },
      ]),
    );
    expect(graph.edges.filter((edge) => edge.scope === "shell")).toHaveLength(
      1,
    );
    expect(graph.counters).toMatchObject({
      "index.html": { "mailto-link": 1 },
      "pricing.html": { "external-link": 1 },
    });
  });

  it("resolves trailing slashes and rejects framework package roots", async () => {
    const { resolver } = await staticHtmlAdapter.ingest(
      fixture,
      staticHtmlAdapter.detect(fixture)!,
    );
    expect(resolver.resolve("/docs/")).toBe("/docs");
    expect(
      staticHtmlAdapter.detect("fixtures/synthetic/app-router-basic"),
    ).toBeNull();
    expect(
      staticHtmlAdapter.detect("fixtures/synthetic/react-router-app"),
    ).toBeNull();
  });
});
