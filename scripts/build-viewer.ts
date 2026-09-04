/** Bundles src/viewer into out/viewer (viewer.js + viewer.css + index.html) with esbuild. Usage: npm run build:viewer */
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface FontFace { family: string; weight: number; unicodeRange: string; file: string }
const FONTS_DIR = join("src", "viewer", "fonts");

/**
 * The viewer and every export must open with zero network access, so every face ships inside viewer.css as base64
 * woff2. The manifest lists one file per (family, weight, subset), but several weights share byte-identical files
 * (e.g. Inter 400/500/600 latin are the same font today) — each distinct payload is emitted once as a CSS custom
 * property and every @font-face that needs it references the variable, instead of re-embedding the same base64
 * blob per weight (5x inflation measured in the perf audit, H6).
 */
export function inlineFontFaces(): string {
  const faces = JSON.parse(readFileSync(join(FONTS_DIR, "manifest.json"), "utf8")) as FontFace[];
  const varNames = new Map<string, string>(); // content sha1 → CSS var name
  const vars: string[] = [];
  const varFor = (file: string): string => {
    const bytes = readFileSync(join(FONTS_DIR, file));
    const hash = createHash("sha1").update(bytes).digest("hex");
    let name = varNames.get(hash);
    if (!name) { name = `--f${varNames.size}`; varNames.set(hash, name); vars.push(`${name}:url(data:font/woff2;base64,${bytes.toString("base64")}) format("woff2")`); }
    return name;
  };
  const rules = faces.map((f) => `@font-face{font-family:"${f.family}";font-style:normal;font-weight:${f.weight};font-display:swap;unicode-range:${f.unicodeRange};src:var(${varFor(f.file)})}`);
  return `:root{${vars.join(";")}}\n${rules.join("\n")}`;
}

export async function buildViewer(outDir = join(process.cwd(), "out", "viewer")): Promise<string> {
  mkdirSync(outDir, { recursive: true });
  await build({ entryPoints: ["src/viewer/main.ts"], bundle: true, format: "esm", target: "es2022", outfile: join(outDir, "viewer.js"), minify: false, sourcemap: false, logLevel: "warning" });
  writeFileSync(join(outDir, "viewer.css"), inlineFontFaces() + "\n" + readFileSync("src/viewer/theme.css", "utf8"));
  copyFileSync("src/viewer/index.html", join(outDir, "index.html"));
  return outDir;
}

if (process.argv[1] && /build-viewer\.(ts|js)$/.test(process.argv[1])) buildViewer().then((d) => console.log(`viewer → ${d}`));
