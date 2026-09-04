import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportCommand } from "../src/cli/export-command.js";
import { scanCommand } from "../src/cli/scan-command.js";
import { launchBrowser, resolvePlaywright } from "../src/snapshot/playwright-runtime.js";
import { shotFiles } from "../src/snapshot/shot-file-key.js";
import { buildViewer } from "../scripts/build-viewer.js";
import { copyFixture } from "./helpers/fixture-copy.js";

const fx = copyFixture("viewer"); const FIXTURE = fx.dir; const DATA = join(FIXTURE, ".code2flow");
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64");
/** v2 manifest: main path with `via`, one branch, an exit, and a screen the code lacks (UC-04/UC-07). */
const MANIFEST = { version: 2, features: [{ id: "shop", title: "Shop", match: ["/", "/pricing", "/orders/**", "/docs/**"] }, { id: "account", title: "Product catalog administration", match: [] }], stories: [
  { id: "buy", title: "Buy a plan", entry: "/", exit: ["/orders?drawer=details"], screens: ["/", "/pricing", "/checkout-ghost", "/orders?drawer=details", "/docs/[...parts]"],
    steps: ["/", { screen: "/pricing", via: "Pricing" }, { screen: "/checkout-ghost", via: "Checkout" }, "/orders?drawer=details"],
    branches: [{ title: "Read the docs first", from: "/pricing", steps: [{ screen: "/docs/[...parts]", via: "Checkout" }, "/orders?drawer=details"] }] },
] };

type Page = { goto(u: string, o: Record<string, unknown>): Promise<unknown>; waitForTimeout(ms: number): Promise<void>; evaluate<T>(src: string): Promise<T>; on(ev: string, cb: (e: { message?: string; type?: () => string; text?: () => string }) => void): void; keyboard: { press(k: string): Promise<void> } };
let html: string; let browser: Awaited<ReturnType<typeof launchBrowser>>; let page: Page; const errors: string[] = [];
beforeAll(async () => {
  const viewerDir = await buildViewer();
  await scanCommand(FIXTURE, () => {});
  mkdirSync(join(DATA, "shots"), { recursive: true }); writeFileSync(shotFiles(join(DATA, "shots"), "/").full, JPEG);
  writeFileSync(join(DATA, "shots-meta.json"), JSON.stringify({ "/": { url: "/", width: 1440, height: 900 } }));
  writeFileSync(join(FIXTURE, "code2flow.stories.json"), JSON.stringify(MANIFEST));
  [html] = await exportCommand(FIXTURE, viewerDir, {}, () => {});
  browser = await launchBrowser(resolvePlaywright(FIXTURE), true);
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } }); page = (await ctx.newPage()) as unknown as Page;
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message)); page.on("console", (m) => { if (m.type?.() === "error") errors.push("console: " + m.text?.()); });
}, 60000);
afterAll(async () => { await browser?.close(); fx.cleanup(); });

