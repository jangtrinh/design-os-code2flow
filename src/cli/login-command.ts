import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { launchBrowser, resolvePlaywright } from "../snapshot/playwright-runtime.js";
import { loadConfig, type LoginConfig } from "../schema/code2flow-config.js";

/** The subset of a real Playwright page/context the login flows drive; `PageLike` in playwright-runtime is narrower on purpose. */
interface LoginPage { goto(u: string, o: Record<string, unknown>): Promise<unknown>; $(sel: string): Promise<unknown | null>; fill(sel: string, v: string): Promise<void>; click(sel: string): Promise<void>; evaluate<T>(source: string): Promise<T>; waitForTimeout(ms: number): Promise<void>; waitForEvent(e: string, o?: Record<string, unknown>): Promise<unknown> }
interface LoginContext { newPage(): Promise<LoginPage>; storageState(o: { path: string }): Promise<unknown>; close(): Promise<void> }

/** A usage-level login failure (missing env var, selector, no navigation): the CLI exits 2 like other usage errors. */
export class LoginError extends Error {}

const DEFAULT_SELECTORS = { email: "input[type=email], input[name*=email i], input[autocomplete=username]", password: "input[type=password]", submit: "form button[type=submit], button[type=submit], input[type=submit]" };
const SUCCESS_TIMEOUT_MS = 20_000;

export function storageStatePath(rootDir: string): string { return join(rootDir, ".code2flow", "storage-state.json"); }

/** Which env var (if any) a scripted login would miss; the name only, never the value. */
export function missingLoginEnv(login: LoginConfig): string | null { return [login.emailEnv, login.passwordEnv].find((name) => !process.env[name]) ?? null; }

/**
 * Signs in headless with credentials read from the env vars named in `login`, then saves the session to
 * `.code2flow/storage-state.json`. Errors name the missing env var or the selector that did not match — never a value.
 */
export async function scriptedLogin(rootDir: string, baseUrl: string, login: LoginConfig, log: (line: string) => void = console.log): Promise<string> {
  const missing = missingLoginEnv(login); if (missing) throw new LoginError(`missing ${missing}`);
  const email = process.env[login.emailEnv]!, password = process.env[login.passwordEnv]!;
  const sel = { ...DEFAULT_SELECTORS, ...(login.selectors ?? {}) }; const loginPath = login.path ?? "/login";
  const out = storageStatePath(rootDir); mkdirSync(join(rootDir, ".code2flow"), { recursive: true });
  const browser = await launchBrowser(resolvePlaywright(rootDir), true);
  try {
    const ctx = (await browser.newContext({ viewport: { width: 1440, height: 900 } })) as unknown as LoginContext;
    const page = await ctx.newPage(); await page.goto(new URL(loginPath, baseUrl).href, { waitUntil: "load", timeout: 60_000 });
    for (const which of ["email", "password", "submit"] as const) if (!(await page.$(sel[which]))) throw new LoginError(`selector ${sel[which]} did not match`);
    await page.fill(sel.email, email); await page.fill(sel.password, password); await page.click(sel.submit);
    // Success = the page left the login path (or reached successUrl) within the timeout; polling keeps the narrow page contract.
    const target = login.successUrl ? new URL(login.successUrl, baseUrl).pathname : null; const deadline = Date.now() + SUCCESS_TIMEOUT_MS;
    for (;;) {
      const pathname = await page.evaluate<string>("location.pathname");
      if (target ? pathname === target : pathname !== new URL(loginPath, baseUrl).pathname) break;
      if (Date.now() > deadline) throw new LoginError(`no navigation to ${target ?? "another page"} within ${SUCCESS_TIMEOUT_MS / 1000} s`);
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(500); await ctx.storageState({ path: out });
    const state = JSON.parse(readFileSync(out, "utf8")) as { cookies?: unknown[]; origins?: { localStorage?: unknown[] }[] };
    if (!(state.cookies?.length || state.origins?.some((o) => o.localStorage?.length))) throw new LoginError("signed in but no session was saved (no cookie or localStorage entry)");
  } finally { await browser.close(); }
  log(`login  saved ${out}; \`code2flow snapshot\` and \`run\` use it`);
  return out;
}

/** The original flow: a headed window, the user signs in by hand, Enter (or closing the window) saves the session. */
async function manualLogin(rootDir: string, url: string, log: (line: string) => void): Promise<string> {
  const out = storageStatePath(rootDir); mkdirSync(join(rootDir, ".code2flow"), { recursive: true });
  const browser = await launchBrowser(resolvePlaywright(rootDir), false);
  const ctx = (await browser.newContext({ viewport: { width: 1440, height: 900 } })) as unknown as LoginContext;
  const page = await ctx.newPage(); await page.goto(url, { waitUntil: "load", timeout: 60000 });
  log(`login  sign in in the browser window, then press Enter here (or close the window) to save the session → ${out}`);
  await new Promise<void>((done) => { const onEnter = (): void => { process.stdin.off("data", onEnter); done(); }; process.stdin.on("data", onEnter); page.waitForEvent("close", { timeout: 0 }).then(() => done(), () => done()); });
  await ctx.storageState({ path: out }); await browser.close();
  log(`login  saved ${out}; \`code2flow snapshot\` will use it (or pass --storage-state)`);
  return out;
}

/** `login` config from code2flow.config.json, overridden by --email-env / --password-env / --path / --success-url. */
export function loginConfigFrom(rootDir: string, flags: Record<string, string | true>): LoginConfig | null {
  const base = loadConfig(rootDir).login; const str = (k: string): string | undefined => (typeof flags[k] === "string" ? (flags[k] as string) : undefined);
  const emailEnv = str("email-env") ?? base?.emailEnv, passwordEnv = str("password-env") ?? base?.passwordEnv;
  if (!emailEnv || !passwordEnv) return null;
  return { ...(base ?? {}), emailEnv, passwordEnv, path: str("path") ?? base?.path, successUrl: str("success-url") ?? base?.successUrl };
}

/**
 * `code2flow login <repo> --url <devServer>`: scripted when a `login` block (or --email-env/--password-env) names the
 * credential env vars, otherwise — or with --manual — the headed window where the user signs in by hand.
 */
export async function loginCommand(repoArg: string, flags: Record<string, string | true>, log: (line: string) => void = console.log): Promise<string> {
  const rootDir = resolve(repoArg); const url = typeof flags.url === "string" ? flags.url : null;
  if (!url) throw new LoginError("pass --url http://127.0.0.1:PORT");
  const login = flags.manual === true ? null : loginConfigFrom(rootDir, flags);
  return login ? scriptedLogin(rootDir, url, login, log) : manualLogin(rootDir, url, log);
}

/** Used by `run`: reuse a saved session, or sign in when the config allows it. Returns the summary line. */
export async function ensureLoginForRun(rootDir: string, serverUrl: string, login: LoginConfig | undefined, relogin: boolean): Promise<string | null> {
  if (!login) return null;
  if (!relogin && existsSync(storageStatePath(rootDir))) return "login: ok (saved session)";
  const missing = missingLoginEnv(login); if (missing) return `login: skipped (no ${missing})`;
  try { await scriptedLogin(rootDir, serverUrl, login, () => {}); return "login: ok"; } catch (error) { return `login: failed (${(error as Error).message})`; }
}
