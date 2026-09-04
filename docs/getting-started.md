# Getting started

Code2Flow turns a web codebase into a living user-flow canvas: every screen (route, modal, drawer, tab, wizard step) is a real screenshot, every arrow is an Action Trigger with `file:line` evidence and a confidence tier. Everything runs on your machine; nothing is uploaded.

Supported today: **Next.js App Router** (`app/` or `src/app/`), **React Router** (v6/v7 route trees in Vite or CRA apps) and **static HTML** folders. Detection order: Next → React Router → static HTML; `scan` prints the adapter it chose. Details and known misses: [adapters](adapters.md).

## 0. One command (recommended)

```bash
npx code2flow init /path/to/repo     # config with the repo's fixed port, .gitignore entry, AGENTS.md section
npx code2flow run  /path/to/repo     # starts the dev server (config `devCommand`, default `npm run dev`), scan → snapshot → stories validate → lint → export, stops the server
npx code2flow run  /path/to/repo --url http://127.0.0.1:3000   # when you already run the server
```

`run` writes `.code2flow/run-summary.json`. Exit codes: 0 ran and lint found no error · 1 ran and lint found a broken link · 2 did not run (no `serverUrl`, port already in use, dev server failed, malformed manifest). Steps 1–4 below are what `run` does, one at a time.

## 1. Scan

```bash
npx code2flow scan /path/to/repo
```

Writes `/path/to/repo/.code2flow/graph.json` (screens, transitions, counters) and `route-samples.json` (concrete URLs for dynamic routes found in the code). Add `.code2flow/` to that repo's `.gitignore`.

The summary names every dynamic route that still has no sample URL. Give them one in `code2flow.config.json` (see the config reference) or let the next step discover them from links on captured pages.

## 2. Snapshot

Start the app's own dev server, then:

```bash
npx code2flow snapshot /path/to/repo --url http://127.0.0.1:3000
```

Every screen with a URL is opened, allowed to settle (network idle, fonts and images, a scroll sweep so lazy content mounts, stable layout for at least 1 s), grown until nothing is clipped, and captured as JPEG. Modals and drawers are additionally cropped to their `[role=dialog]`. Real titles come from the page `h1`, the dialog heading and the active tab.

Apps behind a login: run `npx code2flow login /path/to/repo --url …` once, sign in by hand in the window that opens, and the session is saved to `.code2flow/storage-state.json`; every later `snapshot` uses it automatically (and `export` prints a reminder that the captures may show real account data).

Screenshots are stored as `.code2flow/shots/<hash-of-screen-id>.jpg`, so re-scanning after adding a route never mixes up images. Pages larger than the capture cap (2200 × 10000) are captured up to the cap and counted as `capture-capped`.

## 3. Serve

```bash
npx code2flow serve /path/to/repo      # http://127.0.0.1:4317
```

Product map → feature page → story. `Inspect` shows the feature overview (frames collapsed) or a story canvas (frames expanded with their state screens). `Present` shows one swimlane per story with keyboard stepping: with a v2 manifest the lane follows `steps` (pills show the PRD's `via`), each `branch` is an indented sub-row under the screen it forks from, `entry`/`exit` are chips, a step with no transition in the code is a red dashed arrow, and a screen the code lacks is a red MISSING SCREEN stub. `⌘K` finds any screen or story; every view is a shareable hash link.

## 4. Export

```bash
npx code2flow export /path/to/repo               # one HTML per feature (or the whole app when it fits)
npx code2flow export /path/to/repo --feature iam
```

The file opens offline and needs no server: viewer, fonts, data and screenshots are inside. When the whole app exceeds 14 MB, one file per feature is written; each still carries the full graph and only the screenshots are split.

`npx code2flow render /path/to/repo` writes PNG hand-outs for the product map, every feature and every story lane plus `.code2flow/render/<product>-flows.pdf`. Use `--feature iam`, `--story invite-user`, `--png`, `--pdf`, `--out dir`, or `--scale 1` to narrow output; rendering remains local and reuses (or creates) the offline export HTML.

## 5. Stories (optional, recommended)

```bash
npx code2flow stories scaffold /path/to/repo docs/prd/checkout.md   # writes .code2flow/stories-prompt.md
# hand the prompt pack to your coding agent (skill: code2flow-stories-from-prd) → code2flow.stories.json
npx code2flow stories validate /path/to/repo                        # unknown screens, asserted-but-missing transitions
```

## 6. Ask questions instead of reading the canvas

```bash
npx code2flow paths /path/to/repo --from / --to "/docs/[...parts]"   # shortest paths, each hop with trigger · confidence · file:line
npx code2flow paths /path/to/repo --orphans                          # screens nothing reaches (shell nav aside)
npx code2flow paths /path/to/repo --dead-ends
```

Agents: two skills ship in `.claude/skills/` — `code2flow-map-codebase` (the procedure above with the port contract and reporting format) and `code2flow-answer-flow-questions` (which output answers which question).

## 7. Lint and diff (CI)

```bash
npx code2flow lint /path/to/repo --fail-on error   # broken links, orphans, dead-ends, needs-sample, login-gated; --json
npx code2flow diff /path/to/repo --from previous-graph.json   # or --from /path/to/older-checkout; --exit-code, --json
```

Exit codes: `0` ok, `1` findings at or above `--fail-on` (or a command error, printed as one line), `2` usage.

## 8. From a clone

```bash
npm i && npm run build      # dist/cli + out/viewer (fonts inlined)
npx code2flow scan /path/to/repo
```

Nothing vanishes silently: everything the parser saw but did not turn into a screen or edge is a counter in `graph.json`, and every skipped capture is a lint finding.
