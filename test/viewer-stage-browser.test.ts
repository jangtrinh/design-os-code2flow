import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildStageBridge } from "../scripts/build-stage-bridge.js";
import { buildViewer } from "../scripts/build-viewer.js";
import { launchBrowser, resolvePlaywright } from "../src/snapshot/playwright-runtime.js";
import { prepareStageSpa } from "./helpers/stage-spa-server.js";

type Page = { goto(u: string): Promise<unknown>; waitForTimeout(ms: number): Promise<void>; evaluate<T>(src: string): Promise<T>; click(sel: string): Promise<void>; keyboard: { press(k: string): Promise<void> }; mouse: { move(x: number, y: number): Promise<void>; wheel(dx: number, dy: number): Promise<void> }; setViewportSize(v: { width: number; height: number }): Promise<void>; on(ev: string, cb: (e: { message?: string; type?: () => string; text?: () => string }) => void): void; close(): Promise<void> };
let spa: Awaited<ReturnType<typeof prepareStageSpa>>; let browser: Awaited<ReturnType<typeof launchBrowser>>; const errors: string[] = [];
beforeAll(async () => { await buildStageBridge(); const viewerDir = await buildViewer(join(process.cwd(), "out", "viewer")); spa = await prepareStageSpa(viewerDir); browser = await launchBrowser(resolvePlaywright(process.cwd()), true); }, 120000);
afterAll(async () => { await browser?.close(); spa?.cleanup(); });

const open = async (hash: string, width = 1440, height = 900): Promise<Page> => {
  const page = (await (await browser.newContext({ viewport: { width, height } })).newPage()) as unknown as Page;
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message)); page.on("console", (m) => { if (m.type?.() === "error") errors.push("console: " + m.text?.()); });
  await page.goto(`file://${spa.html}${hash}`); await page.waitForTimeout(500); return page;
};
const text = (page: Page, sel: string): Promise<string> => page.evaluate<string>(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent||""`);

describe("Stage, captured (offline export, real pointer and keys)", () => {
  it("opens from a Play card click and shows the audience name, via trigger and caption", async () => {
    const page = await open("#f/shop/s/review-orders/play/0");
    await page.click('.player-card[data-step="1"]'); await page.waitForTimeout(200);
    expect(await text(page, ".stage-title")).toBe("Open orders"); // Audience Name, not the captured h1 "Orders"
    expect(await text(page, ".stage-caption")).toBe("via Review open ordersEvery open order with its customer.");
    expect(await text(page, ".stage-meta")).toBe("Review and archive orders · 2 / 5 · Captured screen");
    expect(await page.evaluate<boolean>(`document.querySelector(".stage-capture img").naturalWidth > 0`)).toBe(true);
    expect(await page.evaluate<boolean>(`document.querySelector(".stage-live").disabled`)).toBe(true); // exports never go live
    await page.close();
  });
  it("steps with arrows, Home/End and filmstrip clicks; Esc returns to the grid", async () => {
    const page = await open("#f/shop/s/review-orders/play/0/focus");
    await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(150);
    expect(await text(page, ".stage-title")).toBe("Archived orders"); expect(await page.evaluate<string>("location.hash")).toBe("#f/shop/s/review-orders/play/2/focus");
    await page.keyboard.press("End"); await page.waitForTimeout(100); expect(await text(page, ".stage-title")).toBe("Team settings");
    await page.click('.stage-thumb[aria-label^="Step 4"]'); await page.waitForTimeout(100);
    expect(await text(page, ".stage-title")).toBe("Start a new order"); // the step's own title wins over the screen name
    expect(await text(page, ".stage-caption")).toBe("via New orderNew order asks for a customer first.");
    await page.keyboard.press("Home"); await page.waitForTimeout(100); expect(await text(page, ".stage-title")).toBe("Home dashboard");
    await page.keyboard.press("Escape"); await page.waitForTimeout(150);
    expect(await page.evaluate<number>(`document.querySelectorAll(".player-card").length`)).toBe(5);
    await page.close();
  });
  it("scrolls a tall capture with the real wheel (the canvas must not swallow it)", async () => {
    const page = await open("#f/shop/s/review-orders/play/1/focus");
    await page.mouse.move(700, 400); await page.mouse.wheel(0, 600); await page.waitForTimeout(300);
    expect(await page.evaluate<number>(`document.querySelector(".stage-capture").scrollTop`)).toBeGreaterThan(100);
    await page.keyboard.press("ArrowRight"); await page.waitForTimeout(150);
    expect(await page.evaluate<number>(`document.querySelector(".stage-capture").scrollTop`)).toBe(0); // a new step starts at its top
    await page.close();
  });
  it("toggles captions, notes, evidence, shortcuts and the locale; Esc closes the panel first", async () => {
    const page = await open("#f/shop/s/review-orders/play/1/focus");
    await page.keyboard.press("c"); await page.waitForTimeout(80); expect(await page.evaluate<boolean>(`document.querySelector(".stage-caption").hidden`)).toBe(true);
    await page.keyboard.press("c"); await page.keyboard.press("n"); await page.waitForTimeout(80);
    expect(await text(page, ".stage-panel")).toContain("Click Review open orders.");
    await page.keyboard.press("i"); await page.waitForTimeout(80); expect(await text(page, ".stage-panel")).toContain("orders"); expect(await text(page, ".stage-panel")).toContain("/orders");
    await page.click(".stage-help"); await page.waitForTimeout(80); expect(await text(page, ".stage-panel")).toContain("Shortcuts");
    await page.keyboard.press("l"); await page.waitForTimeout(80);
    expect(await text(page, ".stage-title")).toBe("Đơn hàng đang mở"); expect(await text(page, ".stage-panel")).toContain("Phím tắt");
    await page.keyboard.press("Escape"); await page.waitForTimeout(80);
    expect(await page.evaluate<boolean>(`document.querySelector(".stage-panel").hidden`)).toBe(true);
    expect(await page.evaluate<number>(`document.querySelectorAll(".stage").length`)).toBe(1); // still on the Stage
    await page.keyboard.press("l"); await page.close();
  });
  it("keeps chrome within 10% of the window at 1280×720, 1440×900 and 1920×1080, with no horizontal scroll down to 375", { timeout: 30000 }, async () => {
    for (const [w, h] of [[1280, 720], [1440, 900], [1920, 1080]]) {
      const page = await open("#f/shop/s/review-orders/play/1/focus", w, h);
      const pct = await page.evaluate<number>(`(() => { const s = document.querySelector(".stage").getBoundingClientRect(), f = document.querySelector(".stage-frame").getBoundingClientRect(), c = document.querySelector(".stage-caption").getBoundingClientRect(); return 100 * (s.bottom - f.bottom - c.height) / innerHeight; })()`);
      expect(pct, `${w}x${h}`).toBeLessThanOrEqual(10); await page.close();
    }
    for (const w of [375, 768]) { const page = await open("#f/shop/s/review-orders/play/1/focus", w, 812); expect(await page.evaluate<boolean>("document.documentElement.scrollWidth <= innerWidth"), String(w)).toBe(true); await page.close(); }
    expect(errors).toEqual([]);
  });
});
