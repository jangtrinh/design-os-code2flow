# Code2Flow — Agent Instructions

## Project Context

Read [`.project-agent.md`](./.project-agent.md) for product identity, tech stack, commands, design system, and binding rules.
Read [`CONTEXT.md`](./CONTEXT.md) for canonical domain vocabulary.

## Development Rules

- Run `npm run lint` and `npx tsc --noEmit` before marking tasks complete.
- Keep files modular: if a code file exceeds 200 lines, consider decomposing into subcomponents or utility modules.
- Use kebab-case naming for files and descriptive symbol names.
- Strictly adhere to tokens and guidelines in `design-system/`.

## Modularization Rules

- Separate AST parsing and code analysis (`src/parser/`, Node-only) from graph visualization UI (`src/viewer/`, browser-only). Both depend only on `src/schema/`.
- Custom flow nodes (ScreenNode, ActionEdge) must be independent components.
- Viewer dev server binds `127.0.0.1:4317` only (see `.project-agent.md`).

## Git Rules

- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `chore:`.
- Do not commit secrets, environment variables, or build outputs.

## Binding Rules Reminder

Follow all rules in `.project-agent.md` binding rules section. This is **MANDATORY**.

## [IMPORTANT] ES Workflow (mandatory)

- Every coding task: apply the `/es:lazy` ladder — reuse codebase → stdlib → native platform → installed dep → one line → only then minimum code. Deliberate corner-cuts carry an `es-debt: <ceiling>, <upgrade trigger>` comment.
- Every feature request: route through `/es:feature-dev` (classify → brainstorm → plan → dev → review). Never skip straight to code on non-trivial work.
- Use `CONTEXT.md` canonical terms in all naming (code, plans, commits); never use terms listed under `_Avoid_`. New terms crystallise via `/es:brainstorm` grilling.
- An es-* skill misled or lacks a rule? Do NOT patch the skill mid-task — record a `gap` in the evolution ledger (`/es:librarian` branch `record`); `/es:librarian run` graduates it with a judge + human merge.
- End of ANY substantial task (pipeline or not): Reflect — distil AT MOST ONE durable lesson. Product lesson → `.brv`/`CONTEXT.md`; kit lesson → `gap`; nothing durable → record NOTHING.

## Release checklist

1. `npx tsc --noEmit && npm run lint && npx vitest run && npm run recall && npm run audit:design` — all 0.
2. Run `code2flow run` on at least one real external app (not a fixture), open the export, look at the product map, a feature page and the Inspector, and click one edge pill with a real pointer.
3. Bump `package.json`, commit, push, tag `v*`: CI stages the version on npm; the maintainer approves with `npm stage approve <stage-id>`.

## Browser tests

Interactions are asserted with a real Playwright pointer click, never `element.dispatchEvent(new MouseEvent("click"))`: synthetic events skip pointerdown, so the canvas drag allow-list in `src/viewer/canvas.ts` is never exercised and a dead control passes.
