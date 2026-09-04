import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanCommand } from "../src/cli/scan-command.js";
import { copyFixture } from "./helpers/fixture-copy.js";

type CounterMap = Record<string, Record<string, number>>;
const totalOf = (counters: CounterMap, name: string): number => Object.values(counters).reduce((n, c) => n + (c[name] ?? 0), 0);

describe("parse memoisation per ingest (round-8 perf item 2)", () => {
  it("shares one parseSourceFile cache across collectScreenFiles + buildScreenIndex: hits recorded, graph unchanged", async () => {
    const fx = copyFixture("parse-cache");
    try {
      await scanCommand(fx.dir, () => {});
      const graphPath = join(fx.dir, ".code2flow", "graph.json");
      const first = readFileSync(graphPath, "utf8");
      const firstGraph = JSON.parse(first) as { counters: CounterMap };
      expect(totalOf(firstGraph.counters, "parse-cache-hit")).toBeGreaterThan(0);
      // Re-running ingest must produce a byte-identical graph: caching changes performance, never the result.
      await scanCommand(fx.dir, () => {});
      const second = readFileSync(graphPath, "utf8");
      expect(createHash("sha1").update(second).digest("hex")).toBe(createHash("sha1").update(first).digest("hex"));
    } finally { fx.cleanup(); }
  });
});

describe("symlinked source files never escape the repository (round-8 perf item 2 / M7 hardening)", () => {
  it("skips a symlinked file pointing outside the repo instead of reading and parsing it", async () => {
    const fx = copyFixture("symlink-escape");
    const outsideDir = mkdtempSync(join(tmpdir(), "code2flow-outside-"));
    try {
      const secretFile = join(outsideDir, "secret.tsx");
      writeFileSync(secretFile, 'export const SECRET_MARKER_TOKEN = "leak-me";\nexport default function Evil() { return null; }\n');
      symlinkSync(secretFile, join(fx.dir, "app", "products", "evil-link.tsx"));
      const result = await scanCommand(fx.dir, () => {});
      const graph = JSON.parse(readFileSync(join(fx.dir, ".code2flow", "graph.json"), "utf8")) as { counters: CounterMap; screens: { filePath: string }[] };
      expect(JSON.stringify(graph)).not.toContain("SECRET_MARKER_TOKEN"); // the symlink target's content was never read
      expect(graph.screens.some((s) => s.filePath.includes("evil-link"))).toBe(false); // never treated as owned source
      expect(totalOf(graph.counters, "symlink-skipped")).toBeGreaterThan(0); // but the skip itself is recorded, keyed by its (safe) repo-relative path
      expect(result.screens).toBeGreaterThan(0); // the rest of the app still ingests normally
    } finally { fx.cleanup(); rmSync(outsideDir, { recursive: true, force: true }); }
  });
});
