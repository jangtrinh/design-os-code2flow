import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { scanCommand } from "../src/cli/scan-command.js";
import { featureIdFor } from "../src/schema/index.js";
import { defaultFeatures } from "../src/viewer/data-model.js";

// A next-intl app: every route sits under [locale]; a decorative component takes a `to` prop that is not a path.
const SOURCE = fileURLToPath(new URL("../fixtures/synthetic/app-router-locale", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "code2flow-locale-"));
cpSync(SOURCE, dir, { recursive: true });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("locale samples and prop path shape (seam: scan → .code2flow files)", () => {
  it("fills [locale] with the next-intl default locale and ignores non-path `to` props", async () => {
    const r = await scanCommand(dir, () => {});
    const samples = JSON.parse(readFileSync(join(r.outDir, "route-samples.json"), "utf8"));
    expect(samples.samples["/[locale]"]).toEqual(["/vi"]);
    expect(samples.samples["/[locale]/about"]).toEqual(["/vi/about"]); // the unprefixed literal /about#team is sampled WITH the locale prefix
    expect(samples.needsSample).toEqual([]);
    const graph = JSON.parse(readFileSync(join(r.outDir, "graph.json"), "utf8"));
    expect(graph.counters["src/i18n/routing.ts"]["locale-default-from-routing"]).toBe(1);
    expect(graph.counters["route-samples"]["locale-sample-inferred"]).toBe(1); // /[locale]/about already had the literal /vi/about; only /[locale] needed the locale
    expect(graph.counters["app/[locale]/page.tsx"]["prop-value-not-a-path"]).toBe(1); // `to="brand-cream"` is a colour token, counted, never a broken link
    expect(graph.edges.some((e: { target: string }) => /brand/.test(e.target))).toBe(false);
    expect(graph.edges.some((e: { source: string; target: string }) => e.source === "/[locale]" && e.target === "/[locale]/about")).toBe(true);
    // links written without the locale prefix (next-intl `localePrefix: "as-needed"`) still resolve to the [locale] route
    expect(graph.edges.some((e: { source: string; target: string; href?: string }) => e.href === "/about#team" && e.target === "/[locale]/about")).toBe(true);
    expect(graph.edges.some((e: { target: string }) => e.target.startsWith("missing:"))).toBe(false);
  });

  it("derives features past a leading [locale] segment", () => {
    const features = defaultFeatures(["/[locale]", "/[locale]/kien-thuc", "/[locale]/kien-thuc/xoai", "/[locale]/bang-gia", "/[locale]/[product]"]);
    expect(features.map((f) => f.id)).toEqual(expect.arrayContaining(["kien-thuc", "bang-gia", "account"]));
    expect(features.map((f) => f.id)).not.toContain("locale");
    expect(features.find((f) => f.id === "product")?.title).toBe("Product"); // a dynamic top segment names its feature without brackets
    expect(featureIdFor("/[locale]/[product]", features)).toBe("product");
    expect(featureIdFor("/[locale]/kien-thuc/xoai", features)).toBe("kien-thuc");
    expect(featureIdFor("/[locale]", features)).toBe("account"); // the localized root is the home screen
  });
});
