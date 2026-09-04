import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = fileURLToPath(new URL("../../fixtures/synthetic/app-router-basic", import.meta.url));

/** Each test file works on its own copy of the fixture: files run in parallel and `.code2flow/` is mutated by every command. */
export function copyFixture(tag: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), `code2flow-${tag}-`));
  cpSync(SOURCE, dir, { recursive: true, filter: (src) => !src.includes("/.code2flow") });
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
