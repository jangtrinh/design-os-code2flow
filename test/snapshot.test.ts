import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scanCommand } from "../src/cli/scan-command.js";
import { snapshotCommand } from "../src/cli/snapshot-command.js";
import { shotFiles } from "../src/snapshot/shot-file-key.js";
import { copyFixture } from "./helpers/fixture-copy.js";
import { startStaticApp } from "./helpers/static-app-server.js";

const fx = copyFixture("snapshot"); const FIXTURE = fx.dir;
let app: Awaited<ReturnType<typeof startStaticApp>>;
beforeAll(async () => { app = await startStaticApp(); });
afterAll(() => { app.server.close(); fx.cleanup(); });

describe("code2flow snapshot (seam: CLI → .code2flow/shots + meta + titles)", () => {
  it("captures content-fit pages, dialog crops, real titles, and discovers dynamic-route samples from page links", async () => {
    await scanCommand(FIXTURE, () => {});
    const lines: string[] = [];
    const r = await snapshotCommand(FIXTURE, { url: app.url, concurrency: "2" }, (l) => lines.push(l));
    const meta = JSON.parse(readFileSync(join(r.outDir, "shots-meta.json"), "utf8"));
    const titles = JSON.parse(readFileSync(join(r.outDir, "titles.json"), "utf8"));
    expect(meta["/orders"].height).toBeGreaterThan(1400); // inner scroller grown to content
    expect(meta["/pricing"].height).toBeGreaterThan(1000); // content that mounts 900 ms after load (932 → ~1096) is waited for, not cut off
    expect(meta["/orders?drawer=details"].dialog.width).toBeGreaterThanOrEqual(420); expect(meta["/orders?drawer=details"].dialog.width).toBeLessThanOrEqual(424); // [role=dialog] crop (border included)
    expect(existsSync(shotFiles(join(r.outDir, "shots"), "/").full)).toBe(true); // named by a hash of the id, not by position
    expect(existsSync(shotFiles(join(r.outDir, "shots"), "/orders?drawer=details").dialog)).toBe(true);
    expect(titles["/orders"].h1).toBe("Orders");
    expect(titles["/orders?drawer=details"].dialogTitle).toBe("Order details");
    expect(titles["/orders?tab=archived"].activeTab).toBe("Open");
    const samples = JSON.parse(readFileSync(join(r.outDir, "route-samples.json"), "utf8"));
    expect(samples.samples["/blog/[slug]"]).toEqual(expect.arrayContaining(["/blog/first-post"])); // discovered on the home page, not in code
    expect(meta["/blog/[slug]"]).toBeDefined();
    const graph = JSON.parse(readFileSync(join(r.outDir, "graph.json"), "utf8"));
    expect(graph.counters.snapshot?.["no-url"]).toBe(1); // "/[bracket" still has no sample: counted
    expect(JSON.parse(readFileSync(join(r.outDir, "snapshot-run.json"), "utf8")).authenticated).toBe(false);
  }, 120000);
});
