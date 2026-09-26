import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildStageBridge } from "../scripts/build-stage-bridge.js";
import { buildViewer } from "../scripts/build-viewer.js";
import { serveCommand } from "../src/cli/serve-command.js";
import { launchBrowser, resolvePlaywright } from "../src/snapshot/playwright-runtime.js";
import { BROWSER_HOOK_MS, closeBrowser } from "./helpers/close-browser.js";
import { prepareStageSpa } from "./helpers/stage-spa-server.js";

type Frame = { url(): string; evaluate<T>(src: string): Promise<T> };
type Page = { goto(u: string): Promise<unknown>; url(): string; waitForTimeout(ms: number): Promise<void>; evaluate<T>(src: string): Promise<T>; frames(): Frame[]; keyboard: { press(k: string): Promise<void> }; on(ev: string, cb: (e: { url(): string }) => void): void; close(): Promise<void> };

let viewerDir: string; let spa: Awaited<ReturnType<typeof prepareStageSpa>>; let browser: Awaited<ReturnType<typeof launchBrowser>>;
let serve: { close: () => void; url: string }; let viewerOrigin = "";
beforeAll(async () => {
  await buildStageBridge(); viewerDir = await buildViewer(join(process.cwd(), "out", "viewer"));
  spa = await prepareStageSpa(viewerDir, { viewerOrigins: () => [viewerOrigin] });
  writeFileSync(join(spa.dir, "code2flow.config.json"), JSON.stringify({ features: [{ id: "shop", title: "Shop", match: ["/", "/orders", "/settings"] }], stage: { url: spa.app.url } }));
  serve = await serveCommand(spa.dir, viewerDir, () => {}, { port: 0 }); viewerOrigin = serve.url;
  browser = await launchBrowser(resolvePlaywright(process.cwd()), true);
}, 120000);
afterAll(async () => { await closeBrowser(browser); serve?.close(); spa?.cleanup(); }, BROWSER_HOOK_MS);

const appFrames = (page: Page): Frame[] => page.frames().filter((f) => f.url().startsWith(spa.app.url));
const stageFrame = (page: Page): Frame => appFrames(page).find((f) => f.url().includes("c2f-stage=1"))!;
const title = (page: Page): Promise<string> => page.evaluate<string>(`document.querySelector(".stage-title").textContent`);
const openLive = async (): Promise<Page> => {
  const page = (await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()) as unknown as Page;
  await page.goto(`${serve.url}/#f/shop/s/review-orders/play/0/focus`);
  for (let i = 0; i < 40 && (await page.evaluate<string>(`document.querySelector(".stage-frame")?.dataset.source ?? ""`)) !== "live"; i++) await page.waitForTimeout(100);
  return page;
};

describe("Stage security (ADR-0008 §8, spec §4): the framed app cannot leave its box", () => {
  it("cannot navigate the viewer away: top-level navigation is refused by the sandbox", async () => {
    const page = await openLive();
    const before = page.url(); expect(await title(page)).toBe("Home dashboard");
    const attempt = await stageFrame(page).evaluate<string>(`(() => { try { window.top.location.href = ${JSON.stringify(spa.app.url + "/settings")}; return "no error"; } catch (e) { return e.name; } })()`);
    await page.waitForTimeout(600);
    expect(attempt).toBe("SecurityError"); // sandbox without allow-top-navigation
    expect(page.url()).toBe(before); expect(await title(page)).toBe("Home dashboard");
    expect(await page.evaluate<number>(`document.querySelectorAll(".stage").length`)).toBe(1);
    await page.close();
  });
  it("ignores Stage messages from a sibling frame on the app's origin; the same message from the Stage frame is honoured", async () => {
    const page = await openLive();
    expect(await title(page)).toBe("Home dashboard");
    const message = JSON.stringify({ c2f: 1, type: "key", key: "ArrowRight", meta: false, ctrl: false, shift: false });
    // A second frame on the SAME origin as the app (a popup, an ad, a second tab of the product) posts a presenter key and a ready.
    await page.evaluate(`new Promise((ok) => { const f = document.createElement("iframe"); f.src = ${JSON.stringify(spa.app.url + "/settings?spoof=1")}; f.onload = () => ok(); document.body.append(f); })`);
    const spoof = appFrames(page).find((f) => f.url().includes("spoof=1"))!;
    await spoof.evaluate(`parent.postMessage(${message}, "*"); parent.postMessage({ c2f: 1, type: "ready", version: 1, path: "/settings?spoof=1" }, "*"); parent.postMessage({ c2f: 1, type: "navigated", id: 1, path: "/settings" }, "*")`);
    await page.waitForTimeout(400);
    expect(await title(page)).toBe("Home dashboard"); // nothing moved: origin matched, source did not
    expect(await page.evaluate<string>("location.hash")).toBe("#f/shop/s/review-orders/play/0/focus");
    // Control: the real Stage frame posting the same key advances one step, so the assertion above can fail.
    await stageFrame(page).evaluate(`parent.postMessage(${message}, ${JSON.stringify(viewerOrigin)})`);
    await page.waitForTimeout(400);
    expect(await title(page)).toBe("Open orders");
    await page.close();
  });
  it("serves frame-src for exactly the live origin, and the bridge answers only its parent", async () => {
    const html = await (await fetch(`${serve.url}/`)).text();
    const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? "";
    expect(csp).toContain(`frame-src ${new URL(spa.app.url).origin}`);
    expect(csp.match(/frame-src/g)?.length).toBe(1);
    // An unframed copy of the app installs nothing: no listener, no announcement (spec §4 "bridge shipped to production").
    const page = (await (await browser.newContext({})).newPage()) as unknown as Page;
    await page.goto(`${spa.app.url}/?c2f-stage=1`); await page.waitForTimeout(300);
    expect(await page.evaluate<boolean>(`window.top === window.self`)).toBe(true);
    await page.evaluate(`window.__got = []; addEventListener("message", (e) => __got.push(e.data)); postMessage({ c2f: 1, type: "hello" }, location.origin)`);
    await page.waitForTimeout(300);
    expect(await page.evaluate<unknown[]>("__got.filter((m) => m && m.type === 'ready')")).toEqual([]);
    await page.close();
  });
});

describe("Export (hand-out): captured only, no frame, no network", () => {
  it("has no iframe and no frame-src, and opens its Stage with zero network requests", async () => {
    const file = readFileSync(spa.html, "utf8");
    expect(file).not.toContain("frame-src"); expect(file).not.toMatch(/<iframe/i);
    const page = (await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()) as unknown as Page;
    const requests: string[] = []; page.on("request", (r) => requests.push(r.url()));
    await page.goto(`file://${spa.html}#f/shop/s/review-orders/play/0/focus`); await page.waitForTimeout(800);
    await page.keyboard.press("ArrowRight"); await page.keyboard.press("e"); await page.keyboard.press("n"); await page.waitForTimeout(500);
    expect(await title(page)).toBe("Open orders");
    expect(await page.evaluate<number>(`document.querySelectorAll("iframe").length`)).toBe(0);
    expect(await page.evaluate<string>(`document.querySelector(".stage-frame").dataset.source`)).toBe("captured");
    expect(requests.filter((u) => u !== `file://${spa.html}` && !u.startsWith("data:"))).toEqual([]);
    await page.close();
  });
});
