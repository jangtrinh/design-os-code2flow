import { createRequire } from "node:module";
import { join } from "node:path";

/** The subset of Playwright we use, typed loosely so the tool has no hard dependency on it. */
export interface PlaywrightLike {
  chromium: { launch(opts: { channel?: string; headless: boolean }): Promise<BrowserLike> };
}
export interface BrowserLike { newContext(opts: Record<string, unknown>): Promise<ContextLike>; close(): Promise<void> }
export interface ContextLike { newPage(): Promise<PageLike>; close(): Promise<void> }
export interface PageLike {
  goto(url: string, opts: Record<string, unknown>): Promise<unknown>;
  waitForLoadState(state: string, opts?: Record<string, unknown>): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  evaluate<T>(source: string): Promise<T>;
  screenshot(opts: Record<string, unknown>): Promise<unknown>;
  locator(sel: string): { first(): { count(): Promise<number>; boundingBox(): Promise<{ width: number; height: number } | null>; screenshot(opts: Record<string, unknown>): Promise<unknown> } };
  url(): string;
  close(): Promise<void>;
}

/**
 * Resolves Playwright from the target repo first (it usually has it for its own e2e), then from
 * code2flow's own install. Never downloads anything: `channel: "chrome"` uses the Chrome already on the machine.
 */
export function resolvePlaywright(targetRoot: string): PlaywrightLike {
  const attempts = [join(targetRoot, "package.json"), join(process.cwd(), "package.json"), import.meta.url];
  for (const from of attempts) {
    try {
      const req = createRequire(from);
      for (const name of ["playwright", "@playwright/test"]) {
        try { return req(name) as PlaywrightLike; } catch { /* try next name */ }
      }
    } catch { /* try next location */ }
  }
  throw new Error("Playwright not found. Install it in the target repo or globally: npm i -D playwright (no browser download needed; the installed Chrome is used).");
}

export async function launchBrowser(pw: PlaywrightLike, headless = true): Promise<BrowserLike> {
  try { return await pw.chromium.launch({ channel: "chrome", headless }); }
  catch { return await pw.chromium.launch({ headless }); } // bundled chromium if the user installed it
}
