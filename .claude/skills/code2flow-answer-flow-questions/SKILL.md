---
name: code2flow-answer-flow-questions
description: Answer questions about a scanned app's user flows from Code2Flow's machine-readable outputs — "how does a user get from A to B", "which screens are unreachable or dead ends", "where does the PRD disagree with the code", "what is behind this arrow" — with file:line evidence and confidence, without opening the canvas. Use after `code2flow run`/`scan` has produced `<repo>/.code2flow/graph.json`.
---

# code2flow-answer-flow-questions

Source of truth is `<repo>/.code2flow/` (regenerate with `code2flow scan <repo>` when the code changed; `code2flow diff <repo> --from <old graph.json>` tells you what moved). Never answer from memory of the code when these files exist.

## Which command answers which question

| Question | Command | Read |
|---|---|---|
| How do users get from A to B? | `code2flow paths <repo> --from <A> --to <B> [--max 4, cap 8] [--json]` | up to 5 shortest paths; each hop = trigger · confidence · `file:line`. Add `--shell` when A is only reachable through the sidebar/top nav. |
| What can I reach from A / what reaches B? | `graph.json` → `edges` filtered by `source`/`target` (`scope: "screen"`), or `paths` with `--to` each candidate | triggers and targets; `dynamic:`/`missing:`/`not-found` targets are not screens |
| Which screens are unreachable or lead nowhere? | `code2flow paths <repo> --orphans` / `--dead-ends`, or `code2flow lint <repo> --json` | rules `orphan-screen`, `dead-end` (screens reachable only through shell nav are not orphans) |
| Which links are broken? | `code2flow lint <repo> --json` | rule `broken-link` (severity error) — a literal href that resolves to no route |
| Where does the PRD disagree with the code? | `code2flow stories validate <repo>` | `unknown screen` = PRD names a screen the code lacks; `no detected transition A → B via "X"` = PRD asserts a step the code does not implement (or the button text differs from `via`) |
| Which arrows need a human look? | `lint --json` rule `low-confidence`, or `graph.json` edges with `confidence: "low"` | `pattern` says why (`link-href-unresolved`, `form-action-unresolved`, …) |
| What did the parser see but not draw? | `graph.json` → `counters` (per file) | `needs-sample`, `unresolved-expression`, `capture-failed`, `route-example-not-matching-route` … |

## Screen ids

App Router route ids, not URLs: `/products/[slug]`, `/products/[slug]?tab=pricing`, `/orders?drawer=details`, `/invite#edit-roles-drawer` (local overlay). `paths` exit 2 lists close matches when an id is wrong.

## How to answer

1. Quote the path or finding verbatim, then explain in one sentence per hop what the user does (trigger text) and how sure the code is (`high` = literal href/redirect, `medium` = one hop away from a literal, `low` = runtime value).
2. Always cite `file:line` for the hop the person cares about; offer the snippet from `graph.json` (`evidence.snippet`) when asked "show me".
3. When no path exists, say which of the two ends is the problem (orphan, dead end, missing route, low-confidence gap) and what would settle it: a `routeExamples` entry, a `login` session, or a parser gap to report.
4. Distinguish "the code does not do this" (lint/validate finding) from "the tool could not see it" (a counter). Both are reported; only the second is the tool's fault.

## Do not

- Do not edit `graph.json`, `shots-meta.json` or `run-summary.json`; they are regenerated.
- Do not infer transitions from component names or comments; if it is not an edge with evidence, it is not a transition.
