import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { main } from "../src/cli/index.js";
import { formatRunSummary } from "../src/cli/run-command.js";
import { copyFixture } from "./helpers/fixture-copy.js";
import { startStaticApp } from "./helpers/static-app-server.js";

function command(argv: string[]): Promise<{ code: number; lines: string[] }> {
  const lines: string[] = []; const originalLog = console.log; const originalError = console.error;
  console.log = (line: string) => lines.push(String(line)); console.error = (line: string) => lines.push(String(line));
  return main(argv).then((code) => ({ code, lines })).finally(() => { console.log = originalLog; console.error = originalError; });
}

function answers(url: string): Promise<boolean> {
  const u = new URL(url);
  return new Promise((ok) => { const req = request({ host: u.hostname, port: u.port, path: "/" }, (res) => { res.resume(); ok(true); }); req.on("error", () => ok(false)); req.end(); });
}

describe("run, init, and paths (seams: target repo artifacts and CLI exit codes)", () => {
  const runFx = copyFixture("run-url"); const devFx = copyFixture("run-dev"); const initFx = copyFixture("init");
  afterAll(() => { runFx.cleanup(); devFx.cleanup(); initFx.cleanup(); });

  it("adds the exact login instruction to the run summary without changing lint exit semantics", () => {
    expect(formatRunSummary({ screens: 31, edges: 86, captured: 28, failed: 0, lintErrors: 3, loginGated: 22, repo: "/tmp/sodeal", serverUrl: "http://127.0.0.1:4319" })).toBe("run  31 screens, 86 edges, 28 captured, 0 failed, 3 lint error(s)\n22 screens hit the sign-in page → run: code2flow login /tmp/sodeal --url http://127.0.0.1:4319");
  });

  it("run --url writes the map, shots, export, and a summary while preserving lint exit semantics", async () => {
    const app = await startStaticApp();
    try {
      const result = await command(["run", runFx.dir, "--url", app.url]);
      expect(result.code).toBe(1); // the fixture deliberately contains one broken link
      const out = join(runFx.dir, ".code2flow");
      expect(existsSync(join(out, "graph.json"))).toBe(true);
      expect(existsSync(join(out, "shots-meta.json"))).toBe(true);
      expect(JSON.parse(readFileSync(join(out, "run-summary.json"), "utf8"))).toMatchObject({ serverUrl: app.url, startedServer: false });
      expect(readFileSync(join(out, "run-summary.json"), "utf8")).toMatch(/"exports": \[/);
    } finally { app.server.close(); }
  }, 120_000);

  it("run --url with nothing listening is an operational failure (exit 2), not a lint failure", async () => {
    const result = await command(["run", devFx.dir, "--url", "http://127.0.0.1:1"]);
    expect(result.code).toBe(2);
    expect(result.lines.join("\n")).toMatch(/nothing answers at http:\/\/127\.0\.0\.1:1/);
    expect(existsSync(join(devFx.dir, ".code2flow", "run-summary.json"))).toBe(false);
  });

  it("run refuses an already answered configured port instead of picking another one", async () => {
    const app = await startStaticApp();
    try {
      writeFileSync(join(devFx.dir, "code2flow.config.json"), JSON.stringify({ serverUrl: app.url }));
      const result = await command(["run", devFx.dir]);
      expect(result.code).toBe(2);
      expect(result.lines.join("\n")).toMatch(/fixed-port rule: never pick another port/);
      expect(existsSync(join(devFx.dir, ".code2flow", "run-summary.json"))).toBe(false);
    } finally { app.server.close(); }
  });

  it("run --dev stops the owned process group after writing artifacts", async () => {
    const server = join(devFx.dir, "tiny-server.cjs"); const port = 43891; const url = `http://127.0.0.1:${port}`;
    writeFileSync(server, `require('http').createServer((_, r) => r.end('ok')).listen(${port}, '127.0.0.1')`);
    writeFileSync(join(devFx.dir, "code2flow.config.json"), JSON.stringify({ serverUrl: url }));
    const result = await command(["run", devFx.dir, "--dev", `node ${server}`]);
    expect(result.lines.some((line) => line.startsWith("run  starting the app's dev server: node "))).toBe(true); // the repo-supplied command is echoed before it runs (2026-09-04 audit M5)
    expect(result.code).toBe(1);
    expect(existsSync(join(devFx.dir, ".code2flow", "run-summary.json"))).toBe(true);
    expect(await answers(url)).toBe(false);
  }, 120_000);

  it("run --dev interrupted with SIGINT still stops the dev server it started (fixed port stays free)", async () => {
    const sigFx = copyFixture("run-sigint"); const port = 43892; const url = `http://127.0.0.1:${port}`;
    try {
      const server = join(sigFx.dir, "tiny-server.cjs");
      writeFileSync(server, `require('http').createServer((_, r) => r.end('ok')).listen(${port}, '127.0.0.1')`);
      writeFileSync(join(sigFx.dir, "code2flow.config.json"), JSON.stringify({ serverUrl: url }));
      // node --import tsx (no npx wrapper in between): the signal must reach the CLI process itself
      const child = spawn(process.execPath, ["--import", "tsx", "src/cli/index.ts", "run", sigFx.dir, "--dev", `node ${server}`], { cwd: process.cwd(), stdio: "ignore" });
      const t0 = Date.now(); while (!(await answers(url))) { if (Date.now() - t0 > 60_000) throw new Error("dev server never answered"); await new Promise((r) => setTimeout(r, 250)); }
      child.kill("SIGINT");
      const code = await new Promise<number | null>((ok) => child.on("exit", (c) => ok(c)));
      expect(code).toBe(130);
      const t1 = Date.now(); while (await answers(url)) { if (Date.now() - t1 > 8_000) break; await new Promise((r) => setTimeout(r, 200)); }
      expect(await answers(url)).toBe(false);
    } finally { sigFx.cleanup(); }
  }, 90_000);

  it("init derives the configured port, copies the shipped skills, and is fully idempotent", async () => {
    rmSync(join(initFx.dir, "code2flow.config.json"));
    writeFileSync(join(initFx.dir, ".project-agent.md"), "---\nlocalhost_port: 4444\n---\n");
    expect((await command(["init", initFx.dir])).code).toBe(0);
    expect(existsSync(join(initFx.dir, ".claude", "skills", "code2flow-map-codebase", "SKILL.md"))).toBe(true);
    expect(existsSync(join(initFx.dir, ".claude", "skills", "code2flow-answer-flow-questions", "SKILL.md"))).toBe(true);
    expect(JSON.parse(readFileSync(join(initFx.dir, "code2flow.config.json"), "utf8"))).toMatchObject({ serverUrl: "http://127.0.0.1:4444", features: [], routeExamples: {} });
    expect(readFileSync(join(initFx.dir, ".gitignore"), "utf8")).toContain(".code2flow/");
    expect(readFileSync(join(initFx.dir, "AGENTS.md"), "utf8")).toContain("## Code2Flow");
    const before = ["code2flow.config.json", ".gitignore", "AGENTS.md"].map((f) => readFileSync(join(initFx.dir, f), "utf8"));
    const second = await command(["init", initFx.dir]);
    expect(second.code).toBe(0); expect(second.lines.join("\n")).toMatch(/already initialised/);
    expect(["code2flow.config.json", ".gitignore", "AGENTS.md"].map((f) => readFileSync(join(initFx.dir, f), "utf8"))).toEqual(before);
  });

  it("paths reports a source-evidenced shortest route and rejects unknown screen ids", async () => {
    const pathsFx = copyFixture("paths"); const repo = pathsFx.dir; // own copy + own scan: the in-repo fixture has no graph.json on a clean checkout
    const scanned = await command(["scan", repo]); expect(scanned.code).toBe(0);
    const found = await command(["paths", repo, "--from", "/", "--to", "/docs/[...parts]"]);
    expect(found.code).toBe(0); expect(found.lines.join("\n")).toMatch(/\/ -\[.*\]-> \/pricing[\s\S]*Checkout.*\/docs\/\[\.\.\.parts\]/);
    const unknown = await command(["paths", repo, "--from", "/wat", "--to", "/"]);
    expect(unknown.code).toBe(2); expect(unknown.lines.join("\n")).toMatch(/closest ids/);
    const invalidMax = await command(["paths", repo, "--from", "/", "--to", "/pricing", "--max", "abc"]);
    expect(invalidMax.code).toBe(2); expect(invalidMax.lines).toEqual(["paths: --max must be a positive integer no greater than 8"]);
    pathsFx.cleanup();
  });
});
