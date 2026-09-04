import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { staticHtmlAdapter } from "../src/parser/static-html/adapter.js";
import { scanHtmlTags } from "../src/parser/static-html/html-tag-scanner.js";

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
          trigger: "Button: Help",
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

  it("scans a 2 MB tag-dense document within two seconds", () => {
    const source = "<a href=\"/x\">x</a>\n".repeat(80_000);
    const started = performance.now();
    expect(scanHtmlTags(source)).toHaveLength(160_000);
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it("normalizes index and dot-segment links", async () => {
    const { graph } = await staticHtmlAdapter.ingest(fixture, staticHtmlAdapter.detect(fixture)!);
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "/docs", target: "/", href: "../index.html" }),
      expect.objectContaining({ source: "/docs", target: "/about", href: "/docs/../about" }),
    ]));
  });
});
