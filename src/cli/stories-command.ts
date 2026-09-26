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

/** Story Manifest v3 shape for the prompt pack (ADR-0008 §2): v2 structure plus optional audience copy for the Stage. */
const SCHEMA_V3 = `{
  "version": 3,
  "locales": ["en", "vi"],
  "features": [{ "id": "billing", "title": "Billing", "match": ["/billing/**"], "order": 1 }],
  "names": {
    "billing": { "text": { "en": "Billing", "vi": "Thanh toán" }, "source": "docs/product-map.md" },
    "/billing/invoices": { "en": "Invoices", "vi": "Hoá đơn" }
  },
  "stories": [{
    "id": "kebab-id", "title": { "en": "…", "vi": "…" }, "description": { "en": "…", "vi": "…" },
    "feature": "billing", "order": 1, "source": "docs/prd/x.md#section", "entry": "/route",
    "steps": [
      { "screen": "/route", "caption": { "en": "One line the audience reads under the screen.", "vi": "…" }, "note": { "en": "Presenter-only: what to point at.", "vi": "…" } },
      { "screen": "/route?modal=x", "via": "Button label", "cue": { "en": "Click Button label.", "vi": "Bấm Button label." }, "title": { "en": "Audience name of this step", "vi": "…" } }
    ],
    "branches": [{ "title": "Reject", "from": "/route", "steps": ["/route?modal=y"] }],
    "exit": ["/route?status=done"], "acceptance": ["…"]
  }]
}`;

const FIELD_NOTES = `Every text field (\`title\`, \`description\`, \`caption\`, \`note\`, \`cue\`, \`names\` values) is either a plain string (the first locale) or one string per locale in \`locales\`. Fields to know:

- \`via\` is the Action Trigger label exactly as it appears in the UI ("Approve", "Save changes"), matched against detected edges. Never a sentence: directions go in \`cue\`.
- \`caption\` — one line the audience reads under the screen. \`note\` — presenter-only facts. \`cue\` — presenter-only, what to do or say to arrive at this step.
- \`title\` on a step — the audience name for that step; \`names\` — the Audience Name of a feature id or screen id everywhere in the viewer (\`source\` records where it came from).
- All v3 fields are optional; v1/v2 manifests stay valid. \`code2flow stories validate\` warns on a locale missing from any text and on a \`via\` that reads like a cue.`;

function promptPack(graph: CanonicalFlowGraph, dataDir: string, prd: string): string {
  const titles = existsSync(join(dataDir, "titles.json")) ? (JSON.parse(readFileSync(join(dataDir, "titles.json"), "utf8")) as Record<string, { h1: string; dialogTitle: string; activeTab: string }>) : {};
  const screens = graph.screens.map((s) => `- \`${s.id}\` — ${realTitleFor(s, graph, titles)}${s.kind !== "route" ? ` (${s.kind})` : ""}`).join("\n");
  return `# Story Manifest prompt pack\n\nFill \`${MANIFEST_FILE}\` (schema below) from the PRD. Use ONLY screen ids from the list; put screens the PRD names but the list lacks under \`screens\` anyway so \`code2flow stories validate\` can report them as missing.\n\n## Schema (v3; v2 = the same without locales, names, caption, note, cue)\n\n\`\`\`json\n${SCHEMA_V3}\n\`\`\`\n\n${FIELD_NOTES}\n\n## Screens detected in the code (${graph.screens.length})\n\n${screens}\n\n## PRD\n\n${prd}\n`;
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
    const out = join(dataDir, "stories-prompt.md");
    writeFileSync(out, promptPack(graph, dataDir, prd));
    log(`stories scaffold: prompt pack → ${out} (${graph.screens.length} screens, PRD ${prd.length} chars). Hand it to your coding agent, save the result as ${MANIFEST_FILE}, then run \`code2flow stories validate\`.`);
    return 0;
  }
  throw new Error(`unknown subcommand "${sub}" (scaffold|validate)`);
}
