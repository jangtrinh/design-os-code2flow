# Code2Flow Design Guidelines

## Visual Theme: Light, single theme (decided 2026-09-03)
Light only. No dark mode, no dot grid, no glow. Verified against design:os `ui tell-lint`, `taste-lint`, `validate-layout` (0 errors on the prototype).

- **Neutral, near black-and-white (decided 2026-09-03):** canvas `#F4F4F3`, surfaces `#FFFFFF`, borders `#D2D2CF`, ink `#111111` for selection, active states and primary buttons. Reviewers must not be biased by hue, so screenshots are the only colourful thing on the page.
- **Confidence is line weight and dash, not hue:** high = ink solid 2 px · medium = grey `#8A8A86` solid · low = grey dashed with a review glyph · missing = red `#B91C1C` dotted, always visible. Red is the single chromatic colour and means "broken".
- **Features have no colour.** Identity comes from the name, the rail position and the breadcrumb.
- **Type:** Be Vietnam Pro for UI (matches the PDS design file, Vietnamese-safe), JetBrains Mono for routes, evidence and counters (tabular figures). Body 16 px; chrome (labels, chips, crumbs, kbd) 12–13 px and always named as such in class names.
- **Radius scale:** 4 / 8 / 12 / pill. Nothing else.
- **Elevation:** a floating element takes a shadow OR a border, never both. Frames on the canvas: 1 px border, no shadow.
- **Icons:** inline SVG (Phosphor-style strokes), never Unicode arrows in interactive text. Icon-only controls are 44 px.
- **Hover** styling only under `@media (hover: hover)`.

## Screen Frames — anatomy from the PDS Figma "Demo" frame (node 15370:489308, read 2026-09-03 via figma-agent)
Reference: https://www.figma.com/design/OKaCq9ds8qnJRFaPyHjjbl/VSF---PCP?node-id=15370-489308
- Container fill `#FCFCFC` (PDS `color/neutral/50`), padding 10, radius 8, 1 px border.
- Eyebrow: feature name uppercase, 10 px Bold `#8A8D95` (PDS `{Feature name}`), route path 11 px mono on the right.
- Title: 15 px Bold `#1A1B1E` (PDS uses 24 px on a 2000 px artboard; at the canvas scale 15 px keeps the proportion): `Screen name · State`, state part grey. Titles are REAL: page `h1`, dialog heading (`aria-labelledby` or first heading inside `[role=dialog]`), active tab label, read from the running app by `reports/read-titles.mjs`, never derived from the URL. A state card nested inside its parent frame shows only the state title.
- No action pill (removed 2026-09-03 on PO request; the PDS header CTA belongs to the screen, not the node).
- Screenshot inset on white with a 1 px `#E5E5E3` border; footer chips below.

