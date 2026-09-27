/** Bundles the Stage bridge snippet (src/stage-bridge) into dist/stage-bridge/index.js — the `design-os-code2flow/stage-bridge` export. */
import { build } from "esbuild";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MAX_BYTES = 4 * 1024; // the snippet ships inside the target app's dev bundle: keep it tiny (≈1.5 KB gzipped)

export async function buildStageBridge(outDir = join(process.cwd(), "dist", "stage-bridge")): Promise<string> {
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, "index.js");
  await build({ entryPoints: ["src/stage-bridge/install-stage-bridge.ts"], bundle: true, format: "esm", target: "es2020", minify: true, outfile: file, logLevel: "warning" });
  writeFileSync(join(outDir, "index.d.ts"), `export interface StageBridgeOptions {\n  /** Client-side navigation to a same-origin path (your router). Omitted = location.assign (a full load). */\n  navigate?: (path: string) => void | Promise<void>;\n  /** Extra viewer origins; only loopback origins are accepted. */\n  viewerOrigins?: string[];\n}\n/** Installs the bridge when this page is framed by the Code2Flow Stage; returns an uninstall function. */\nexport declare function installStageBridge(options?: StageBridgeOptions): () => void;\n`);
  const size = statSync(file).size;
  if (size > MAX_BYTES) throw new Error(`stage bridge is ${size} bytes (limit ${MAX_BYTES})`);
  return file;
}

if (process.argv[1] && /build-stage-bridge\.(ts|js)$/.test(process.argv[1])) buildStageBridge().then((f) => console.log(`stage bridge → ${f} (${statSync(f).size} bytes)`));
