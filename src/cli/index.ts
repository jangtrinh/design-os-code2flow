#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { diffCommand } from "./diff-command.js";
import { exportCommand } from "./export-command.js";
import { renderCommand } from "./render-command.js";
import { RenderUsageError } from "../snapshot/render-views.js";
import { lintCommand } from "./lint-command.js";
import { loginCommand, LoginError } from "./login-command.js";
import { initCommand } from "./init-command.js";
import { pathsCommand } from "./paths-command.js";
import { RunAbort, runCommand } from "./run-command.js";
import { scanCommand } from "./scan-command.js";
import { serveCommand } from "./serve-command.js";
import { snapshotCommand } from "./snapshot-command.js";
import { storiesCommand } from "./stories-command.js";

const USAGE = `code2flow — living user-flow canvas from a web codebase (100% local)

  code2flow scan <repo>                          parse routes, screens, transitions → <repo>/.code2flow/graph.json
  code2flow init <repo> [--no-skills]                          add local config and agent guidance (idempotent)
  code2flow run <repo> [--url server|--dev cmd] [--fail-on error|warn|info]  scan, capture, validate, lint, export
  code2flow paths <repo> --from A --to B [--max 1..8] [--shell] [--json]    shortest source-evidenced Screen Node paths
  code2flow paths <repo> --orphans|--dead-ends                             topology findings
  code2flow snapshot <repo> --url <devServer>    capture every screen (content-fit, real titles)
  code2flow login <repo> --url <devServer>       sign in once (scripted via the config login block or --email-env/--password-env; --manual for a window); reused by snapshot and run
  code2flow serve <repo>                         open the canvas on http://127.0.0.1:4317
  code2flow export <repo> [--feature id]         self-contained HTML (whole app, or one per feature)
  code2flow render <repo> [--png] [--pdf] [--feature id] [--story id] [--out dir] [--scale 2]  PNG/PDF hand-outs
  code2flow stories scaffold <repo> <prd.md>     prompt pack for writing code2flow.stories.json from a PRD
  code2flow stories validate <repo>              check the Story Manifest against the graph
  code2flow lint <repo> [--fail-on error|warn]   broken links, orphans, dead-ends, needs-sample, captures
  code2flow diff <repo> --from <graph.json|repo> what changed since an earlier scan
`;

/** Flags that take a value: `--flag --other` or a trailing `--flag` is a usage error, not silently `true`. */
const VALUE_FLAGS = new Set(["url", "storage-state", "concurrency", "feature", "story", "out", "scale", "from", "to", "max", "dev", "fail-on", "email-env", "password-env", "path", "success-url"]);
const BOOLEAN_FLAGS = new Set(["orphans", "dead-ends", "shell", "json", "headed", "exit-code", "no-skills", "png", "pdf", "manual", "relogin"]);

/** Tiny argv parser: positionals + --flag value / --flag. No dependency needed for nine commands. */
export function parseArgs(argv: string[]): { command: string; positionals: string[]; flags: Record<string, string | true>; errors: string[] } {
  const [command = "", ...rest] = argv;
  const positionals: string[] = []; const flags: Record<string, string | true> = {}; const errors: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith("--")) { positionals.push(a); continue; }
    const name = a.slice(2); const next = rest[i + 1];
    if (BOOLEAN_FLAGS.has(name)) flags[name] = true;
    else if (next !== undefined && !next.startsWith("--")) { flags[name] = next; i++; }
    else if (VALUE_FLAGS.has(name)) errors.push(`--${name} needs a value`);
    else flags[name] = true;
  }
  return { command, positionals, flags, errors };
}

const here = dirname(fileURLToPath(import.meta.url));
const VIEWER_DIR = join(here, "..", "..", "out", "viewer");

export async function main(argv: string[]): Promise<number> {
  const { command, positionals, flags, errors } = parseArgs(argv);
  const repo = positionals[0];
  if (errors.length) { console.error(`${command}: ${errors.join("; ")}`); return 2; }
  try {
    switch (command) {
      case "scan": if (!repo) return usage("scan: missing <repo>"); await scanCommand(repo); return 0;
      case "init": if (!repo) return usage("init: missing <repo>"); await initCommand(repo, console.log, { skills: flags["no-skills"] !== true }); return 0;
      case "run": if (!repo) return usage("run: missing <repo>"); return await runCommand(repo, VIEWER_DIR, flags);
      case "paths": if (!repo) return usage("paths: missing <repo>"); return await pathsCommand(repo, flags);
      case "snapshot": if (!repo) return usage("snapshot: missing <repo>"); await snapshotCommand(repo, flags); return 0;
      case "login": if (!repo) return usage("login: missing <repo>"); await loginCommand(repo, flags); return 0;
      case "serve": if (!repo) return usage("serve: missing <repo>"); await serveCommand(repo, VIEWER_DIR); await new Promise(() => {}); return 0; // serves until Ctrl+C
      case "export": if (!repo) return usage("export: missing <repo>"); await exportCommand(repo, VIEWER_DIR, flags); return 0;
      case "render": if (!repo) return usage("render: missing <repo>"); return await renderCommand(repo, VIEWER_DIR, flags);
      case "stories": if (!positionals[0] || !positionals[1]) return usage("stories: usage  code2flow stories scaffold <repo> <prd.md> | validate <repo>"); return await storiesCommand(positionals[0], positionals[1], positionals[2]); // sub-command first, then <repo>
      case "lint": if (!repo) return usage("lint: missing <repo>"); return await lintCommand(repo, flags);
      case "diff": if (!repo) return usage("diff: missing <repo>"); return await diffCommand(repo, flags);
      case "--help": console.log(USAGE); return 0;
      default: console.log(USAGE); return command ? 2 : 0;
    }
  } catch (err) {
    console.error(`${command}: ${(err as Error).message}`);
    return err instanceof RunAbort || err instanceof RenderUsageError || err instanceof LoginError ? 2 : 1;
  }
}

function usage(message: string): number { console.error(message); return 2; }

/** True when this module is the process entry — also through the `node_modules/.bin/code2flow` symlink npm installs. */
export function isCliEntry(argv1: string | undefined, moduleUrl: string): boolean {
  if (!argv1) return false;
  try { return realpathSync(argv1) === realpathSync(fileURLToPath(moduleUrl)); } catch { return false; }
}

if (isCliEntry(process.argv[1], import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
