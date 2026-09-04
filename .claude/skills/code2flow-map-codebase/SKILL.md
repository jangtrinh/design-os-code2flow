---
name: code2flow-map-codebase
description: Map a Next.js App Router repo into a Code2Flow user-flow canvas end to end (init → run → read the summary → report), respecting the fixed localhost port and leaving no server running. Use when a PO or teammate asks "show me the flows / screens / how users move through this app", when a PRD needs checking against code, or before writing user stories for an existing product.
---

# code2flow-map-codebase

Everything runs locally. The tool reads the target repo, drives its own dev server through a real Chrome, and writes only into `<repo>/.code2flow/` (generated, gitignored) plus the two config files below.

## Preconditions (check, do not assume)

1. `code2flow` prints its usage and exits 0 (installed globally from the tarball, or `npm run cli --` inside the tool repo).
2. The target is a Next.js App Router app (`app/` or `src/app/` with `page.tsx`). Anything else: stop and say so — other adapters are not shipped yet.
3. Google Chrome is installed (Playwright drives it; nothing is downloaded).
4. Port contract: read `<repo>/.project-agent.md` → `localhost_port`. That port, bound to `127.0.0.1`, is the only one the dev server may use. If something already answers there, report the PID (`lsof -nP -iTCP:<port> -sTCP:LISTEN`) and stop — never pick another port.

## Procedure

1. `code2flow init <repo>` — creates `code2flow.config.json` (serverUrl from the port contract), adds `.code2flow/` to `.gitignore`, appends a Code2Flow section to the repo's AGENTS.md/CLAUDE.md. Idempotent; run it every time.
2. Fill what static analysis cannot know, only when `scan` asks for it: `routeExamples` for dynamic routes (full paths such as `/products/omniact`, never bare slugs), `features` when the top URL segment is a poor grouping.
3. `code2flow run <repo>` — starts the dev server (config `devCommand`, default `npm run dev`; it is executed with the shell inside the target repo, so treat it like a package script and review it in an unfamiliar repo), then scan → snapshot → stories validate → lint → export, and stops the server. Pass `--url http://127.0.0.1:<port>` instead when the user already runs the server. Budget: 1–3 minutes for 20 screens; a cold Turbopack compile can add a minute.
4. Exit codes of `run`: **0** ran, no lint error · **1** ran, lint found a broken link · **2** did not run (no `serverUrl`, port already answers, dev server failed, malformed `code2flow.stories.json`) — on 2 there is no `run-summary.json`; fix the cause, do not retry blindly. Read `<repo>/.code2flow/run-summary.json` and the `scan` lines. Every parser gap is a counter, never a crash: `needs-sample` (dynamic route without URL), `capture-failed`, `login-redirect` (app behind a login → `code2flow login <repo> --url …` once, then `run` again), `route-example-not-matching-route`.
5. Deliver: the export path (`.code2flow/export/<repo>-flows.html`, opens offline, safe to send), or `code2flow serve <repo>` on `127.0.0.1:4317` for a live session; plus the lint summary (broken links = errors, orphans/dead-ends = warnings, low-confidence = review items with `file:line`).

## Reporting contract

```
Status: DONE | DONE_WITH_CONCERNS
Screens: <routes> routes + <n> state screens · Edges: high/medium/low · Captured: x/y
Gaps: <counters that need a human: needs-sample list, login-gated, capture-failed>
Lint: <errors> errors (broken links), <warnings> warnings, <info> to review
Export: <path> (<MB>)
```

## Rules

- Never edit the target's source to make the tool happier; record the pattern the parser missed in the report instead (it becomes a parser test).
- Never leave `next dev` running (`run` stops what it started; if you started a server by hand, stop it).
- Screenshots may contain real data when a login session is used; `export` prints a reminder — pass it on.
- Do not commit `.code2flow/`; do commit `code2flow.config.json` and `code2flow.stories.json` when the owner agrees.
