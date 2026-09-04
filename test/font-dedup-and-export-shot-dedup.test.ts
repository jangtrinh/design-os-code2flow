import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exportCommand } from "../src/cli/export-command.js";
import { scanCommand } from "../src/cli/scan-command.js";
import { shotFiles } from "../src/snapshot/shot-file-key.js";
import { inlineFontFaces, buildViewer } from "../scripts/build-viewer.js";
import { copyFixture } from "./helpers/fixture-copy.js";

describe("inlineFontFaces dedupes byte-identical woff2 files across weights (round-8 perf item 5)", () => {
  it("emits each distinct font payload once as a CSS variable, referenced by every @font-face that needs it", () => {
    const css = inlineFontFaces();
    // one @font-face rule per (family, weight, subset) entry in the manifest — unchanged surface
    const faceCount = [...css.matchAll(/@font-face\{/g)].length;
    expect(faceCount).toBe(10);
    // but the base64 payload for a given byte sequence appears exactly once (Inter 400/500/600 latin are identical bytes)
    const b64Occurrences = new Map<string, number>();
    for (const m of css.matchAll(/base64,([A-Za-z0-9+/=]{200,})\)/g)) b64Occurrences.set(m[1], (b64Occurrences.get(m[1]) ?? 0) + 1);
    expect(b64Occurrences.size).toBeGreaterThan(0);
    expect([...b64Occurrences.values()].every((n) => n === 1)).toBe(true);
    // Inter 400/500/600 (latin) are byte-identical on disk: only 4 distinct payloads ship for the 10 manifest entries.
    expect(b64Occurrences.size).toBe(4);
    // every @font-face still resolves its src through a var(), not a bare url() (each unique payload is embedded once, in :root)
    expect([...css.matchAll(/src:([^;}]+)/g)].every(([, src]) => /^var\(--f\d+\)$/.test(src))).toBe(true);
  });
});

describe("export dedupes byte-identical screenshots (round-8 perf item 1)", () => {
  it("embeds a JPEG shared by two screens once, and both screens still resolve to it", async () => {
    const fx = copyFixture("export-shot-dedup");
    try {
      const viewerDir = await buildViewer(join(fx.dir, ".code2flow", "test-viewer"));
      await scanCommand(fx.dir, () => {});
      const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64");
      const shotsDir = join(fx.dir, ".code2flow", "shots"); mkdirSync(shotsDir, { recursive: true });
      // "/" and "/pricing" are given the exact same bytes: a byte-identical shot shared by two screens.
      writeFileSync(shotFiles(shotsDir, "/").full, jpeg); writeFileSync(shotFiles(shotsDir, "/pricing").full, jpeg);
      const [html] = await exportCommand(fx.dir, viewerDir, {}, () => {});
      const { readFileSync } = await import("node:fs");
      const doc = readFileSync(html, "utf8");
      const b64 = jpeg.toString("base64");
      expect(doc.split(b64).length - 1).toBe(1); // embedded once, not once per screen
      const shotsScript = /<script id="c2f-shots"[^>]*>(.*?)<\/script>/s.exec(doc)![1];
      const shots = JSON.parse(shotsScript) as { full: Record<string, string>; blobs: Record<string, string> };
      expect(shots.full["/"]).toBeDefined(); expect(shots.full["/pricing"]).toBeDefined();
      expect(shots.full["/"]).toBe(shots.full["/pricing"]); // same content hash
      expect(shots.blobs[shots.full["/"]]).toBe("data:image/jpeg;base64," + b64); // both resolve to the one embedded blob
    } finally { fx.cleanup(); }
  }, 30000);
});
