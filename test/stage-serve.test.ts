import { request } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scanCommand } from "../src/cli/scan-command.js";
import { serveCommand } from "../src/cli/serve-command.js";
import { probeStage } from "../src/cli/stage-probe.js";
import { buildViewer } from "../scripts/build-viewer.js";
import { copyFixture } from "./helpers/fixture-copy.js";
import { startStageSpa } from "./helpers/stage-spa-server.js";

const fake = (headers: Record<string, string> = {}): typeof fetch => (async () => new Response("ok", { headers })) as unknown as typeof fetch;
const down: typeof fetch = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;

describe("stage probe: live only when configured, loopback, answering, and frameable", () => {
  it("names every reason it stays captured", async () => {
    expect((await probeStage({ capture: {} as never }, {}, fake())).reason).toBe("no live app configured (set stage.url or serverUrl)");
    expect((await probeStage({ capture: {} as never, serverUrl: "http://127.0.0.1:3000" }, { live: false }, fake())).reason).toBe("live view off (--no-live)");
    expect((await probeStage({ capture: {} as never, serverUrl: "http://127.0.0.1:3000", stage: { live: false } }, {}, fake())).reason).toBe("live view off (stage.live is false)");
    expect((await probeStage({ capture: {} as never, serverUrl: "http://192.168.1.5:3000" }, {}, fake())).reason).toBe("http://192.168.1.5:3000 is not on this machine");
    expect((await probeStage({ capture: {} as never, serverUrl: "http://127.0.0.1:3000" }, {}, down)).reason).toBe("nothing answers at http://127.0.0.1:3000");
    expect((await probeStage({ capture: {} as never, serverUrl: "http://127.0.0.1:3000" }, {}, fake({ "x-frame-options": "DENY" }))).reason).toBe("the app refuses framing (X-Frame-Options: DENY)");
    expect((await probeStage({ capture: {} as never, serverUrl: "http://127.0.0.1:3000" }, {}, fake({ "content-security-policy": "default-src 'self'; frame-ancestors 'self'" }))).live).toBe(false);
  });
  it("goes live with the stage url, frame query and locale parameter", async () => {
    const info = await probeStage({ capture: {} as never, serverUrl: "http://127.0.0.1:3000", stage: { url: "http://localhost:5173/app", frameQuery: { review: "0" }, localeParam: "lang" } }, {}, fake({ "content-security-policy": "frame-ancestors http://127.0.0.1:4317" }));
    expect(info).toEqual({ live: true, url: "http://localhost:5173/app", origin: "http://localhost:5173", reason: "live http://localhost:5173/app", frameQuery: { review: "0" }, localeParam: "lang" });
  });
});

describe("serve: CSP frame-src and /data/stage.json", () => {
  const fx = copyFixture("stage-serve"); let viewerDir: string; let app: Awaited<ReturnType<typeof startStageSpa>>;
  beforeAll(async () => { viewerDir = await buildViewer(join(fx.dir, "viewer-out")); await scanCommand(fx.dir, () => {}); mkdirSync(join(fx.dir, ".code2flow"), { recursive: true }); app = await startStageSpa(); }, 60000);
  afterAll(() => { app?.server.close(); fx.cleanup(); });
  const get = (port: number, path: string): Promise<{ status: number; body: string }> => new Promise((ok, fail) => { const req = request({ host: "127.0.0.1", port, path, headers: { host: `127.0.0.1:${port}` } }, (res) => { let body = ""; res.on("data", (c) => (body += c)); res.on("end", () => ok({ status: res.statusCode ?? 0, body })); }); req.on("error", fail); req.end(); });
  const serveWith = async (config: unknown, live = true): Promise<{ port: number; close: () => void; lines: string[] }> => {
    writeFileSync(join(fx.dir, "code2flow.config.json"), JSON.stringify(config)); const lines: string[] = [];
    const srv = await serveCommand(fx.dir, viewerDir, (l) => lines.push(l), { port: 0, live });
    return { port: +new URL(srv.url).port, close: srv.close, lines };
  };
  it("adds exactly the live origin to frame-src when the app answers", async () => {
    const s = await serveWith({ stage: { url: app.url } });
    try {
      expect(s.lines).toContain(`stage  live ${app.url}`);
      expect((await get(s.port, "/")).body).toContain(`frame-src ${app.url};`);
      expect(JSON.parse((await get(s.port, "/data/stage.json")).body)).toMatchObject({ live: true, origin: app.url });
    } finally { s.close(); }
  });
  it("keeps the CSP without frame-src when live is off", async () => {
    const s = await serveWith({ stage: { url: app.url } }, false);
    try {
      expect(s.lines).toContain("stage  captured · live view off (--no-live)");
      expect((await get(s.port, "/")).body).not.toContain("frame-src");
      expect(JSON.parse((await get(s.port, "/data/stage.json")).body)).toMatchObject({ live: false });
    } finally { s.close(); }
  });
});
