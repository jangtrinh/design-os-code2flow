---
name: code2flow-stories-from-prd
description: Turn a PRD markdown into a Code2Flow Story Manifest (code2flow.stories.json v2) using the prompt pack produced by `code2flow stories scaffold`, then validate it against the scanned graph and report PRD-vs-code drift. Use when a PO wants user-story lanes on the Code2Flow canvas, or when a PRD changed.
---

# code2flow-stories-from-prd

Turns a PRD into `code2flow.stories.json` (Story Manifest v2, ADR-0006/0007) for a repo that has been scanned with Code2Flow. The LLM step runs here, in the user's agent; the tool itself never calls a model.

## Inputs

1. `<repo>/.code2flow/stories-prompt.md` — produced by `code2flow stories scaffold <repo> <prd.md>`. It contains the schema, the list of every detected screen id with its real title, and the PRD text. If it does not exist, run the scaffold first (the repo must have been `scan`ned).
2. `<repo>/.code2flow/graph.json` — for checking transitions.

## Rules (nothing invented)

- Use ONLY screen ids from the prompt pack's screen list. A screen the PRD names but the code lacks goes into `screens` anyway with its most likely id (route path); `validate` reports it as unknown — that is the drift signal, do not hide it.
- One story = one user goal from the PRD (a heading or a "As a … I want …" block). `id` kebab-case, `title` verbatim from the PRD, `source` = `<prd path>#<heading-slug>`.
- `feature`: the feature whose routes the story mostly touches (ids from `features[]`; if the pack has no features, use the top URL segment).
- `entry`: the first screen the user is on. `steps`: the happy path in order; use `{ "screen", "via" }` when the PRD names the button/link. `branches`: alternative paths (reject, cancel, error) with `from` = the screen where they fork. `exit`: terminal screens.
- `screens` must include every screen in `steps` and `branches`.
- Never reorder or rename PRD stories to make validation pass.

## Procedure

1. Read the prompt pack fully. List candidate stories (max 12 per run; split larger PRDs by section).
2. Draft the manifest as JSON. Before writing, walk each `steps` chain against `graph.json`: an edge `source → target` must exist with `scope: "screen"`; if `via` is set it must be contained in the edge `trigger` (case-insensitive). Where none exists, keep the step and add `"note": "asserted by PRD, not detected in code"` on the story.
3. Write `<repo>/code2flow.stories.json`. Keep an existing manifest's stories unless the PRD superseded them; never delete stories silently — move superseded ones to `"archived": true`.
4. Run `code2flow stories validate <repo>` and paste its output in the report.
5. Report: stories written, drift findings (unknown screens, missing transitions), and PRD sections you could not map, each with the reason.

## Output contract

```
Status: DONE | DONE_WITH_CONCERNS
Summary: N stories → code2flow.stories.json; validate: E errors, W warnings
Drift: <bulleted list of asserted-but-missing transitions and unknown screens, or "none">
Unmapped PRD sections: <list or "none">
```
