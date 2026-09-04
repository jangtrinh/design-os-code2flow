import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Serves tiny pages that behave like an app-shell Next app: inner scroller, a dialog on ?drawer=, links to dynamic routes. */
export function startStaticApp(): Promise<{ server: Server; url: string }> {
  const page = (title: string, body: string, tall = false, dialog = "") => `<!doctype html><title>${title}</title><body style="margin:0"><div style="height:100vh;display:flex"><nav style="width:200px"><a href="/">Home</a> <a href="/orders">Orders</a></nav><main style="flex:1;overflow-y:auto;height:100vh"><h1>${title}</h1>${body}${tall ? '<div style="height:1400px">tall content</div><p id="bottom">bottom marker</p>' : ""}</main></div>${dialog}</body>`;
  const server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    res.setHeader("content-type", "text/html");
    if (u.pathname === "/") return res.end(page("Home", '<a href="/blog/first-post">First post</a> <a href="/blog/second-post">Second post</a>'));
    if (u.pathname === "/orders") { const d = u.searchParams.get("drawer") === "details" ? '<div role="dialog" aria-labelledby="dt" style="position:fixed;top:100px;left:400px;width:420px;height:200px;background:#fff;border:1px solid #000"><h2 id="dt">Order details</h2><p>Line items</p></div>' : ""; return res.end(page("Orders", '<div role="tablist"><button role="tab" aria-selected="true">Open</button></div>', true, d)); }
    if (u.pathname === "/hover") return res.end(page("Hover", '<button data-testid="help-tip">Help</button><div id="tip" role="tooltip" hidden>Help text</div><script>document.querySelector("[data-testid=help-tip]").addEventListener("mouseenter",()=>{document.getElementById("tip").hidden=false})</script>'));
    if (u.pathname.startsWith("/blog/")) return res.end(page("Post " + u.pathname.split("/")[2], "<p>post body</p>"));
    if (u.pathname === "/pricing") return res.end(page("Pricing plans", `<p>plans</p><div id="late"></div><script>setTimeout(() => { document.getElementById("late").innerHTML = '<div style="height:900px">late block</div><p id="late-end">late end</p>'; }, 900);</script>`));
    res.statusCode = 404; res.end(page("Not found", ""));
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}` })));
}

/** Serves the scripted-login fixture with a real browser-side localStorage session. */
export function startLoginApp(): Promise<{ server: Server; url: string }> {
  const fixture = new URL("../../fixtures/synthetic/login-app/", import.meta.url);
  const page = (name: string): string => readFileSync(fileURLToPath(new URL(name, fixture)), "utf8");
  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? "/", "http://x").pathname;
    res.setHeader("content-type", "text/html");
    if (pathname === "/login.html") return res.end(page("login.html"));
    if (pathname === "/dashboard.html") return res.end(page("dashboard.html"));
    res.statusCode = 404; res.end("not found");
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}` })));
}