## Screen Frames
- Route frame width = capture ÷ 3 (36 title + screenshot + 30 footer). Title bar: page title + route badge + glyphs (sidebar-reachable, dynamic, route-as-modal). Footer: chips only (states, in-place actions, ✕ closes, → not-found, review).
- State Screen cards 200 × 125 inside the parent frame (Inspect) or full frames on the story lane (Present).
- **Screen capture policy (decided 2026-09-03, hardened after pilot #2):** base viewport 1440 × 900, grown in both axes until no inner scroller is clipped (app-shell layouts keep `document` = viewport, so `fullPage` is useless; measure `scrollHeight/scrollWidth` of inner scrollers and enlarge the viewport, cap 2200 × 10000). Before measuring, the page must **settle**: bounded network idle, fonts and images loaded, a scroll sweep through every scroller so lazy content mounts, and two identical layout measurements 400 ms apart with at least 1 s elapsed; the sweep repeats after each viewport growth. Half-loaded captures were the first complaint from a real reviewer. JPEG q65 (~80 KB avg). State Screens additionally capture the `[role="dialog"]` element.
- **Frame size follows the capture:** route frame = capture ÷ 3 wide (≈ 490 px), height ÷ 3 capped at 900 px with a "continues N px tall" chip; State Screen frame = dialog crop ÷ 2 (240–480 px wide). Lightbox scrolls the capture at natural size.
- **Fonts ship with the page:** Be Vietnam Pro and JetBrains Mono (latin + vietnamese subsets, ~180 KB) are vendored in `src/viewer/fonts/` and inlined as base64 `@font-face` by `build:viewer`; no stylesheet is ever fetched from the network, so the viewer and exports render identically offline.

## Edges
- Bezier, arrowhead, one pill with the primary trigger `+n`. Return edges thin and muted below the frames. Bundled per (source, target).
- Rules 1–8 in `plans/specs/userflow-visualizer/ux-council.md`.

## Zoom-aware labels (decided 2026-09-03)
- Frame header, chips, edge pills and lane titles live in `ui-scale` groups whose CSS transform is `translate(x,y) scale(var(--tx))` with `--tx = clamp(0.45, k^-0.85, 1.3)` (k = canvas zoom). Zooming in shrinks labels toward a constant on-screen size so the screenshot, not the chrome, fills the view; zooming out lets them grow up to 1.3× so frames stay identifiable. A CSS transform replaces the SVG `transform` attribute, so translate must be inside the same CSS transform.
- Titles are fitted to the frame width with an ellipsis (`fitText`), the state part first, so narrow modal/drawer frames never overflow.

## Navigation (decided 2026-09-03)
- Deep links: every view is a hash (`#f/idp/s/approve-request/present/2`, `#f/iam/sel/%2Fiam%2Fusers`), so browser back/forward and sharing work; a back button sits in the header.
- Find (`Cmd+K` or `/`): one palette over features, stories and screens (route, title, state label); Enter opens the feature, selects the screen and centres it.
- Breadcrumb is a switcher: feature and story crumbs are selects.
- Keys: `[` `]` previous/next story, `P` present, `F` fit, `Esc` climbs one level (present, inspect, story, feature, map), arrows step in present.
- Selecting a frame centres it; double-click opens the first story that contains it; a portal stub jumps to the target feature with that screen selected.

## Spatial interactions (ADR-0003)
- Drag to pan, two-finger scroll to pan, `Cmd/Ctrl + wheel` or pinch to zoom (0.05–4×). `Shift+1` fit view. Present mode: `→`/`←`/`PageDown`/`PageUp` step, `Esc` back to Inspect, `P` present.


## Design system v2 — BW-DLS (adopted 2026-09-04)

Source: Figma "BW - DLS" reference frame 8146:28777; values in `tokens.json`. Rules that override anything above when they conflict:

- **Canvas is the page.** Full-bleed ground `surface-02` (#F8F7F7); every piece of chrome is a floating panel (`surface-01`, radius 16–20, `depth-1` / `toolbar` / `popover` shadows) inset 12–16 px from the viewport edge. No fixed header bar, no fixed rail, no fixed drawer.
- **Four panels max:** left navigation (features → stories), top toolbar (back, breadcrumb selects, search, mode segment), right inspector (only when something is selected), bottom bar (presenter controls in Present mode, zoom/fit otherwise).
- **Minimal text.** Labels are nouns of ≤ 2 words; no sentences or explanations inside the UI; shortcuts are `kbd` chips; counts are tabular figures in `text-secondary`. Empty states are one line.
- **Type:** Inter; 11–13 px for chrome (`body-small`/`body-large`), 14 px `heading` for panel titles and frame titles, letter-spacing −0.01/−0.02 em. Mono only for route ids.
- **Colour:** greyscale from `shade-1..9`; `accent-blue` #3582FF is the only state colour (selected frame/edge, current step, focus ring); `signal-red` only for broken links and missing screens. Confidence stays line weight/dash.
- **Controls:** segmented control = `surface-03` track radius 10 with a `surface-01` active segment (`button` shadow); icon buttons 36 px radius 8 with `stroke-01`, 44 px hit area; list rows 40 px with a 28 px icon square.
- **Story lanes (Present):** lane = floating card `surface-01` radius 16 `depth-1`, title `heading`, meta `body-small text-secondary`; frames radius 12 `stroke-01`; step pills radius 6; current step outlined `accent-blue` 2 px; non-current dimmed to 0.4, never hidden.
