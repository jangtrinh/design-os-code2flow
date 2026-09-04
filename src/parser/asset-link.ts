import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Existing local NON-HTML files (public/*.docx, /brochure.pdf, images) are download assets, not Route Screen targets; .html files stay pages. */
export function isLocalAssetHref(rootDir: string, href: string, sourceFile?: string): boolean {
  const path = href.split(/[?#]/)[0];
  if (!path || path.startsWith("#") || /^(https?:)?\/\/|^(mailto|tel):/.test(path)) return false;
  const clean = path.replace(/^\/+/, "");
  if (!/\.[a-z0-9]{1,8}$/i.test(clean) || /\.html?$/i.test(clean)) return false;
  const candidates = [resolve(rootDir, "public", clean), resolve(rootDir, clean)];
  if (sourceFile) candidates.push(resolve(rootDir, dirname(sourceFile), path));
  return candidates.some((candidate) => inside(rootDir, candidate) && existsSync(candidate) && statSync(candidate).isFile());
}

function inside(rootDir: string, candidate: string): boolean {
  const root = resolve(rootDir);
  return candidate === root || candidate.startsWith(root + "/");
}
