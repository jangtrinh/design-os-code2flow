import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildStageBridge } from "../scripts/build-stage-bridge.js";
import { launchBrowser, resolvePlaywright } from "../src/snapshot/playwright-runtime.js";
import { BROWSER_HOOK_MS, closeBrowser } from "./helpers/close-browser.js";
import { startStageSpa } from "./helpers/stage-spa-server.js";

/** A stand-in viewer: frames the app with the Stage marker and records every message the bridge sends back. */
const parentPage = (app: string) => `<!doctype html><body style="margin:0"><iframe id="f" src="${app}/orders?c2f-stage=1" style="width:1200px;height:700px;border:0"></iframe><script>
window.log=[];addEventListener("message",(e)=>{if(e.source===document.getElementById("f").contentWindow)log.push({origin:e.origin,...e.data})});
window.send=(m)=>document.getElementById("f").contentWindow.postMessage({c2f:1,...m},"${app}");</script></body>`;
const listen = (html: (app: string) => string, app: () => string): Promise<Server> => new Promise((ok) => { const s = createServer((_q, r) => { r.setHeader("content-type", "text/html"); r.end(html(app())); }); s.listen(0, "127.0.0.1", () => ok(s)); });

type Frame = { evaluate<T>(src: string): Promise<T>; url(): string };
type Page = { goto(u: string): Promise<unknown>; waitForTimeout(ms: number): Promise<void>; evaluate<T>(src: string): Promise<T>; frames(): Frame[]; mouse: { click(x: number, y: number): Promise<void> }; keyboard: { press(k: string): Promise<void>; type(t: string): Promise<void> }; close(): Promise<void> };
let viewer: Server, stranger: Server, app: { server: Server; url: string }, browser: Awaited<ReturnType<typeof launchBrowser>>;
const origin = (s: Server): string => `http://127.0.0.1:${(s.address() as { port: number }).port}`;
beforeAll(async () => {
  await buildStageBridge();
  let appUrl = ""; viewer = await listen(parentPage, () => appUrl); stranger = await listen(parentPage, () => appUrl);
  app = await startStageSpa({ viewerOrigins: [origin(viewer)] }); appUrl = app.url;
  browser = await launchBrowser(resolvePlaywright(process.cwd()), true);
}, 60000);
afterAll(async () => { await closeBrowser(browser); viewer?.close(); stranger?.close(); app?.server.close(); }, BROWSER_HOOK_MS);

const openViewer = async (s: Server): Promise<{ page: Page; frame: Frame; log: () => Promise<Array<Record<string, unknown>>> }> => {
  const page = (await (await browser.newContext({ viewport: { width: 1300, height: 800 } })).newPage()) as unknown as Page;
  await page.goto(origin(s)); await page.waitForTimeout(600);
  const frame = page.frames().find((f) => f.url().startsWith(app.url))!;
  return { page, frame, log: () => page.evaluate("window.log") };
};

describe("stage bridge (real browser, cross-origin frame)", () => {
  it("announces itself to an allowed viewer, answers hello, and navigates without a document reload", async () => {
    const { page, frame, log } = await openViewer(viewer);
    expect((await log()).some((m) => m.type === "ready" && m.path === "/orders?c2f-stage=1")).toBe(true);
    await frame.evaluate("window.__doc = 'first'");
    await page.evaluate(`send({type:"hello"})`); await page.waitForTimeout(150);
    expect((await log()).filter((m) => m.type === "ready").length).toBe(2);
    await page.evaluate(`send({type:"navigate",id:7,path:"/orders?tab=archived&c2f-stage=1"})`); await page.waitForTimeout(500);
    expect((await log()).find((m) => m.type === "navigated")).toMatchObject({ id: 7, path: "/orders?tab=archived&c2f-stage=1" });
    expect(await frame.evaluate<string>("window.__doc")).toBe("first"); // same document: the router moved, nothing reloaded
    expect(await frame.evaluate<boolean>(`document.querySelector('[data-tab=archived]').hidden`)).toBe(false);
    await page.close();
  });
  it("refuses navigation outside its own origin", async () => {
    const { page, frame, log } = await openViewer(viewer);
    for (const path of ["javascript:alert(1)", "//evil.test/x", "https://evil.test/"]) await page.evaluate(`send({type:"navigate",id:1,path:${JSON.stringify(path)}})`);
    await page.waitForTimeout(400);
    expect((await log()).some((m) => m.type === "navigated")).toBe(false);
    expect(frame.url()).toBe(`${app.url}/orders?c2f-stage=1`);
    await page.close();
  });
  it("ignores a viewer origin it was not told about", async () => {
    const { page, log } = await openViewer(stranger);
    await page.evaluate(`send({type:"hello"})`); await page.waitForTimeout(300);
    expect(await log()).toEqual([]);
    await page.close();
  });
  it("scrolls the element under the point while view-only", async () => {
    const { page, frame } = await openViewer(viewer);
    await page.evaluate(`send({type:"scroll",x:600,y:400,dx:0,dy:500})`); await page.waitForTimeout(200);
    expect(await frame.evaluate<number>("scrollY")).toBeGreaterThan(400);
    await page.close();
  });
  it("forwards presenter keys only while Live, and a text field keeps its own characters", async () => {
    const { page, log } = await openViewer(viewer); const frameOf = (): Frame => page.frames().find((f) => f.url().startsWith(app.url))!;
    await page.evaluate(`send({type:"hello"})`); await page.mouse.click(700, 60); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(150);
    expect((await log()).some((m) => m.type === "key")).toBe(false); // not Live yet
    await page.evaluate(`send({type:"live",on:true})`); await page.waitForTimeout(100);
    await page.mouse.click(700, 60); await page.keyboard.press("ArrowRight"); await page.keyboard.press("n"); await page.waitForTimeout(150);
    expect((await log()).filter((m) => m.type === "key").map((m) => m.key)).toEqual(["ArrowRight", "n"]);
    expect((await log()).some((m) => m.type === "touched")).toBe(true); // the pointer click inside the product
    await page.evaluate(`send({type:"navigate",id:2,path:"/settings?c2f-stage=1"})`); await page.waitForTimeout(500);
    const box = await frameOf().evaluate<{ x: number; y: number }>(`(() => { const r = document.getElementById("team").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await page.mouse.click(box.x, box.y); // the Team name input (frame sits at 0,0 in the stand-in viewer)
    expect(await frameOf().evaluate<string>("document.activeElement.id")).toBe("team");
    const before = (await log()).filter((m) => m.type === "key").length; await page.keyboard.type("ne"); await page.waitForTimeout(150);
    expect((await log()).filter((m) => m.type === "key").length).toBe(before);
    expect(await frameOf().evaluate<string>(`document.getElementById("team").value`)).toBe("Retail opsne");
    await page.close();
  });
});
