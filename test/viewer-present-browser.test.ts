import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const MANIFEST = { version: 2, features: [{ id: "shop", title: "Shop", match: ["/", "/orders/**", "/docs/**"] }, { id: "account", title: "Product catalog administration", match: ["/pricing"] }], stories: [
  { id: "buy", title: "Buy a plan <img src=x onerror=\"window.__xss=2\">", entry: "/", exit: ["/orders?drawer=details"], screens: ["/", "/pricing", "/orders?drawer=details", "/checkout-ghost", "/docs/[...parts]"],
    steps: ["/", { screen: "/pricing", via: "Pricing" }, { screen: "/orders?drawer=details", via: "Checkout" }, "/checkout-ghost"],
    branches: [{ title: "Read the docs first", from: "/pricing", steps: [{ screen: "/docs/[...parts]", via: "Checkout" }, "/orders?drawer=details"] }] },
] };

type Page = { goto(u: string, o: Record<string, unknown>): Promise<unknown>; waitForTimeout(ms: number): Promise<void>; evaluate<T>(src: string): Promise<T>; on(ev: string, cb: (e: { message?: string; type?: () => string; text?: () => string }) => void): void; keyboard: { press(k: string): Promise<void> } };
let html: string; let viewerDir: string; let browser: Awaited<ReturnType<typeof launchBrowser>>; let page: Page; const errors: string[] = [];
beforeAll(async () => {
  viewerDir = await buildViewer();
  await scanCommand(FIXTURE, () => {});
  // Security: repo source and manifest text reach the viewer as data, never as markup (stored-XSS regression, 2026-09-04 audit C1/H4)
  { const gp = join(DATA, "graph.json"); const g = JSON.parse(readFileSync(gp, "utf8")); const e = g.edges.find((x: { source: string }) => x.source === "/") ?? g.edges[0]; e.trigger = "<b id=\"xss-trigger\">t</b>"; e.evidence.snippet = "<img src=x onerror=\"window.__xss=1\">"; writeFileSync(gp, JSON.stringify(g)); }
  mkdirSync(join(DATA, "shots"), { recursive: true });
  const captured = ["/", "/orders?drawer=details"];
  for (const id of captured) writeFileSync(shotFiles(join(DATA, "shots"), id).full, JPEG);
  writeFileSync(join(DATA, "shots-meta.json"), JSON.stringify(Object.fromEntries(captured.map((id) => [id, { url: id, width: 1440, height: 900 }]))));
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
  it("labels portal stubs with the feature and real target title, then opens them by pointer click", async () => {
    await open("#f/shop");
    expect(await page.evaluate<string[]>(`[...document.querySelectorAll('.stub[data-node="portal:/pricing"] text')].map((node) => node.textContent ?? '')`)).toEqual(["→ Product catalog administration", "Pricing plans"]);
    expect(await page.evaluate<string>(`document.querySelector('.stub[data-node="portal:/pricing"]')?.getAttribute('title') ?? ''`)).toBe("Open in Product catalog administration");
    await (page as unknown as { click(selector: string): Promise<void> }).click('.stub[data-node="portal:/pricing"]');
    await page.waitForTimeout(200);
    expect(await page.evaluate<string>("location.hash")).toContain("#f/account/sel/%2Fpricing");
  });
  it("anchors every product-map label at its curve midpoint and keeps curves outside card bodies", async () => {
    await open("#map");
    expect(await page.evaluate<string[]>(`(() => {
      const point = (path, t) => { const p = path.getPointAtLength(path.getTotalLength() * t); const m = path.getScreenCTM(); return new DOMPoint(p.x, p.y).matrixTransform(m); };
      const cards = [...document.querySelectorAll('.card .bg')].map((node) => node.getBoundingClientRect());
      return [...document.querySelectorAll('.xedge')].flatMap((path) => {
        const label = document.querySelector('.map-edge-label[data-edge="' + path.dataset.edge + '"]'); const box = label?.getBoundingClientRect(); const mid = point(path, .5);
        const labelError = !box || Math.hypot(box.x + box.width / 2 - mid.x, box.y + box.height / 2 - mid.y) > 14 ? ['label:' + path.dataset.edge] : [];
        const crossings = Array.from({ length: 39 }, (_, i) => point(path, (i + 1) / 40)).filter((p) => cards.some((card) => p.x > card.left && p.x < card.right && p.y > card.top && p.y < card.bottom)).map(() => 'card:' + path.dataset.edge);
        return [...labelError, ...crossings];
      });
    })()`)).toEqual([]);
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
    await open("#f/shop/s/buy/present/3");
    expect(await text("#phud")).toContain("Missing screen");
    await page.keyboard.press("ArrowRight"); await page.waitForTimeout(200); expect(await text("#phud")).toContain("4 / 4");
    await open("#f/shop/s/buy");
    expect(await text("#view")).toContain("Not in code · 1");
    expect(errors).toEqual([]);
  });
  it("hides the presenter HUD after leaving Present", async () => {
    await open("#f/shop/s/buy/present/1");
    expect(await page.evaluate<boolean>(`document.querySelector('#phud').hidden`)).toBe(false);
    await open("#f/shop/s/buy");
    expect(await page.evaluate<boolean>(`document.querySelector('#phud').hidden`)).toBe(true);
    await open("#f/shop/s/buy/play/0");
    expect(await page.evaluate<boolean>(`document.querySelector('#phud').hidden`)).toBe(true);
  });
  it("Play grid card three opens Focus, advances, and returns to its current grid card", async () => {
    await open("#f/shop/s/buy/play/0");
    expect(await count("#player .player-card")).toBe(4);
    expect(await count("#player .player-card .player-step-chip")).toBe(4);
    expect(await page.evaluate<{ columns: string; x: string; y: string }>(`(() => { const style = getComputedStyle(document.querySelector('.player-gallery')); return { columns: style.gridTemplateColumns, x: style.overflowX, y: style.overflowY }; })()`)).toEqual(expect.objectContaining({ x: "hidden", y: "auto" }));
    const stepThreeShot = await page.evaluate<string>(`document.querySelector('#player .player-card[data-step="2"] img')?.getAttribute('src') ?? ''`);
    await (page as unknown as { click(selector: string): Promise<void> }).click('#player .player-card[data-step="2"]');
    await page.waitForTimeout(200);
    expect(await page.evaluate<string>("location.hash")).toBe("#f/shop/s/buy/play/2/focus");
    expect(await count("#player .player-focus")).toBe(1);
    expect(await page.evaluate<string>(`document.querySelector('.player-focus img')?.getAttribute('src') ?? ''`)).toBe(stepThreeShot);
    await page.keyboard.press("ArrowRight"); await page.waitForTimeout(200);
    expect(await page.evaluate<string>("location.hash")).toBe("#f/shop/s/buy/play/3/focus");
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    expect(await page.evaluate<string>("location.hash")).toBe("#f/shop/s/buy/play/3");
    expect(await count("#player .player-gallery")).toBe(1);
    expect(await page.evaluate<number>(`[...document.querySelectorAll('#player .player-card')].findIndex((card) => card.classList.contains('on'))`)).toBe(3);
  });
  it("loads a Focus hash directly and exposes its view control", async () => {
    await open("#f/shop/s/buy/play/1/focus");
    expect(await count("#player .player-focus")).toBe(1);
    expect(await count('.player-view-seg [title="Grid view"]')).toBe(1);
    expect(await count('.player-view-seg [title="Focus view"]')).toBe(1);
    await (page as unknown as { click(selector: string): Promise<void> }).click('.player-view-seg [title="Grid view"]');
    expect(await page.evaluate<string>("location.hash")).toBe("#f/shop/s/buy/play/1");
    expect(await count("#player .player-gallery")).toBe(1);
  });
  it("removes the Play panel action row", async () => {
    await open("#f/shop/s/buy/play/0");
    expect(await count("#player .player-actions")).toBe(0);
    await (page as unknown as { click(selector: string): Promise<void> }).click('#player .player-thumb[aria-label="Step 2"]');
    await page.waitForTimeout(200);
    expect(await page.evaluate<string>("location.hash")).toBe("#f/shop/s/buy/play/1");
  });
  it("removes the duplicate toolbar back control while retaining breadcrumbs", async () => {
    await open("#f/shop");
    expect(await count("#toolbar-left #nav-back")).toBe(0);
    expect(await count("#toolbar-left .crumb")).toBe(1);
  });
  it("keeps Present breadcrumbs at the left edge when the rail is hidden", async () => {
    await open("#f/shop/s/buy/present/0");
    expect(await page.evaluate<number>(`document.querySelector('#toolbar-left').getBoundingClientRect().x`)).toBeLessThan(24);
  });
  it("play mode advances with ArrowRight and writes its hash", async () => {
    await open("#f/shop/s/buy/play/0");
    await page.keyboard.press("ArrowRight"); await page.waitForTimeout(200);
    expect(await page.evaluate<string>("location.hash")).toBe("#f/shop/s/buy/play/1");
  });
  it("keeps rendered icons named and makes a bundled edge pill open its evidence inspector", async () => {
    await open("#f/shop");
    expect(await page.evaluate<string[]>(`[...document.querySelectorAll('svg')].filter((svg) => !svg.querySelector('title')).map((svg) => svg.outerHTML.slice(0, 80))`)).toEqual([]);
    await (page as unknown as { click(selector: string): Promise<void> }).click(".edge-pill"); await page.waitForTimeout(300); // a real pointer click: the canvas drag handler must not swallow it
    expect(await count('#drawer.open .inspector-row')).toBeGreaterThan(0);
    expect(await page.evaluate<string>("location.hash")).toContain("sel/edge%3A");
  });
  it("keeps fixture edge pills separated and wide enough for their labels", async () => {
    await open("#f/shop");
    expect(await page.evaluate<string[]>(`(() => {
      const pills = [...document.querySelectorAll('.edge-pill')];
      const intersects = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      return pills.flatMap((pill, index) => {
        const box = pill.getBoundingClientRect(); const rect = pill.querySelector('rect')?.getBoundingClientRect(); const label = pill.querySelector('text')?.getBoundingClientRect();
        const overlaps = pills.slice(index + 1).filter((other) => intersects(box, other.getBoundingClientRect())).map((other) => other.getAttribute('aria-label'));
        return [...overlaps, ...(rect && label && rect.width >= label.width + 12 ? [] : ['clipped:' + pill.getAttribute('aria-label')])];
      });
    })()`)).toEqual([]);
  });
  it("removes the HUD and delegates keyboard zoom and fit after a hash redraw", async () => {
    await open("#f/shop");
    expect(await count("#hud")).toBe(0);
    await page.keyboard.press("+");
    const beforeFit = await page.evaluate<string>(`document.querySelector('#view')?.getAttribute('transform') ?? ''`);
    await page.keyboard.press("F");
    expect(await page.evaluate<string>(`document.querySelector('#view')?.getAttribute('transform') ?? ''`)).not.toBe(beforeFit);
    await page.keyboard.press("-");
  });
  it("makes Present canvas-only without changing selection from a frame click", async () => {
    await open("#f/shop");
    await page.evaluate<void>(`document.querySelector('.frame')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
    expect(await page.evaluate<boolean>(`document.querySelector('#drawer')?.classList.contains('open') ?? false`)).toBe(true);
    await page.evaluate<void>(`document.querySelector('#modeSeg [data-mode="present"]')?.click()`);
    const before = await page.evaluate<string>(`location.hash`);
    expect(await page.evaluate<string>(`getComputedStyle(document.querySelector('#rail')).display`)).toBe("none");
    expect(await page.evaluate<string>(`getComputedStyle(document.querySelector('#drawer')).display`)).toBe("none");
    await page.evaluate<void>(`document.querySelector('.frame')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
    expect(await page.evaluate<string>(`location.hash`)).toBe(before);
    expect(await page.evaluate<boolean>(`document.querySelector('#drawer')?.classList.contains('open') ?? false`)).toBe(true);
    await page.evaluate<void>(`document.querySelector('#modeSeg [data-mode="inspect"]')?.click()`);
    expect(await page.evaluate<string>(`getComputedStyle(document.querySelector('#rail')).display`)).not.toBe("none");
    expect(await page.evaluate<string>(`getComputedStyle(document.querySelector('#drawer')).display`)).not.toBe("none");
  });
  it("keeps route slugs out of canvas text and frame chrome outside screenshot bounds", async () => {
    await open("#f/shop/s/buy/present/1");
    expect(await page.evaluate<string[]>(`[...document.querySelectorAll('#svg text')].filter((node) => !node.closest('.stub')).map((node) => node.textContent?.trim() ?? '').filter((value) => value.startsWith('/'))`)).toEqual([]);
    expect(await page.evaluate<string[]>(`(() => {
      const intersects = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      return [...document.querySelectorAll('#view .frame')].flatMap((frame) => {
        const image = frame.querySelector('image'); if (!image) return [];
        const shot = image.getBoundingClientRect();
        return [...frame.querySelectorAll('.header-chip, .frame-footer')].filter((chip) => intersects(shot, chip.getBoundingClientRect())).map((chip) => frame.dataset.node + ':' + chip.getAttribute('class'));
      });
    })()`)).toEqual([]);
  });
  it("keeps compact generic labels out of built viewer string literals and records icon title coverage", async () => {
    const viewer = readFileSync(join(viewerDir, "viewer.js"), "utf8");
    expect(viewer.match(/(?:textContent|innerHTML)\s*=\s*["'](?:Kind|File|URL|Out|In|Sidebar|states|stories|flows|missing)["']/gi) ?? []).toEqual([]);
    await open("#f/shop");
    const counts = await page.evaluate<{ icons: number; titles: number }>(`(() => { const icons = [...document.querySelectorAll('svg')].filter((svg) => [...svg.children].some((child) => child.localName === 'title')); return { icons: icons.length, titles: document.querySelectorAll('svg > title').length }; })()`);
    expect(counts).toEqual({ icons: 50, titles: 50 }) // +5 file-code icons: Inspector evidence rows render since the 2026-09-04 security fix;
  });

  it("renders hostile source snippets and manifest titles as text, never as markup", async () => {
    await open("#f/shop");
    await (page as unknown as { click(selector: string): Promise<void> }).click(".edge-pill"); await page.waitForTimeout(300);
    await page.evaluate<void>("document.querySelector('#drawer .inspector-row')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))");
    expect(await count("#xss-trigger")).toBe(0);
    expect(await count('img[src="x"]')).toBe(0);
    expect(await page.evaluate<string>("String(window.__xss)")).toBe("undefined");
    expect(await text("#drawer")).toContain("<img src=x"); // shown literally
    await open("#f/shop/s/buy");
    expect(await count('img[src="x"]')).toBe(0);
    expect(await page.evaluate<string>("String(window.__xss)")).toBe("undefined");
  });
  // Last in the file: this test's selection is left open in the drawer, and a hash-only navigation (this suite's
  // `open()`) does not close a drawer opened by an earlier test — see main.ts's `popstate` handler. Running last
  // means its residual selection cannot perturb any later test's icon/evidence-row counts.
  it("re-selecting a frame toggles .selected in place, without a full re-render (perf audit H5, round-8 item 4)", async () => {
    await open("#f/shop");
    const click = (selector: string): Promise<void> => page.evaluate<void>(`document.querySelector(${JSON.stringify(selector)})?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
    await click('[data-node="/"]'); await page.waitForTimeout(200);
    expect(await page.evaluate<boolean>(`document.querySelector('[data-node="/"]')?.classList.contains('selected') ?? false`)).toBe(true);
    // A full render() calls view.replaceChildren(), which would discard this marker: it surviving the next click proves the fast path ran.
    await page.evaluate<void>(`document.querySelector('[data-node="/orders"]').dataset.keepMarker = 'yes'`);
    await click('[data-node="/orders"]'); await page.waitForTimeout(200);
    expect(await page.evaluate<string>(`document.querySelector('[data-node="/orders"]')?.dataset.keepMarker ?? ''`)).toBe("yes");
    expect(await page.evaluate<boolean>(`document.querySelector('[data-node="/"]')?.classList.contains('selected') ?? true`)).toBe(false);
    expect(await page.evaluate<boolean>(`document.querySelector('[data-node="/orders"]')?.classList.contains('selected') ?? false`)).toBe(true);
    expect(await page.evaluate<string>("location.hash")).toContain("sel/%2Forders");
    expect(await count("#drawer.open .inspector-row")).toBeGreaterThan(0);
  });
});
