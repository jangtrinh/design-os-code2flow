# ADR 0005: Screen Scope = Routes + Modals + Wizard Steps + Tabs, With Transition Confidence Tiers

- **Status:** Accepted
- **Date:** 2026-09-03
- **Deciders:** Product Owner, Architect

## Context

POs perceive modals, wizard steps, and tab states as distinct screens, but the ingestor adapters in ADR-0002 only extracted URL routes. Static AST detection of state-driven screens is inherently less reliable than route detection. The PO chose full scope for the MVP over route-only.

## Decision

1. `CanonicalFlowGraph` distinguishes **Route Screens** (`kind: "route"`) from **State Screens** (`kind: "modal" | "wizard-step" | "tab"`, with `parentScreenId`).
2. Every `ActionEdge` carries `confidence: "high" | "medium" | "low"` and `evidence` (file, line, snippet). Detection heuristics for the Next.js App Router adapter:
   - **high:** `<Link href>`, `router.push/replace` with literal path, `redirect()`, `notFound()`, `<form action>` to a route; Next.js intercepting/parallel routes (`@modal/(.)…`) as modal State Screens (**deferred to cycle 2** on 2026-09-03: the benchmark repo has none, plan phase-01 skips `@slot` subtrees; the synthetic fixture's `@modal` only proves slots are not Route Screens); **query-param State Screens** when `page.tsx` reads `searchParams.modal|drawer|tab|step|filter` and the opening href is a literal `?key=value`.
   - **medium:** query-param State Screens whose href comes from a helper or prop (`hrefWith(...)`, `filterDrawerHrefs(...)`, `closeHref`); paths from one-hop constants (`USERS_LIST_PATHNAME`) or template literals with a static prefix (`` `${BASE}?tab=roles` ``); components named `Dialog|Modal|Sheet|Drawer` toggled by a `useState` boolean from an Action Trigger; `Tabs`/`TabsTrigger` value changes.
   - **low:** conditional render keyed on a `useState` step index (`step === 1 && <StepOne/>`), `router.push` with variable, `rowHref={(row) => ...}` functions, external/dynamic anchors (emitted with an unresolved target, never dropped). Hrefs that are string literals inside a data array were moved to **medium** on 2026-09-03 (pilot #2: 9 of 13 low edges were exactly this; a literal in an array is as certain as a constant).
   - **shell scope:** links in the app shell / sidebar / nav bar are emitted once with `scope: "shell"` and hidden by default, not duplicated per screen.
   - **unresolved parts that do not hurt:** an unresolved `${}` that lands in a `[param]` segment of a dynamic route, or only in the query string of an exact route, keeps `medium` (the route is certain; only the instance is not).
   - **several state keys in one href** (`?tab=user&drawer=edit`): the innermost overlay wins (step > modal/dialog/sheet/drawer > filter > tab/status/view).
   - **shell detection:** a component imported from outside the app directory and rendered by ≥ 50% of Route Screens is app shell; its literal hrefs and nav data arrays become Shell Navigation Edges.
   - **prop hrefs are intents:** any prop named `href`, `to`, or `*Href` handed to a component is a navigation intent of the passing screen; duplicates with the Link inside the component are merged, keeping the better evidence.
   - **state screens without triggers:** a page comparing a state key to a literal (`stepParam === "models"`) proves that State Screen exists even when no edge reaches it (some are URL-only).
   - **self-loop normalization:** a `redirect()`/`router.push` whose target is the same route as the source (only query params differ, e.g. URL canonicalization) is not an edge. It is counted in the CLI summary as `normalizations` per file so nothing vanishes silently; a self-loop whose query names a State Screen (`?modal=`, `?step=`) is an edge to that State Screen instead.
   - **not a wizard:** a list of static `Step` cards without step state or `?step=` is a plain Route Screen.
3. The canvas always renders low-confidence edges dashed with a review badge; the ingestor never drops a detected transition silently (it logs a counter per skipped pattern).
4. Parser recall is measured on `fixtures/` and at least one real Next.js repo before canvas work starts; target ≥ 90% for `high`, reported honestly for `medium`/`low`.

## Trade-offs & Consequences

- **Pros:** Canvas matches the PO's mental model of "screens"; confidence tiers keep trust when heuristics miss.
- **Cons:** Parser complexity and false positives rise for `medium`/`low`; heuristics are Next.js/React-specific and must be re-validated per adapter.

## Recall Benchmark Repo

`/Users/jang/Products/platform-design-system/apps/web` (Next.js 15.5 App Router, `src/app/`). Profile measured 2026-09-03:

| Signal | Count | Expected tier |
|---|---|---|
| `page.tsx` route files | 46 (incl. `[id]`, `[...slug]`, `403`, `404`) | Route Screens |
| `<Link` / `href={…}` | 95 / 85 | `high` when literal, `low` when variable |
| `router.push` / `router.replace` / `useRouter` | 45 / 1 / 72 | `high` literal, `low` computed |
| `<form action=` | 25 | `high` |
| Radix `Dialog` / vaul `Drawer` / `Sheet` | 265 / 135 / 89 mentions | `medium` modal State Screens |
| Radix `Tabs` | 98 mentions | `medium` tab State Screens |
| `useState` | 117 | wizard `low` candidates |
| `@modal` intercepting routes | 0 | none; deferred to cycle 2 (see high-tier note above) |

Ground truth: `fixtures/benchmarks/platform-design-system/ground-truth.json` (15 Route Screens, 18 State Screens, 42 edges: high 8 / medium 24 / low 10, 23 shell targets). Method and discovered patterns: `plans/reports/benchmark-260903-1113-platform-design-system-ground-truth.md`. Recall is reported per tier and per pattern name. Result 2026-09-03 (see `plans/260903-1121-nextjs-app-router-ingestor-adapter/plan.md`): screens 34/34, high 8/8, medium 21/24, low 10/10, shell 23/23.
