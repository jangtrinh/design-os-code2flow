import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportCommand } from "../src/cli/export-command.js";
import { scanCommand } from "../src/cli/scan-command.js";
import { storiesCommand } from "../src/cli/stories-command.js";
import { shotFiles } from "../src/snapshot/shot-file-key.js";
import { buildViewer } from "../scripts/build-viewer.js";
import { copyFixture } from "./helpers/fixture-copy.js";

const fx = copyFixture("export"); const FIXTURE = fx.dir; const DATA = join(FIXTURE, ".code2flow");
const HOSTILE_ID = "/x</script><img src=q onerror=alert(1)>"; // a directory name in the target repo ends up as a screen id
// smallest valid JPEG (1×1); export only needs a file to inline
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64");
let viewerDir: string;
beforeAll(async () => {
  viewerDir = await buildViewer();
  mkdirSync(join(FIXTURE, "app", HOSTILE_ID.slice(1)), { recursive: true }); writeFileSync(join(FIXTURE, "app", HOSTILE_ID.slice(1), "page.tsx"), "export default function P() { return <h1>x</h1>; }");
  await scanCommand(FIXTURE, () => {});
  mkdirSync(join(DATA, "shots"), { recursive: true });
  for (const id of ["/", HOSTILE_ID]) writeFileSync(shotFiles(join(DATA, "shots"), id).full, JPEG);
  writeFileSync(join(DATA, "shots-meta.json"), JSON.stringify({ "/": { url: "/", width: 1440, height: 900 }, [HOSTILE_ID]: { url: HOSTILE_ID, width: 1440, height: 900 } }));
  writeFileSync(join(DATA, "snapshot-run.json"), JSON.stringify({ at: "2026-09-03T00:00:00Z", serverUrl: "http://127.0.0.1:1", authenticated: true, captured: 2 }));
});
afterAll(() => fx.cleanup());

describe("code2flow export + stories (seam: CLI → files)", () => {
  it("exports one self-contained HTML with inlined viewer, fonts, data and screenshots; hostile ids cannot break out of the JSON block", async () => {
    const lines: string[] = [];
    const files = await exportCommand(FIXTURE, viewerDir, {}, (l) => lines.push(l));
    expect(files).toHaveLength(1);
    const html = readFileSync(files[0], "utf8");
    expect(html).toContain("window.CODE2FLOW_DATA");
    expect(html).toContain("data:image/jpeg;base64,");
    expect(html).toContain("data:font/woff2;base64,"); expect(html).not.toContain("fonts.googleapis.com"); // opens with zero network access
    expect(html).not.toContain('src="./viewer.js"');
    expect(html).not.toContain("</script><img src=q"); expect(html).toContain("\\u003c/script>\\u003cimg src=q"); // stored-XSS path from the shots JSON is closed
    expect(lines.join("\n")).toMatch(/signed-in session/); // captures made with a saved login are flagged on export
    expect(statSync(files[0]).size).toBeLessThan(14 * 1024 * 1024);
  }, 60000);
  it("rejects an unknown --feature instead of writing an empty file", async () => {
    await expect(exportCommand(FIXTURE, viewerDir, { feature: "nope" }, () => {})).rejects.toThrow(/unknown --feature "nope"; features in this graph: /);
    expect(existsSync(join(DATA, "export", "app-router-basic-nope.html"))).toBe(false);
  });
  it("validates a manifest: unknown screens and asserted-but-missing transitions are warnings, structural problems errors", async () => {
    const manifest = { version: 2, stories: [
      { id: "checkout", title: "Buy a plan", entry: "/pricing", screens: ["/pricing", "/docs/[...parts]", "/ghost"], steps: ["/pricing", { screen: "/docs/[...parts]", via: "Checkout" }, "/ghost"] },
      { id: "checkout", title: "dup", entry: "/", screens: [] },
    ] };
    writeFileSync(join(FIXTURE, "code2flow.stories.json"), JSON.stringify(manifest));
    const lines: string[] = [];
    const code = await storiesCommand("validate", FIXTURE, undefined, (l) => lines.push(l));
    const text = lines.join("\n");
    expect(code).toBe(1);
    expect(text).toMatch(/warn\s+checkout: unknown screen \/ghost/);
    expect(text).toMatch(/ERROR\s+checkout: duplicate story id/);
    expect(text).not.toMatch(/main path: no detected transition \/pricing → \/docs/); // Checkout button really pushes to /docs/…
    expect(text).toMatch(/main path: no detected transition \/docs\/\[\.\.\.parts\] → \/ghost.*\(endpoint not in graph\)/); // ghost step: still warned, not silently skipped
  });
  it("scaffolds a prompt pack from a PRD", async () => {
    const prd = join(DATA, "prd-sample.md"); writeFileSync(prd, "# Guest checkout\nAs a guest I can buy a plan from pricing.");
    const code = await storiesCommand("scaffold", FIXTURE, prd, () => {});
    expect(code).toBe(0);
    const pack = readFileSync(join(DATA, "stories-prompt.md"), "utf8");
    expect(pack).toContain("`/pricing`"); expect(pack).toContain("Guest checkout"); expect(existsSync(prd)).toBe(true);
  });
});
