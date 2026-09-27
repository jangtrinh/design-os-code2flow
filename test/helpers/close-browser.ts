import type { BrowserLike } from "../../src/snapshot/playwright-runtime.js";

/**
 * `browser.close()` resolves only when the Chrome PROCESS has exited and Playwright has removed its profile dir
 * (playwright-core `gracefullyClose`: `Browser.close` over CDP, then wait for the process `close` event — no
 * timeout of its own). With several browser suites in flight, that exit outlasted vitest's 10 s hook default
 * (2026-09-26). Closing every context first lets the renderers go before the browser process, so the wait is
 * for one process exit, not for N contexts tearing down under contention.
 */
export async function closeBrowser(browser: BrowserLike | undefined): Promise<void> {
  if (!browser) return;
  const contexts = (browser as BrowserLike & { contexts?: () => { close(): Promise<void> }[] }).contexts?.() ?? [];
  await Promise.all(contexts.map((c) => c.close().catch(() => {})));
  await browser.close();
}
/** Hook bound for a full Chrome exit: vitest's own hook default when a browser is involved (30 s), not the 10 s Node default. */
export const BROWSER_HOOK_MS = 30_000;