const open = async (hash: string): Promise<void> => { await page.goto(`file://${html}${hash}`, { waitUntil: "load" }); await page.waitForTimeout(500); };
const count = (sel: string): Promise<number> => page.evaluate<number>(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const text = (sel: string): Promise<string> => page.evaluate<string>(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent||""`);

describe("viewer in a real browser (seam: exported HTML, no network)", () => {
  it("features come from the manifest and fonts are inlined", async () => {
    await open("#map");
    expect(await text("#rail")).toContain("Shop");
    expect(await page.evaluate<boolean>(`document.fonts.check('600 15px "Be Vietnam Pro"') && document.fonts.check('12px "JetBrains Mono"')`)).toBe(true);
  });
  it("feature breadcrumb dropdown exposes the manifest choices and changes the hash", async () => {
    await open("#f/shop");
    await page.evaluate<void>(`document.querySelector('[aria-label="Feature"]').click()`);
    expect(await count('[role="listbox"]:not([hidden]) [role="option"]')).toBe(2);
    expect(await text('[role="listbox"]:not([hidden])')).toContain("Shop");
    expect(await text('[role="listbox"]:not([hidden])')).toContain("Product catalog administration");
    await page.evaluate<void>(`document.querySelectorAll('[role="listbox"]:not([hidden]) [role="option"]')[1].click()`);
    expect(await page.evaluate<string>("location.hash")).toBe("#f/account");
  });
  it("uses split toolbar groups, slash breadcrumbs, and an unclipped dropdown", async () => {
    await open("#f/shop");
    expect(await count(".toolbar")).toBe(2);
    expect(await count(".crumb-separator")).toBe(2);
    expect(await page.evaluate<string[]>(`(() => [...document.querySelectorAll('.crumb-separator')].map((separator) => separator.textContent ?? ''))()`)).toEqual(["/", "/"]);
    await page.evaluate<void>(`document.querySelector('[aria-label="Feature"]').click()`);
    expect(await page.evaluate<boolean>(`(() => { const menu = document.querySelector('.crumb-menu:not([hidden])'); const row = menu.querySelector('.crumb-option'); const style = getComputedStyle(menu); return style.width !== '0px' && style.overflowY === 'auto' && row.scrollWidth === row.clientWidth; })()`)).toBe(true);
  });
  it("opens canvas vocabulary and toggles Close arrows", async () => {
    await open("#f/shop");
    await page.evaluate<void>(`document.querySelector('#canvas-help').click()`);
    expect(await count('#canvas-help-popover:not([hidden]) .help-row')).toBeGreaterThanOrEqual(5);
    expect(await page.evaluate<string>(`document.querySelector('.close-arrows-row input').getAttribute('aria-checked')`)).toBe("false");
    await page.evaluate<void>(`document.querySelector('.close-arrows-row input').click()`);
    await page.waitForTimeout(100);
    expect(await page.evaluate<string>(`document.querySelector('.close-arrows-row input').getAttribute('aria-checked')`)).toBe("true");
  });
  it("present mode follows v2 steps: main path + branch sub-row, entry/exit chips, via labels, asserted edge for the missing step", async () => {
    await open("#f/shop/s/buy/present/1");
    expect(await count(".lane")).toBe(2); // the story lane + the "Not in a story" tray
    expect(await count("[data-node]")).toBe(6); // 4 main-path + 2 branch-row nodes (shared screens are drawn per row)
    expect(await count(".stub.bad")).toBe(1); // /checkout-ghost as a MISSING SCREEN stub, not dropped
    expect(await count(".edge.asserted")).toBe(3); // /pricing → ghost, ghost → drawer, docs → drawer: named by the PRD, no transition in code
    expect(await text("#view")).toContain("↳ Read the docs first");
    expect(await text("#view")).toMatch(/entry/); expect(await text("#view")).toMatch(/exit/);
    expect(await text("#phud")).toContain("2 / 4"); expect(await text("#phud")).toContain("via Pricing");
  });
  it("stepping onto the missing screen and Inspect's story view never throw", async () => {
    await open("#f/shop/s/buy/present/2");
    expect(await text("#phud")).toContain("Missing screen");
    await page.keyboard.press("ArrowRight"); await page.waitForTimeout(200); expect(await text("#phud")).toContain("4 / 4");
    await open("#f/shop/s/buy");
    expect(await text("#view")).toContain("Not in code · 1");
    expect(errors).toEqual([]);
  });
  it("play mode shows the current image and one thumbnail per story step", async () => {
    await open("#f/shop/s/buy/play/0");
    expect(await count("#player .player-current img")).toBe(1);
    expect(await count("#player .player-thumb")).toBe(4);
  });
  it("play mode advances with ArrowRight and writes its hash", async () => {
    await open("#f/shop/s/buy/play/0");
    await page.keyboard.press("ArrowRight"); await page.waitForTimeout(200);
    expect(await page.evaluate<string>("location.hash")).toBe("#f/shop/s/buy/play/1");
  });
});
