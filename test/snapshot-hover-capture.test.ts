import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSnapshot } from "../src/snapshot/snapshot-runner.js";
import { shotFiles } from "../src/snapshot/shot-file-key.js";
import { startStaticApp } from "./helpers/static-app-server.js";

let app: Awaited<ReturnType<typeof startStaticApp>>; const root = mkdtempSync(join(tmpdir(), "code2flow-hover-shot-"));
beforeAll(async () => { app = await startStaticApp(); }); afterAll(() => { app.server.close(); rmSync(root, { recursive: true, force: true }); });
describe("snapshot → hover State Screen capture (seam)", () => {
  it("hovers the stored trigger and waits for the overlay before taking the shot", async () => {
    const graph = { version: 1 as const, framework: "test", rootDir: root, counters: {}, edges: [], screens: [{ id: "/hover", kind: "route" as const, filePath: "x" }, { id: "/hover#hover-tooltip-help", kind: "tooltip" as const, parentScreenId: "/hover", filePath: "x", hoverTriggerSelector: '[data-testid="help-tip"]' }] };
    await runSnapshot(root, graph, { samples: {}, needsSample: [] }, { capture: { baseWidth: 800, baseHeight: 600, capWidth: 1200, capHeight: 1200, quality: 65 } }, { serverUrl: app.url });
    expect(existsSync(shotFiles(join(root, ".code2flow", "shots"), "/hover#hover-tooltip-help").full)).toBe(true);
  }, 30000);
});
