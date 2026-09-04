import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { launchBrowser, resolvePlaywright } from "../snapshot/playwright-runtime.js";

/**
 * `code2flow login <repo> --url <devServer>`: opens a headed browser on the app; the user signs in by hand;
 * when they close the window (or press Enter here) the session is saved to .code2flow/storage-state.json,
 * which `snapshot` picks up automatically. Nothing about the credentials is read by the tool.
 */
export async function loginCommand(repoArg: string, flags: Record<string, string | true>, log: (line: string) => void = console.log): Promise<string> {
  const rootDir = resolve(repoArg); const url = typeof flags.url === "string" ? flags.url : null;
  if (!url) throw new Error("login: pass --url http://127.0.0.1:PORT");
  const out = join(rootDir, ".code2flow", "storage-state.json"); mkdirSync(join(rootDir, ".code2flow"), { recursive: true });
  const pw = resolvePlaywright(rootDir);
  const browser = await launchBrowser(pw, false);
  const ctx = (await browser.newContext({ viewport: { width: 1440, height: 900 } })) as unknown as { newPage(): Promise<{ goto(u: string, o: Record<string, unknown>): Promise<unknown>; waitForEvent(e: string, o?: Record<string, unknown>): Promise<unknown> }>; storageState(o: { path: string }): Promise<unknown>; close(): Promise<void> };
  const page = await ctx.newPage(); await page.goto(url, { waitUntil: "load", timeout: 60000 });
  log(`login  sign in in the browser window, then press Enter here (or close the window) to save the session → ${out}`);
  await new Promise<void>((done) => { const onEnter = (): void => { process.stdin.off("data", onEnter); done(); }; process.stdin.on("data", onEnter); page.waitForEvent("close", { timeout: 0 }).then(() => done(), () => done()); });
  await ctx.storageState({ path: out }); await browser.close();
  log(`login  saved ${out}; \`code2flow snapshot\` will use it (or pass --storage-state)`);
  return out;
}
