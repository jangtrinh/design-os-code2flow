import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { basename, extname, join, resolve } from "node:path";
import { loadConfig } from "../schema/code2flow-config.js";
import { shotFileKey } from "../snapshot/shot-file-key.js";

const PORT = 4317; // fixed localhost port contract (.project-agent.md)
const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".jpg": "image/jpeg" };
/** Only these Host values are served: graph.json carries the target repo's source snippets, and a DNS-rebinding page must not read them same-origin. */
const HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`, `[::1]:${PORT}`]);

/** `code2flow serve <repo>`: static viewer bundle + JSON from <repo>/.code2flow + screenshots, on 127.0.0.1:4317 (strict). */
export async function serveCommand(repoArg: string, viewerDir: string, log: (line: string) => void = console.log): Promise<{ close: () => void; url: string }> {
  const rootDir = resolve(repoArg); const dataDir = join(rootDir, ".code2flow");
  if (!existsSync(join(dataDir, "graph.json"))) throw new Error(`no ${join(dataDir, "graph.json")}: run \`code2flow scan\` (and \`snapshot\`) first`);
  if (!existsSync(join(viewerDir, "index.html"))) throw new Error(`viewer bundle missing at ${viewerDir}: run \`npm run build:viewer\``);
  const config = loadConfig(rootDir);
  const graph = JSON.parse(readFileSync(join(dataDir, "graph.json"), "utf8")) as { screens: { id: string }[] };
  const shotIndex = Object.fromEntries(graph.screens.map((s) => [s.id, shotFileKey(s.id)]));
  const product = (() => { try { return (JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8")) as { name?: string }).name ?? basename(rootDir); } catch { return basename(rootDir); } })();
  const handle = (req: IncomingMessage, res: ServerResponse): void => {
    const reply = (code: number, text: string): void => { res.statusCode = code; res.setHeader("content-type", "text/plain; charset=utf-8"); res.end(text); };
    if (!HOSTS.has(req.headers.host ?? "")) return reply(403, "forbidden: unexpected Host header");
    let path: string; try { path = decodeURIComponent((req.url ?? "/").split("?")[0]); } catch { return reply(400, "bad request: malformed URL"); }
    const send = (file: string): void => {
      if (!existsSync(file) || !statSync(file).isFile()) return reply(404, "not found");
      res.setHeader("content-type", MIME[extname(file)] ?? "application/octet-stream");
      const stream = createReadStream(file); stream.on("error", () => { if (!res.headersSent) res.statusCode = 500; res.end(); }); stream.pipe(res);
    };
    const json = (obj: unknown): void => { res.setHeader("content-type", MIME[".json"]); res.end(JSON.stringify(obj)); };
    if (path === "/data/info.json") return json({ product, shotIndex });
    if (path === "/data/config.json") return json(config);
    if (path === "/data/stories.json") return send(join(rootDir, "code2flow.stories.json"));
    if (path.startsWith("/data/")) return send(join(dataDir, basename(path)));
    if (path.startsWith("/shots/")) return send(join(dataDir, "shots", basename(path)));
    if (path === "/" || path === "/index.html") return send(join(viewerDir, "index.html"));
    return send(join(viewerDir, basename(path)));
  };
  const server = createServer((req, res) => { try { handle(req, res); } catch (err) { if (!res.headersSent) res.statusCode = 500; res.end(`error: ${(err as Error).message}`); } });
  server.on("clientError", (_err, socket) => socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"));
  const url = `http://127.0.0.1:${PORT}`;
  await new Promise<void>((ok, fail) => { server.once("error", (e: NodeJS.ErrnoException) => fail(new Error(e.code === "EADDRINUSE" ? `port ${PORT} is in use (fixed port contract: stop the other process, never pick another port)` : e.message))); server.listen(PORT, "127.0.0.1", () => ok()); });
  log(`serve  ${url}  (data: ${dataDir})`);
  return { close: () => server.close(), url };
}
