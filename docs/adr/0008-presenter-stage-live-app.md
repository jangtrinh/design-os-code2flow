# ADR 0008: Presenter Stage — Stories as Authored Walkthroughs, Live App View With Captured Fallback

- **Status:** Proposed (owner review)
- **Date:** 2026-09-25
- **Deciders:** Product Owner, Architect
- **Amends:** ADR-0001 (the live dev server becomes a presentation surface, still loopback-only), ADR-0006/0007 (Story Manifest v3: audience copy, locales, names), ADR-0007 decision 3 (Play's Focus view becomes the Stage)

## Context

A pilot product built its own in-app demo on top of Code2Flow data: a gallery of real screens, ⌘K jump to any screen, a **Stage** that shows the *running* app (view-only by default, `E` for live interaction), a filmstrip of the story's screens and overlays, authored walkthroughs ("playlists") with an audience caption and presenter notes per step, an EN/VI switch, and an audience-name layer replacing machine names. Its measured lessons (independent critique and three rounds, same day):

1. Mechanics were not the problem; **content was**: machine names, alphabetical step order and identical captions made the first version "boring" (critic score 6/16). Authored order, per-step captions and a names layer fixed it. Code2Flow already owns the order (story `steps`), the transitions (`via` + evidence) and real titles (captured `h1` / dialog titles).
2. **One frame per session, navigated in place**, instead of one document load per step: p95 step latency 348 ms → 32 ms, zero blank flashes. Requires a small bridge inside the app.
3. **View-only by default** (the frame cannot take focus or clicks; wheel scroll is forwarded) keeps presenter keys working; an explicit Live toggle hands control to the product; leaving Live restores a pristine step.
4. The pilot's demo lives *inside* the app, so frame and viewer share an origin and it reads the frame's DOM directly. Code2Flow's viewer is on `127.0.0.1:4317`; a target dev server is another origin. **Nothing that reads `contentDocument` can be ported as-is.**

The owner asked for this to become a Code2Flow feature usable on any codebase, so the pilot's demo shrinks to configuration and stories.

## Decision

1. **Vocabulary, no new data concept.** A walkthrough is a **Story** (Story Manifest). "Playlist" is UI wording the viewer does not use. A step is a Story step (`screen` id, Route Screen or State Screen); a filmstrip item is a step's Screen Node. A screen reached outside a story (⌘K) opens a *feature walk*: the feature's Route Screens in edge order from its entry, each followed by its State Screens. New term **Stage**: the presenter surface that shows one step at audience scale. It **replaces Play's Focus view**; the Play grid stays as the gallery, existing `…/play/<n>/focus` deep links keep working.

2. **Story Manifest v3 (additive).** v1/v2 files stay valid. New optional fields:
   - manifest `locales: ["en", "vi"]` (first = default); any audience text is `Text = string | { [locale]: string }`;
   - story `title`, `description`: `Text`; step `title` (audience name for this step), `caption` (one line under the frame, audience), `note` (presenter-only), `cue` (presenter-only: what to do to arrive here). `via` keeps its ADR-0006 meaning — the Action Trigger label matched against detected edges — and is never free prose;
   - manifest `names: { "<feature id>" | "<screen id>": Text | { text: Text, source: string } }`: the audience-name layer, used by every view (map, rail, lanes, palette, Stage). Resolution: `names` → captured real title → humanized id. `source` records the evidence for owner review.
   `stories validate` warns on a locale missing from any `Text`, a `names` key that is neither a feature nor a screen, and a `via` longer than a trigger label.

3. **Captured first, live when available.** Every step always has its captured Screen Preview; the Stage shows it until (and unless) a live frame is ready. Live is used only in `serve` when `stage.url` (default `serverUrl`) is set, is a **loopback** URL (`127.0.0.1`, `localhost`, `[::1]`; anything else is a config error — ADR-0001), answers at `serve` start, and does not refuse framing (`X-Frame-Options` / `frame-ancestors`, probed from Node). Otherwise the Stage says why in one line ("captured · nothing answers at …") and stays captured. `export` and `render` are **captured only**: a hand-out never reaches into the recipient's machine. A step whose screen has no URL (`#` local-state overlays, hover states, unresolved samples) shows the capture with its `via` so the presenter can open it by hand in Live.

4. **Cross-origin bridge over `postMessage`, opt-in.** Code2Flow ships a dependency-free ESM snippet, `design-os-code2flow/stage-bridge`, that the target app installs in development only (`installStageBridge({ navigate })`, one line next to its router). It activates only when framed with the `c2f-stage` query marker, accepts messages only from the viewer's loopback origin on port 4317, and answers a versioned protocol defined once in `src/schema/stage-bridge-protocol.ts`: `hello`, `navigate(path)` (same-origin path only, resolves after the route committed and two frames painted), `scroll(x, y, dx, dy)` (view-only wheel/drag), presenter-key forwarding with the pilot's ownership rules (text fields own characters, tabs/listboxes own arrows, popups own `Escape`), and `touched` (the presenter interacted). It never sends DOM content, cookies or storage to the viewer.
   **Without the bridge**, everything still works on URLs alone: each step sets the frame's `src` (capture shown until load), view-only has no wheel scroll, and Live needs a visible "Exit live" control because keys inside the frame cannot reach the Stage. The Stage shows which mode it is in ("bridge" / "URL only").

5. **View-only default, `E` for Live.** View-only: the frame is `inert`, a shield takes the pointer, focus stays on the Stage (←/→, `C` captions, `N` notes, `I` evidence, `L` language, `F` fullscreen, `?`). Live: shield and `inert` removed, red outline and a `role=status` announcement. Stepping or leaving Live ends Live; a touched frame is reloaded at the step's URL (pristine), an untouched one is navigated through the bridge.

6. **Frame sizing and panels.** The frame renders at a logical size that fills the Stage (floor 1280×800, scale cap 1.25, 16 px air), at natural size below 1024 px wide; panels push the frame instead of covering the product. Stage chrome ≤ 10 % of the window at 1280×720, 1440×900 and 1920×1080.

7. **Language.** Stage copy (story, captions, notes, names) switches between manifest `locales` with `L`; when `stage.localeParam` is set (e.g. `"lang"`), the live frame's URL carries it, so the product switches too. Stage chrome strings ship in English and Vietnamese; other locales fall back to English.

8. **Security and privacy.** `serve` adds `frame-src <stage origin>` to the viewer CSP only when live is on; the iframe is `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"` (no top navigation, so the app cannot navigate the viewer away); every message is checked for `origin` **and** `source === frame.contentWindow`. The live frame uses the presenter's own browser session for the app, never `.code2flow/storage-state.json`. Presenter notes travel in every export like the rest of the manifest; the export note about signed-in captures applies to live data on screen.

## Alternatives considered

- **Screenshots only.** Simplest and fully offline, but loses what the pilot's audience valued most: the real product, scrollable and operable on demand. Kept as the default fallback, not the ceiling.
- **Reverse-proxy the dev server through `127.0.0.1:4317`** (same origin, pilot code ports unchanged). Rejected: breaks HMR sockets, cookies and absolute redirects of arbitrary frameworks, and puts the target app's scripts on the origin that serves `graph.json` with source snippets (the serve Host check exists to keep that data private).
- **Same-origin `window` function bridge** (the pilot's). Works only inside the app's own origin; cannot cross `4317 ↔ app port`. Superseded by the `postMessage` protocol, which the pilot can adopt in place of its bridge.
- **Playwright-driven remote browser streamed into the viewer.** Heavy, adds a streaming stack, latency and a second browser session; rejected for a local presenter tool.
- **"Playlist" as a separate file or concept.** Would duplicate order, screens and validation already in the Story Manifest and split the PRD→story workflow. Rejected: stories gain copy fields instead.
- **Names in `code2flow.config.json`.** Config is technical (servers, capture, login); names are authored content reviewed with stories and localized like captions. Placed in the manifest.

## Consequences

- **Pros:** any repo gets a presentable Stage from data it already has (order, `via`, evidence, captures); live when a dev server runs, captured everywhere else, including offline exports; the pilot's in-app demo can shrink to `code2flow.config.json` + `code2flow.stories.json` + one bridge line.
- **Cons:** a second, security-sensitive surface (framing + `postMessage`) to test; the bridge is a small public API that must stay versioned; without the bridge, stepping pays a document load (~0.3 s built, ~0.9 s dev in the pilot) and view-only cannot scroll; manifest v3 grows authoring effort (the stories-from-PRD skill must learn the copy fields).
- **Hosted demos are out of scope here.** The pilot also deploys its in-app demo next to the app (same origin, live). A hosted export that frames its *own* origin (`frame-src 'self'`, relative URLs, no host named in data) is compatible with this ADR's rules but needs its own decision before the pilot's in-app demo can be removed from its deployments.
- Acceptance is the pilot app and one fixture app (a history-router SPA with the bridge, and the static-site fixture without it); see the plan in the maintainer's `plans/` folder.
- `CONTEXT.md` gains **Stage** and **Audience Name**; `playlist` goes to _Avoid_ under Story Manifest.
