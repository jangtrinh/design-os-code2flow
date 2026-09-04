import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { main } from "../src/cli/index.js";
import { scanCommand } from "../src/cli/scan-command.js";
import { shotFiles } from "../src/snapshot/shot-file-key.js";
import { buildViewer } from "../scripts/build-viewer.js";
import { copyFixture } from "./helpers/fixture-copy.js";

const fx = copyFixture("render"); const DATA = join(fx.dir, ".code2flow");
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64");
const manifest = { version: 2, features: [{ id: "shop", title: "Shop", match: ["/**"] }], stories: [{ id: "buy", title: "Buy", entry: "/", screens: ["/", "/pricing"], steps: ["/", "/pricing"] }] };

function command(argv: string[]): Promise<number> { return main(argv); }
beforeAll(async () => {
  const viewerDir = join(DATA, "test-viewer"); await buildViewer(viewerDir); await scanCommand(fx.dir, () => {});
  mkdirSync(join(DATA, "shots"), { recursive: true }); writeFileSync(shotFiles(join(DATA, "shots"), "/").full, JPEG);
  writeFileSync(join(DATA, "shots-meta.json"), JSON.stringify({ "/": { width: 1440, height: 900 } })); writeFileSync(join(fx.dir, "code2flow.stories.json"), JSON.stringify(manifest));
  // The CLI's normal viewer path is intentionally not built by this test; export is prepared from an isolated bundle.
  const { exportCommand } = await import("../src/cli/export-command.js"); await exportCommand(fx.dir, viewerDir, {}, () => {});
}, 60_000);
afterAll(() => fx.cleanup());

describe("render PNG/PDF hand-outs", () => {
  it("writes the map, feature, story and print document", async () => {
    expect(await command(["render", fx.dir, "--scale", "2"])).toBe(0);
    const out = join(DATA, "render"); const product = fx.dir.split("/").at(-1)!;
    for (const file of [`${product}-map.png`, `${product}-shop.png`, `${product}-shop-buy.png`]) {
      const image = readFileSync(join(out, file)); expect(image.length).toBeGreaterThan(5_000); expect(image.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    }
    const story = readFileSync(join(out, `${product}-shop-buy.png`));
    expect(story.readUInt32BE(16)).toBeGreaterThanOrEqual(1200 * 2); // 1,200 CSS px at the requested 2× PNG scale.
    const pdf = readFileSync(join(out, `${product}-flows.pdf`)); expect(pdf.length).toBeGreaterThan(10_000); expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const summary = JSON.parse(readFileSync(join(out, "render-summary.json"), "utf8"));
    expect(summary.views).toHaveLength(3);
    expect(summary.views.every((view: { chromeHidden?: boolean }) => view.chromeHidden === true)).toBe(true);
  }, 60_000);
  it("returns usage for an unknown story", async () => { expect(await command(["render", fx.dir, "--story", "nope"])).toBe(2); });
});
