import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/schema/code2flow-config.js";
import type { CanonicalFlowGraph } from "../src/schema/index.js";
import { isLoopbackUrl, isSameOriginPath, isStageMessage } from "../src/schema/stage-bridge-protocol.js";
import { loadManifest, textOf, validateManifest, type StoryManifest } from "../src/schema/story-manifest.js";

const graph = { version: 1, framework: "static-html", rootDir: "/x", counters: {}, screens: [{ id: "/", kind: "route", filePath: "index.html" }, { id: "/orders", kind: "route", filePath: "orders.html" }], edges: [{ id: "e1", source: "/", target: "/orders", trigger: "Link: Orders", confidence: "high", pattern: "a-href", evidence: { file: "index.html", line: 1 }, scope: "screen", resolved: true }] } as CanonicalFlowGraph;

describe("stage bridge protocol (ADR-0008 §4)", () => {
  it("accepts only loopback http(s) URLs", () => {
    for (const ok of ["http://127.0.0.1:3000", "http://localhost:5173/", "https://[::1]:8443/app"]) expect(isLoopbackUrl(ok), ok).toBe(true);
    for (const bad of ["https://example.com", "http://10.0.0.5:3000", "http://127.0.0.1.nip.io:3000", "file:///etc/passwd", "javascript:alert(1)", "http://user:pw@127.0.0.1:3000", "not a url"]) expect(isLoopbackUrl(bad), bad).toBe(false);
  });
  it("accepts only same-origin paths for navigate", () => {
    expect(isSameOriginPath("/orders?tab=archived#x")).toBe(true);
    for (const bad of ["javascript:alert(1)", "//evil.test/x", "https://x.test/", "orders", "/\\evil.test", "/a\nb"]) expect(isSameOriginPath(bad), bad).toBe(false);
  });
  it("shape-checks messages and rejects look-alikes", () => {
    expect(isStageMessage({ c2f: 1, type: "navigate", id: 3, path: "/x" })).toBe(true);
    expect(isStageMessage({ c2f: 1, type: "scroll", x: 1, y: 2, dx: 0, dy: Infinity })).toBe(false);
    expect(isStageMessage({ c2f: 2, type: "hello" })).toBe(false);
    expect(isStageMessage({ c2f: 1, type: "eval", code: "1" })).toBe(false);
    expect(isStageMessage("hello")).toBe(false);
  });
});

describe("config stage block", () => {
  const withConfig = (cfg: unknown): (() => unknown) => () => { const dir = mkdtempSync(join(tmpdir(), "c2f-stage-cfg-")); try { writeFileSync(join(dir, "code2flow.config.json"), JSON.stringify(cfg)); return loadConfig(dir); } finally { rmSync(dir, { recursive: true, force: true }); } };
  it("rejects a remote live URL with a one-line reason", () => {
    expect(withConfig({ stage: { url: "https://staging.example.com" } })).toThrow(/must be an http\(s\) URL on 127\.0\.0\.1/);
    expect(withConfig({ stage: { localeParam: "lang&x=1" } })).toThrow(/localeParam/);
  });
  it("keeps a loopback stage block", () => {
    expect((withConfig({ stage: { url: "http://127.0.0.1:4310", frameQuery: { review: "0" }, localeParam: "lang" } })() as { stage: unknown }).stage).toEqual({ url: "http://127.0.0.1:4310", frameQuery: { review: "0" }, localeParam: "lang" });
  });
});

describe("Story Manifest v3 (additive)", () => {
  it("textOf picks the locale, then the default, then any", () => {
    expect(textOf({ en: "Orders", vi: "Đơn hàng" }, "vi", ["en", "vi"])).toBe("Đơn hàng");
    expect(textOf({ en: "Orders" }, "vi", ["en", "vi"])).toBe("Orders");
    expect(textOf("Orders", "vi")).toBe("Orders");
    expect(textOf(undefined)).toBe("");
  });
  it("loads v3 fields and keeps v2 files unchanged", () => {
    const dir = mkdtempSync(join(tmpdir(), "c2f-stage-man-"));
    try {
      writeFileSync(join(dir, "code2flow.stories.json"), JSON.stringify({ version: 3, locales: ["en", "vi"], names: { "/": { en: "Home", vi: "Trang chủ" } }, stories: [{ id: "s", title: { en: "Buy", vi: "Mua" }, entry: "/", steps: [{ screen: "/", caption: { en: "Start", vi: "Bắt đầu" } }, "/orders"] }] }));
      const m = loadManifest(dir)!; expect(m.version).toBe(3); expect(m.locales).toEqual(["en", "vi"]); expect(m.stories[0].screens).toEqual(["/", "/orders"]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("warns on missing locales, unknown names, duplicate names and a via that reads like a cue", () => {
    const m: StoryManifest = { version: 3, locales: ["en", "vi"], names: { "/": { en: "Home", vi: "Trang chủ" }, "/ghost": "Ghost", "/orders": { text: { en: "home", vi: "x" }, source: "doc" } }, stories: [{ id: "s", title: "Buy", entry: "/", screens: [], steps: [{ screen: "/" }, { screen: "/orders", via: "Click the Orders link in the header.", caption: { en: "Orders" } }] }] };
    const msgs = validateManifest(m, graph).map((i) => i.message);
    expect(msgs).toContain('names["/ghost"]: unknown screen (not in graph.json)');
    expect(msgs).toContain('names["/ghost"]: no vi text');
    expect(msgs).toContain("title: no vi text");
    expect(msgs).toContain("steps[1].caption: no vi text");
    expect(msgs.some((x) => x.startsWith('names["/orders"] and names["/"] show the same name'))).toBe(true);
    expect(msgs.some((x) => x.includes("reads like a sentence"))).toBe(true);
  });
  it("adds nothing to a v2 manifest's validate output", () => {
    const m: StoryManifest = { version: 2, stories: [{ id: "s", title: "Buy", entry: "/", screens: ["/", "/orders"], steps: ["/", { screen: "/orders", via: "Orders" }] }] };
    expect(validateManifest(m, graph)).toEqual([]);
  });
});
