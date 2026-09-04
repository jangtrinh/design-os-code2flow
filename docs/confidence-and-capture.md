# How confidence tiers and captures work

## What counts as a screen

- **Route Screen**: every `page.tsx` under `app/`; `[id]` and `[...rest]` are one screen each; `(group)` folders are transparent; `api/`, `@slot` and `_private` folders are skipped.
- **State Screen**: a modal, drawer, tab or wizard step nested under a route. Detected from (a) query params the page reads (`?modal=`, `?drawer=`, `?tab=`, `?step=`, `?filter=open`) compared to literals or used to render a component, (b) `Dialog | Sheet | Drawer` components toggled by a `useState` boolean, (c) `Tabs` value changes, (d) intercepting routes (`@modal/(.)…`, planned), (e) a one-hop derived alias of a searchParams key (`const activeTab = tabs.includes(tab as …) ? tab as … : "overview"`) compared with `===`/`==` anywhere in the page, (f) every literal in the array behind that alias's `.includes()` membership check, even without its own equality comparison.

## Transition Confidence (ADR-0005)

| Tier | How the target was found | Drawn as |
|---|---|---|
| **high** | literal `<Link href>`, `<a href>`, `<form action>`, `router.push("/x")`, `redirect("/x")`, `notFound()` | solid ink, 2 px |
| **medium** | one hop away from a literal: a constant, an imported constant, a template with a static prefix (`` `${BASE}?tab=roles` ``), a prop passed through one component, a `*Href` helper with a literal patch object, a string literal inside a data array, a `useState`-toggled overlay, a `URLSearchParams.set("step", "x")` inside an href builder | solid grey |
| **medium pattern** | `link-href-data-module` reads one imported literal data array. | solid grey |
| **medium pattern** | `prop-href-data-module` and `prop-object-href-data-module` follow one passed href or object prop through a local Link wrapper into imported static data. | solid grey |
| **medium pattern** | `link-href-query-hop-same-route` and `link-href-base-same-route` stay on a dynamic source route only when an existing State Screen proves the query. | solid grey |
| **medium pattern** | `form-action-server-action-redirect` follows one imported action to literal redirects. | solid grey |
| **low** | a runtime value: `rowHref={(row) => …}`, `router.push(variable)`, `href={props.x}` that never resolves, `useState` step-index wizards | grey dashed + review glyph |
| **missing** | the literal resolved to a path that is not a route | red dotted, never hidden |

Unresolved parts that land in a `[param]` segment of a dynamic route, or only in the query string, do not lower the tier: the route is certain, only the instance is not.

Rules that keep the canvas readable are applied by the viewer, never by the parser: route self-loops become an "in-place" chip, in-frame hops stay inside the frame, Cancel/Close edges are hidden by default, parallel triggers between the same two screens are bundled (`+n`), shell navigation is drawn once and hidden by default.

Shell navigation is sourced from (a) any component rendered by ≥50% of Route Screens, and (b) every `layout.{tsx,jsx,js}` under the app dir, root or nested — a layout wraps every page beneath it unconditionally, so its links are shell nav regardless of usage share.

## Nothing vanishes silently

Anything the parser saw but did not emit is a per-file counter in `graph.json`: `normalizations` (redirect to the same route), `anchor-hash`, `unresolved-expression`, `candidate-breadth-limit`, `merged-identical-edge`, `merged-prop-href-duplicate`, `setter-without-overlay`, `needs-sample`, and from capture: `capture-failed`, `no-url`, `login-redirect`, `capture-capped`. A re-`scan` keeps the last snapshot's counters (its shots still exist). `code2flow lint` turns the ones a person should act on into findings.

## Capture policy (ADR-0007)

- Base viewport 1440 × 900. App-shell layouts keep the document at viewport height and scroll inside `<main>`, so `fullPage` screenshots are useless; instead the viewport is grown in both axes until no inner scroller is clipped (caps 2200 × 10000, configurable).
- Before measuring, the page must settle: bounded network idle (8 s), fonts and images loaded, a scroll sweep through every scroller so lazy content mounts, and two identical layout measurements 400 ms apart with at least 1 s elapsed. The sweep repeats after each growth step.
- JPEG quality 65 (≈ 60–160 KB per screen), stored as `shots/<sha1(id)[0:16]>.jpg` so the pairing screen ↔ image survives any re-scan. State Screens also get a crop of their `[role=dialog]`.
- A page that needs more than the cap is captured up to the cap, counted (`capture-capped`) and flagged in `shots-meta.json` (`clippedAtCap`).
- Titles are read from the page: `h1` inside `<main>`, the dialog's `aria-labelledby` or first heading, the selected tab.
- Frames on the canvas are the capture at ⅓ (height capped at 900 with a "continues N px tall" chip); dialog crops at ½. The drawer and lightbox show the capture at full size.

## Recall benchmark

`npm run recall` scores the parser against a hand-labelled ground truth of a private product (`fixtures/benchmarks/…`, kept outside the public repo; the script prints a notice when it is absent): per tier and per pattern, so a miss is attributable. Current: screens 34/34, high 8/8, medium 21/24, low 10/10, shell 23/23. Precision is not labelled (PO decision).
