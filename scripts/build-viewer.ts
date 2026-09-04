/** Bundles src/viewer into out/viewer (viewer.js + viewer.css + index.html) with esbuild. Usage: npm run build:viewer */
import { build } from "esbuild";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface FontFace { family: string; weight: number; unicodeRange: string; file: string }
const FONTS_DIR = join("src", "viewer", "fonts");

/** The viewer and every export must open with zero network access, so the two families ship inside viewer.css as base64 woff2 (latin + vietnamese subsets, ~180 KB). */
export function inlineFontFaces(): string {
  const faces = JSON.parse(readFileSync(join(FONTS_DIR, "manifest.json"), "utf8")) as FontFace[];
  return faces.map((f) => `@font-face{font-family:"${f.family}";font-style:normal;font-weight:${f.weight};font-display:swap;unicode-range:${f.unicodeRange};src:url(data:font/woff2;base64,${readFileSync(join(FONTS_DIR, f.file)).toString("base64")}) format("woff2")}`).join("\n");
}

export async function buildViewer(outDir = join(process.cwd(), "out", "viewer")): Promise<string> {
  mkdirSync(outDir, { recursive: true });
  await build({ entryPoints: ["src/viewer/main.ts"], bundle: true, format: "esm", target: "es2022", outfile: join(outDir, "viewer.js"), minify: false, sourcemap: false, logLevel: "warning" });
  writeFileSync(join(outDir, "viewer.css"), inlineFontFaces() + "\n" + readFileSync("src/viewer/theme.css", "utf8"));
  copyFileSync("src/viewer/index.html", join(outDir, "index.html"));
  return outDir;
}

if (process.argv[1] && /build-viewer\.(ts|js)$/.test(process.argv[1])) buildViewer().then((d) => console.log(`viewer → ${d}`));
