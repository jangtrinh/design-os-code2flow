import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { loadConfig } from "../schema/code2flow-config.js";
import { featureIdFor, type CanonicalFlowGraph } from "../schema/index.js";
import { loadManifest } from "../schema/story-manifest.js";
import { shotFiles } from "../snapshot/shot-file-key.js";
import type { SnapshotRun } from "../snapshot/snapshot-runner.js";

const MAX_SINGLE_FILE = 14 * 1024 * 1024;

/** Text placed inside `<title>` or a JSON `<script>` block must never be able to close that element. */
const escapeText = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const escapeJsonForScript = (json: string): string => json.replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
/** Feature ids can come from the target repo's manifest/config, or fall back to a URL segment: never trust them as a path. */
const safeFileName = (s: string): string => basename(s).replace(/[^A-Za-z0-9._-]/g, "-");

/**
 * `code2flow export <repo> [--feature id] [--out dir]`: one self-contained HTML for the whole app when it fits
 * in 14 MB, otherwise one per feature. Per-feature files bound SIZE, not audience: the full graph (every route,
 * file path and code snippet) is inside each; only the screenshots are split. Data is inlined as base64 JSON.
 */
export async function exportCommand(repoArg: string, viewerDir: string, flags: Record<string, string | true>, log: (line: string) => void = console.log): Promise<string[]> {
  const rootDir = resolve(repoArg); const dataDir = join(rootDir, ".code2flow");
  const read = <T>(name: string, fallback: T): T => (existsSync(join(dataDir, name)) ? (JSON.parse(readFileSync(join(dataDir, name), "utf8")) as T) : fallback);
  const graph = read<CanonicalFlowGraph | null>("graph.json", null); if (!graph) throw new Error(`no graph.json in ${dataDir}: run \`code2flow scan\` first`);
  const meta = read<Record<string, { width: number; height: number; dialog?: unknown }>>("shots-meta.json", {}); const titles = read("titles.json", {}); const urls = read("url-map.json", {});
  const run = read<SnapshotRun | null>("snapshot-run.json", null);
  const config = loadConfig(rootDir); const manifest = loadManifest(rootDir);
  const features = (manifest?.features ?? config.features ?? []).map((f, i) => ({ ...f, order: f.order ?? i }));
  const js = readFileSync(join(viewerDir, "viewer.js"), "utf8"); const css = readFileSync(join(viewerDir, "viewer.css"), "utf8"); const html = readFileSync(join(viewerDir, "index.html"), "utf8");
  const outDir = typeof flags.out === "string" ? resolve(flags.out) : join(dataDir, "export"); mkdirSync(outDir, { recursive: true });
  const product = basename(rootDir);
  const dataUri = (file: string): string | null => (existsSync(file) ? "data:image/jpeg;base64," + readFileSync(file).toString("base64") : null);
  const pack = (screenIds: Set<string> | null, label: string): string => {
    const full: Record<string, string> = {}, dialog: Record<string, string> = {};
    for (const s of graph.screens) { if (screenIds && !screenIds.has(s.id)) continue; const files = shotFiles(join(dataDir, "shots"), s.id); const f = dataUri(files.full); if (f) full[s.id] = f; const d = dataUri(files.dialog); if (d) dialog[s.id] = d; }
    // Graph/titles carry code snippets with `<div` and arrows: base64 keeps them out of the HTML parser's (and linters') way.
    // The shots block is plain JSON, so `<` in a screen id (a directory name in the target repo) is escaped as \\u003c.
    const b64 = Buffer.from(JSON.stringify({ graph, meta, titles, urls, stories: manifest?.stories ?? [], features, productName: product })).toString("base64");
    const shotsJson = escapeJsonForScript(JSON.stringify({ full, dialog }));
    const boot = `<script id="c2f-shots" type="application/json">${shotsJson}</script><script id="c2f-data" type="text/plain">${b64}</script><script>window.CODE2FLOW_DATA=(()=>{const d=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(document.getElementById("c2f-data").textContent.trim()),c=>c.charCodeAt(0))));const s=JSON.parse(document.getElementById("c2f-shots").textContent);d.shotUrl=(id)=>s.full[id]??null;d.dialogUrl=(id)=>s.dialog[id]??null;return d;})();</script>`;
    // Function replacements: `$&`-style patterns inside the viewer source must be copied literally.
    return html.replace('<link rel="stylesheet" href="./viewer.css">', () => `<style>${css}</style>`)
      .replace('<script type="module" src="./viewer.js"></script>', () => `${boot}\n<script type="module">${js}</script>`)
      .replace("<title>Code2Flow</title>", () => `<title>${escapeText(product)} · ${escapeText(label)} · Code2Flow</title>`);
  };
  const routeOf = (id: string): string => graph.screens.find((s) => s.id === id)?.parentScreenId ?? id;
  const featureOf = (id: string): string => featureIdFor(routeOf(id), features);
  const allFeatureIds = [...new Set(graph.screens.map((s) => featureOf(s.id)))];
  const wantFeature = typeof flags.feature === "string" ? flags.feature : null;
  if (wantFeature && !allFeatureIds.includes(wantFeature)) throw new Error(`unknown --feature "${wantFeature}"; features in this graph: ${allFeatureIds.join(", ")}`);
  if (run?.authenticated) log(`export  note: screenshots were captured with a signed-in session (${run.at}); they may show real account data`);
  const written: string[] = [];
  const write = (page: string, file: string, label: string): void => { writeFileSync(file, page); written.push(file); log(`export  ${file} (${(Buffer.byteLength(page) / 1e6).toFixed(1)} MB, ${label})`); };
  if (!wantFeature) {
    const whole = pack(null, "all features");
    if (Buffer.byteLength(whole) <= MAX_SINGLE_FILE) { write(whole, join(outDir, safeFileName(`${product}-flows.html`)), "all features"); return written; }
    log(`export  whole app exceeds ${MAX_SINGLE_FILE / 1024 / 1024} MB; writing one file per feature (each still carries the full graph, screenshots split)`);
  }
  for (const fid of wantFeature ? [wantFeature] : allFeatureIds) {
    const screens = new Set(graph.screens.filter((s) => featureOf(s.id) === fid).map((s) => s.id));
    write(pack(screens, fid), join(outDir, safeFileName(`${product}-${fid}.html`)), `feature ${fid}, ${screens.size} screens`);
  }
  return written;
}
