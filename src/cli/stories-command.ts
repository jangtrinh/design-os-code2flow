import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CanonicalFlowGraph } from "../schema/index.js";
import { loadManifest, MANIFEST_FILE, validateManifest } from "../schema/story-manifest.js";
import { realTitleFor } from "./title-helpers.js";

export interface StoryValidationResult { exitCode: number; totals: { errors: number; warnings: number } }

export function validateStoriesFromDisk(repoArg: string, log: (line: string) => void = console.log): StoryValidationResult {
  const rootDir = resolve(repoArg); const dataDir = join(rootDir, ".code2flow"); const gp = join(dataDir, "graph.json");
  if (!existsSync(gp)) throw new Error(`no ${gp}: run \`code2flow scan\` first`);
  const graph = JSON.parse(readFileSync(gp, "utf8")) as CanonicalFlowGraph;
  const m = loadManifest(rootDir);
  if (!m) { log(`stories validate: no ${MANIFEST_FILE} in ${rootDir}`); return { exitCode: 0, totals: { errors: 0, warnings: 0 } }; }
  const issues = validateManifest(m, graph);
  for (const i of issues) log(`  ${i.level === "error" ? "ERROR" : "warn "}  ${i.story}: ${i.message}`);
  const errors = issues.filter((i) => i.level === "error").length;
  const warnings = issues.length - errors;
  log(`stories validate: ${m.stories.length} stories, ${errors} error(s), ${warnings} warning(s)`);
  return { exitCode: errors ? 1 : 0, totals: { errors, warnings } };
}

/** `code2flow stories scaffold <repo> <prd.md>` → .code2flow/stories-prompt.md; `code2flow stories validate <repo>` → issues, exit 1 on errors. */
export async function storiesCommand(sub: string, repoArg: string, arg2: string | undefined, log: (line: string) => void = console.log): Promise<number> {
  const rootDir = resolve(repoArg); const dataDir = join(rootDir, ".code2flow"); const gp = join(dataDir, "graph.json");
  if (!existsSync(gp)) throw new Error(`no ${gp}: run \`code2flow scan\` first`);
  const graph = JSON.parse(readFileSync(gp, "utf8")) as CanonicalFlowGraph;
  if (sub === "validate") {
    return validateStoriesFromDisk(rootDir, log).exitCode;
  }
  if (sub === "scaffold") {
    if (!arg2) throw new Error("stories scaffold: pass the PRD markdown path");
    if (!existsSync(resolve(arg2))) throw new Error(`PRD file not found: ${resolve(arg2)}`);
    const prd = readFileSync(resolve(arg2), "utf8");
    const titles = existsSync(join(dataDir, "titles.json")) ? (JSON.parse(readFileSync(join(dataDir, "titles.json"), "utf8")) as Record<string, { h1: string; dialogTitle: string; activeTab: string }>) : {};
    const screens = graph.screens.map((s) => `- \`${s.id}\` — ${realTitleFor(s, graph, titles)}${s.kind !== "route" ? ` (${s.kind})` : ""}`).join("\n");
    const out = join(dataDir, "stories-prompt.md");
    writeFileSync(out, `# Story Manifest prompt pack\n\nFill \`${MANIFEST_FILE}\` (schema below) from the PRD. Use ONLY screen ids from the list; put screens the PRD names but the list lacks under \`screens\` anyway so \`code2flow stories validate\` can report them as missing.\n\n## Schema (v2)\n\n\`\`\`json\n{ "version": 2, "features": [{ "id": "billing", "title": "Billing", "match": ["/billing/**"], "order": 1 }], "stories": [{ "id": "kebab-id", "title": "…", "feature": "billing", "order": 1, "source": "docs/prd/x.md#section", "entry": "/route", "screens": ["/route", "/route?modal=x"], "steps": ["/route", { "screen": "/route?modal=x", "via": "Button label" }], "branches": [{ "title": "Reject", "from": "/route", "steps": ["/route?modal=y"] }], "exit": ["/route?status=done"], "acceptance": ["…"] }] }\n\`\`\`\n\n## Screens detected in the code (${graph.screens.length})\n\n${screens}\n\n## PRD\n\n${prd}\n`);
    log(`stories scaffold: prompt pack → ${out} (${graph.screens.length} screens, PRD ${prd.length} chars). Hand it to your coding agent, save the result as ${MANIFEST_FILE}, then run \`code2flow stories validate\`.`);
    return 0;
  }
  throw new Error(`unknown subcommand "${sub}" (scaffold|validate)`);
}
