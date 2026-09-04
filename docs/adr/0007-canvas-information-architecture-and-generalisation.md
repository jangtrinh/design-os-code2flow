# ADR 0007: Canvas Information Architecture, Node Anatomy, Capture Policy, and What Generalises Beyond the Pilot

- **Status:** Accepted
- **Date:** 2026-09-03
- **Deciders:** Product Owner, UX council (kongming, brainstormer, researcher), Architect
- **Amends:** ADR-0003 (viewer engine), ADR-0004 (CLI shape), ADR-0006 (manifest v2)

## Context

The pilot on `platform-design-system` (Next.js 15 App Router, 46 routes) proved the parser (34/34 screens, 39/42 edges) and produced a throwaway viewer the PO approved visually after five rounds. Decisions taken during those rounds are recorded here so the product version does not rediscover them. Lessons: `plans/reports/lessons-260903-1602-platform-design-system-pilot.md`; council synthesis: `plans/specs/userflow-visualizer/ux-council.md`.

## Decisions

1. **Hierarchy:** Product map → Feature page → Story. Feature = manifest `features[].match`, default top URL segment; core screens go to an `account` feature, entry screens to `access`. Left rail tree; breadcrumb crumbs are switchers; every view is a hash deep link.
2. **Edge pipeline** (pure function over `CanonicalFlowGraph`, tested on the benchmark): drop route self-loops (chip "in-place"), keep intra-frame edges inside the frame, hide dismiss edges by default (per-story toggle), bundle per (source,target) with primary trigger `+n`, return edges thin, low confidence dashed with review glyph, missing links red and always visible, cross-feature targets as portal stubs, sinks once per kind, shell nav hidden with a "in sidebar" chip.
3. **Two modes on one graph:** Inspect (feature overview collapsed / story canvas expanded) and Present (one swimlane per story, shared screens duplicated with an "also in" badge, unassigned screens in a collapsed tray, step-through with keyboard and a presenter HUD).
4. **Node anatomy** (from the PDS Figma PageHeader, node 15370:489308): neutral `#FCFCFC` container, eyebrow = feature, title = real `h1` · real dialog/tab title, route in mono, screenshot inset on white, footer chips; no action pill. Labels scale inversely with zoom (`k^-0.85`, clamp 0.45–1.3) and are fitted to width.
5. **Palette:** light only, near black-and-white; confidence by line style; red reserved for broken links; no feature colours. Font Be Vietnam Pro + JetBrains Mono.
6. **Capture policy:** base 1440×900, grow both axes until no inner scroller is clipped (cap 2200×6000), JPEG q65, `[role=dialog]` crop for State Screens, titles from `h1` / `aria-labelledby` / active tab. Frames = capture ÷ 3 (height cap 900 with "continues" chip), dialog crops ÷ 2.
7. **Viewer engine:** cycle 1 ships the vanilla TypeScript SVG + dagre viewer proven in the prototype instead of @xyflow/react. Upgrade trigger: a real repo above ~40 route frames per feature or a required interaction dagre/SVG cannot deliver (ADR-0003's gesture model is unchanged).
8. **Generalisation contract** (what the tool must do without PDS conveniences): resolve dynamic-route samples from literal hrefs → anchors discovered during capture → `code2flow.config.json` `routeExamples` → "needs sample" counter; capture against a user-run server (`--url`) with optional Playwright `--storage-state`; features and stories only from manifest/config; export one HTML per feature by default.

## Consequences

- `src/viewer` becomes a vanilla TS module built with esbuild; `src/cli` gains `snapshot`, `serve`, `export`; `src/schema` gains manifest v2 and `code2flow.config.json`.
- Second pilot on a different codebase is the acceptance test for decision 8.

## Amendments (2026-09-03, after the hardening review gate)

- Decision 6: the capture cap is **2200 × 10000** (was 6000; four real case-study pages needed it). Hitting the cap is counted (`snapshot.capture-capped`) and flagged in `shots-meta.json` (`clippedAtCap`).
- Decision 8: export writes **one whole-app file when it is ≤ 14 MB**, otherwise one file per feature. Per-feature files bound size, not audience: the full graph is inside each; only screenshots are split.
- Screenshots are named by a hash of the screen id (`shots/<sha1-16>.jpg`), never by position, so a re-`scan` cannot pair screens with the wrong image; shots of screens no longer in the graph are pruned by the next `snapshot`.
- Fonts (Be Vietnam Pro, JetBrains Mono; latin + vietnamese subsets) are vendored under `src/viewer/fonts/` and inlined into `viewer.css` at build time: the viewer and every export open with zero network access.
- A story screen that the code lacks is drawn as a red "MISSING SCREEN" stub inside its lane (UC-07) and listed in the story's Inspect view (UC-04); it is never dropped.
