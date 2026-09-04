import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { exportCommand } from "./export-command.js";
import { printDocument, type PrintPage } from "../snapshot/print-document.js";
import { RenderUsageError, renderViews } from "../snapshot/render-views.js";
import { launchBrowser, resolvePlaywright, type PageLike } from "../snapshot/playwright-runtime.js";

interface Rect { width: number; height: number }
interface SummaryView { id: string; file?: string; width?: number; height?: number; chromeHidden?: boolean; error?: string }
const MAX_VIEWPORT = 4000; const MARGIN = 48;

export async function renderCommand(repoArg: string, viewerDir: string, flags: Record<string, string | true>, log: (line: string) => void = console.log): Promise<number> {
  const rootDir = resolve(repoArg); const outDir = typeof flags.out === "string" ? resolve(flags.out) : join(rootDir, ".code2flow", "render");
  const scale = parseScale(flags.scale); const explicitPng = flags.png === true; const explicitPdf = flags.pdf === true; const wantsPng = explicitPng || (!explicitPng && !explicitPdf); const wantsPdf = explicitPdf || (!explicitPng && !explicitPdf);
  let views; try { views = renderViews(rootDir, flags); } catch (error) { if (error instanceof RenderUsageError) throw error; throw error; }
  if (!views.length) throw new RenderUsageError("no views matched the requested filters");
  mkdirSync(outDir, { recursive: true });
  const product = basename(rootDir); const htmlFile = await resolveExportFile(rootDir, viewerDir, log);
  const summary: { at: string; views: SummaryView[] } = { at: new Date().toISOString(), views: [] }; const pages: PrintPage[] = [];
  const browser = await launchBrowser(resolvePlaywright(rootDir), true);
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: scale }); const page = await context.newPage();
    for (const view of views) {
      try {
        const rect = await captureView(page, `${pathToFileURL(htmlFile).href}?render=print${view.hash}`, outDir, view.file);
        summary.views.push({ id: view.id, file: view.file, ...rect }); log(`render  ${join(outDir, view.file)} (${rect.width}×${rect.height})`);
        pages.push({ title: view.title, png: readFileSync(join(outDir, view.file)), width: Math.ceil(rect.width / scale), height: Math.ceil(rect.height / scale) });
      } catch (error) { summary.views.push({ id: view.id, error: (error as Error).message }); log(`render-failed  ${view.id}: ${(error as Error).message}`); }
    }
    if (wantsPdf && pages.length) { const file = join(outDir, `${safe(product)}-flows.pdf`); await page.setContent(printDocument(pages), { waitUntil: "load" }); await page.pdf({ path: file, printBackground: true, preferCSSPageSize: true }); log(`render  ${file}`); }
    await context.close();
  } finally { await browser.close(); }
  if (!wantsPng) for (const view of summary.views) if (view.file) { /* PNGs are the required local PDF source and remain as the hand-outs. */ }
  writeFileSync(join(outDir, "render-summary.json"), JSON.stringify(summary, null, 2) + "\n");
  const failed = summary.views.filter((view) => view.error).length; log(`render  summary: ${summary.views.length - failed}/${summary.views.length} views rendered${failed ? `, ${failed} failed` : ""}`);
  return failed ? 1 : 0;
}

async function resolveExportFile(rootDir: string, viewerDir: string, log: (line: string) => void): Promise<string> {
  const files = await exportCommand(rootDir, viewerDir, {}, log); return files[0];
}
async function captureView(page: PageLike, url: string, outDir: string, file: string): Promise<Rect> {
  await page.goto(url, { waitUntil: "load" });
  const selector = url.includes("#map") ? "#view g" : "#view [data-node]";
  const found = await page.locator(selector).first().count(); if (!found) throw new Error(`view did not mount (${selector})`);
  await page.evaluate<void>("document.documentElement.dataset.render='print'");
  await page.keyboard.press("f"); await page.waitForTimeout(300);
  const bounds = await page.evaluate<Rect>(`(()=>{const view=document.querySelector('#view')?.getBoundingClientRect();if(!view)throw new Error('missing #view');return {width:Math.ceil(view.width),height:Math.ceil(view.height)}})()`);
  const width = Math.min(MAX_VIEWPORT, Math.max(1200, bounds.width + MARGIN * 2));
  const height = Math.min(MAX_VIEWPORT, Math.max(500, bounds.height + MARGIN * 2));
  await page.setViewportSize({ width, height });
  await page.keyboard.press("f"); await page.waitForTimeout(300);
  const chromeHidden = await page.evaluate<boolean>(`(()=>['header','#rail','#drawer','#hud','#phud','#palette','.toolbar'].every((selector)=>[...document.querySelectorAll(selector)].every((element)=>getComputedStyle(element).display==='none')))()`);
  if (!chromeHidden) throw new Error("print mode left viewer chrome visible");
  await page.locator("#stage").first().screenshot({ path: join(outDir, file), type: "png" });
  return { width, height, chromeHidden } as Rect & { chromeHidden: boolean };
}
function parseScale(value: string | true | undefined): number { const scale = value === undefined ? 2 : Number(value); if (!Number.isFinite(scale) || scale <= 0 || scale > 4) throw new RenderUsageError("--scale must be a number greater than 0 and no greater than 4"); return scale; }
const safe = (value: string): string => value.replace(/[^A-Za-z0-9._-]/g, "-");
