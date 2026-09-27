import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const STAGE_SPA = fileURLToPath(new URL("../../fixtures/synthetic/stage-spa/", import.meta.url));
const BRIDGE = fileURLToPath(new URL("../../dist/stage-bridge/index.js", import.meta.url));
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };

/**
 * Serves the stage-spa fixture like a dev server: `/orders` and `/orders.html` both answer, `/stage-bridge.js` is the
 * built bridge. `viewerOrigins` lets a test viewer on an ephemeral port talk to the bridge (the product default is
 * the viewer's fixed port 4317); `frameOptions` sends an X-Frame-Options header to test the refusal path.
 */
export function startStageSpa(opts: { dir?: string; viewerOrigins?: string[] | (() => string[]); frameOptions?: string; noBridge?: boolean } = {}): Promise<{ server: Server; url: string }> {
  const dir = opts.dir ?? STAGE_SPA;
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    if (opts.frameOptions) res.setHeader("x-frame-options", opts.frameOptions);
    if (path === "/stage-bridge.js") { res.setHeader("content-type", TYPES[".js"]); return res.end(readFileSync(BRIDGE)); }
    const file = path === "/" ? "index.html" : existsSync(join(dir, path)) ? path.slice(1) : existsSync(join(dir, path + ".html")) ? path.slice(1) + ".html" : null;
    if (!file || file.includes("..")) { res.statusCode = 404; return res.end("not found"); }
    let body = readFileSync(join(dir, file), "utf8");
    const origins = typeof opts.viewerOrigins === "function" ? opts.viewerOrigins() : opts.viewerOrigins;
    if (file === "stage-app.js" && origins) body = body.replace("installStageBridge({", `installStageBridge({ viewerOrigins: ${JSON.stringify(origins)},`);
    if (file === "stage-app.js" && opts.noBridge) body = body.replace(/^import \{ installStageBridge \}.*$/m, "").replace(/^installStageBridge\(.*$/m, ""); // an app that never installed the bridge
    res.setHeader("content-type", TYPES[extname(file)] ?? "text/plain"); res.end(body);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}` })));
}

/** A private copy of the fixture, scanned and captured against its own server, plus an offline export. */
export async function prepareStageSpa(viewerDir: string, appOpts: Parameters<typeof startStageSpa>[0] = {}): Promise<{ dir: string; html: string; app: { server: Server; url: string }; cleanup: () => void }> {
  const { cpSync, mkdtempSync, rmSync } = await import("node:fs"); const { tmpdir } = await import("node:os");
  const { scanCommand } = await import("../../src/cli/scan-command.js"); const { snapshotCommand } = await import("../../src/cli/snapshot-command.js"); const { exportCommand } = await import("../../src/cli/export-command.js");
  const dir = mkdtempSync(join(tmpdir(), "c2f-stage-spa-")); cpSync(STAGE_SPA, dir, { recursive: true, filter: (src) => !src.includes("/.code2flow") });
  const app = await startStageSpa({ ...appOpts, dir });
  await scanCommand(dir, () => {}); await snapshotCommand(dir, { url: app.url }, () => {});
  const [html] = await exportCommand(dir, viewerDir, {}, () => {});
  return { dir, html, app, cleanup: () => { app.server.close(); rmSync(dir, { recursive: true, force: true }); } };
}
