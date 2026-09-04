import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_FILE } from "../schema/code2flow-config.js";

const DOC_URL = "https://github.com/jangtrinh/design-os-code2flow/blob/main/docs/config-reference.md";
/** The skills shipped with the tool (src/ or dist/ are both two levels below the package root). */
const SHIPPED_SKILLS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".claude", "skills");
const AGENT_SECTION = `## Code2Flow

Code2Flow maps an App Router codebase into a local user-flow canvas.

- \`npx code2flow run .\`
- \`npx code2flow serve .\`
- \`npx code2flow paths . --from A --to B\`
- screen ids are App Router route ids
- \`code2flow.stories.json\` v2 = steps with via
- \`.code2flow/\` is generated, never edit
`;

function read(rootDir: string, file: string): string | undefined {
  const path = join(rootDir, file); return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

function configuredPort(rootDir: string): number {
  const frontMatter = read(rootDir, ".project-agent.md")?.match(/^---\s*\n([\s\S]*?)\n---/m)?.[1] ?? "";
  const port = frontMatter.match(/^localhost_port:\s*(\d+)\s*$/m)?.[1];
  return port ? Number(port) : 3000;
}

/** Copies the shipped agent skills into <repo>/.claude/skills/ unless a skill of that name already exists there. */
function copySkills(rootDir: string, log: (line: string) => void): void {
  if (!existsSync(SHIPPED_SKILLS)) { log("init  shipped skills not found next to the CLI; skipped"); return; }
  for (const name of readdirSync(SHIPPED_SKILLS).filter((n) => n.startsWith("code2flow-"))) {
    const target = join(rootDir, ".claude", "skills", name, "SKILL.md");
    if (existsSync(target)) { log(`init  skill ${name} already initialised`); continue; }
    mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, readFileSync(join(SHIPPED_SKILLS, name, "SKILL.md")));
    log(`init  added skill .claude/skills/${name}`);
  }
}

/** `code2flow init <repo> [--no-skills]` only creates its config, additive guidance and the agent skills; a second run is a no-op. */
export async function initCommand(repoArg: string, log: (line: string) => void = console.log, opts: { skills?: boolean } = {}): Promise<void> {
  const rootDir = resolve(repoArg); const config = join(rootDir, CONFIG_FILE);
  if (!existsSync(config)) {
    const port = configuredPort(rootDir);
    writeFileSync(config, JSON.stringify({ serverUrl: `http://127.0.0.1:${port}`, features: [], routeExamples: {}, _doc: `${DOC_URL} — features group the map; routeExamples give dynamic routes a concrete URL` }, null, 2) + "\n");
    log(`init  created ${CONFIG_FILE}`);
  } else log(`init  ${CONFIG_FILE} already initialised`);

  const ignorePath = join(rootDir, ".gitignore"); const ignore = read(rootDir, ".gitignore");
  if (!(ignore ?? "").split(/\r?\n/).some((line) => line.trim() === ".code2flow/")) {
    writeFileSync(ignorePath, `${ignore && !ignore.endsWith("\n") ? ignore + "\n" : ignore ?? ""}.code2flow/\n`);
    log("init  added .code2flow/ to .gitignore");
  } else log("init  .gitignore already initialised");

  const guide = existsSync(join(rootDir, "AGENTS.md")) ? "AGENTS.md" : existsSync(join(rootDir, "CLAUDE.md")) ? "CLAUDE.md" : "AGENTS.md";
  const existing = read(rootDir, guide) ?? "";
  if (!/^## Code2Flow\s*$/m.test(existing)) {
    writeFileSync(join(rootDir, guide), `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}${existing ? "\n" : ""}${AGENT_SECTION}`);
    log(`init  added Code2Flow guidance to ${guide}`);
  } else log(`init  ${guide} already initialised`);
  if (opts.skills !== false) copySkills(rootDir, log);
}
