import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { main } from "../src/cli/index.js";
import { loginCommand } from "../src/cli/login-command.js";
import { runCommand } from "../src/cli/run-command.js";
import { copyFixture } from "./helpers/fixture-copy.js";
import { startLoginApp } from "./helpers/static-app-server.js";

const EMAIL_ENV = "CODE2FLOW_LOGIN_TEST_EMAIL";
const PASSWORD_ENV = "CODE2FLOW_LOGIN_TEST_PASSWORD";
const PASSWORD = "never-log-this-secret";
const viewerDir = new URL("../out/viewer", import.meta.url).pathname;

function config(url: string, selectors?: Record<string, string>): string {
  return JSON.stringify({
    serverUrl: url,
    login: { path: "/login.html", emailEnv: EMAIL_ENV, passwordEnv: PASSWORD_ENV, successUrl: "/dashboard.html", ...(selectors ? { selectors } : {}) },
  });
}

function command(argv: string[]): Promise<{ code: number; lines: string[] }> {
  const lines: string[] = []; const originalLog = console.log; const originalError = console.error;
  console.log = (line: string) => lines.push(String(line)); console.error = (line: string) => lines.push(String(line));
  return main(argv).then((code) => ({ code, lines })).finally(() => { console.log = originalLog; console.error = originalError; });
}

afterEach(() => { delete process.env[EMAIL_ENV]; delete process.env[PASSWORD_ENV]; });

describe("scripted login (seams: CLI exit, storage state, and run summary)", () => {
  it("writes a localStorage session without logging the password", async () => {
    const fx = copyFixture("scripted-login"); const app = await startLoginApp(); const lines: string[] = [];
    process.env[EMAIL_ENV] = "person@example.test"; process.env[PASSWORD_ENV] = PASSWORD;
    writeFileSync(join(fx.dir, "code2flow.config.json"), config(app.url));
    try {
      await loginCommand(fx.dir, { url: app.url }, (line) => lines.push(line));
      const state = readFileSync(join(fx.dir, ".code2flow", "storage-state.json"), "utf8");
      expect(state).toContain("session");
      expect(lines.join("\n")).not.toContain(PASSWORD);
    } finally { app.server.close(); fx.cleanup(); }
  }, 30_000);

  it("exits 2 with only the missing environment variable name", async () => {
    const fx = copyFixture("scripted-login-missing"); const app = await startLoginApp();
    writeFileSync(join(fx.dir, "code2flow.config.json"), config(app.url));
    try {
      const result = await command(["login", fx.dir, "--url", app.url]);
      expect(result.code).toBe(2);
      expect(result.lines).toEqual([`login: missing ${EMAIL_ENV}`]);
    } finally { app.server.close(); fx.cleanup(); }
  });

  it("names a configured selector that does not match", async () => {
    const fx = copyFixture("scripted-login-selector"); const app = await startLoginApp();
    process.env[EMAIL_ENV] = "person@example.test"; process.env[PASSWORD_ENV] = PASSWORD;
    writeFileSync(join(fx.dir, "code2flow.config.json"), config(app.url, { email: "#not-an-email" }));
    try {
      const result = await command(["login", fx.dir, "--url", app.url]);
      expect(result.code).toBe(2);
      expect(result.lines).toEqual(["login: selector #not-an-email did not match"]);
    } finally { app.server.close(); fx.cleanup(); }
  }, 30_000);

  it("runs the configured login before snapshot and skips cleanly without credentials", async () => {
    const fx = copyFixture("scripted-login-run"); const app = await startLoginApp(); const lines: string[] = [];
    process.env[EMAIL_ENV] = "person@example.test"; process.env[PASSWORD_ENV] = PASSWORD;
    writeFileSync(join(fx.dir, "code2flow.config.json"), config(app.url));
    try {
      await runCommand(fx.dir, viewerDir, { url: app.url }, (line) => lines.push(line));
      const state = join(fx.dir, ".code2flow", "storage-state.json");
      expect(existsSync(state)).toBe(true);
      expect(lines).toContain("login: ok");
      rmSync(state);
      delete process.env[EMAIL_ENV];
      const skipped: string[] = [];
      await runCommand(fx.dir, viewerDir, { url: app.url }, (line) => skipped.push(line));
      expect(skipped).toContain(`login: skipped (no ${EMAIL_ENV})`);
    } finally { app.server.close(); fx.cleanup(); }
  }, 120_000);
});
