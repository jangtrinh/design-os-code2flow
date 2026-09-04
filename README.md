# Code2Flow

A local CLI that turns a web codebase into a living user-flow canvas: every screen (route, modal, drawer, tab, wizard step) is a real screenshot, every arrow is an action found in the code with `file:line` evidence and a confidence tier. Nothing leaves your machine.

Supported today: Next.js App Router. Other adapters are planned (ADR-0002).

## Install (for a PO or a teammate)

Requirements: Node 20+, Google Chrome installed (Playwright drives it; nothing is downloaded), and the target app's own dev server.

```bash
npm i -g ./design-os-code2flow-0.2.0.tgz    # the tarball from a release (built with `npm pack`); the bin is `code2flow`
code2flow --help
```

From source: `git clone … && cd code2flow && npm i && npm run build && npm link`.

## Use

```bash
npx code2flow init     /path/to/repo         # config + .gitignore + AGENTS.md section (idempotent)
npx code2flow run      /path/to/repo         # dev server → scan → snapshot → validate → lint → export → server stopped
npx code2flow scan     /path/to/repo         # → /path/to/repo/.code2flow/graph.json
npx code2flow snapshot /path/to/repo --url http://127.0.0.1:3000   # screenshots against your dev server
npx code2flow serve    /path/to/repo         # http://127.0.0.1:4317
npx code2flow export   /path/to/repo         # one self-contained HTML, opens offline
```

Optional: `login` (sign in once, reused by `snapshot`), `stories scaffold|validate` (user-story lanes from a PRD), `paths` (how users get from A to B, with evidence), `lint` and `diff` (CI).

For agents: skills `code2flow-map-codebase`, `code2flow-answer-flow-questions`, `code2flow-stories-from-prd` in `.claude/skills/` (also shipped inside the package: `node_modules/design-os-code2flow/.claude/skills/` — copy them into your repo's `.claude/skills/`).

- [Getting started](docs/getting-started.md)
- [Configuration reference](docs/config-reference.md) — `code2flow.config.json`, `code2flow.stories.json`
- [Confidence tiers and capture policy](docs/confidence-and-capture.md)
- Decisions: [docs/adr/](docs/adr/)

Add `.code2flow/` to the target repo's `.gitignore`.

## Develop

```bash
npm run cli -- scan fixtures/synthetic/app-router-basic   # run from source (tsx)
npx tsc --noEmit && npx vitest run                          # 11 files; two drive the installed Chrome
npm run recall                                              # parser vs hand-labelled ground truth
```

Layout: `src/parser` (adapters → CanonicalFlowGraph), `src/snapshot` (Playwright capture), `src/lint`, `src/viewer` (vanilla TS + SVG), all sharing only `src/schema`.
