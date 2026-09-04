# Code2Flow

Turn a web codebase into a local, evidence-backed Flow Canvas your product team can explore. Every screen is a real screenshot, every arrow is an action found in the code with `file:line` evidence and a confidence tier. Nothing leaves your machine.

Supported today: Next.js App Router, React Router (v6/v7), static HTML folders — see [adapters](docs/adapters.md).

![Flow canvas](https://raw.githubusercontent.com/jangtrinh/design-os-code2flow/main/docs/assets/feature-inspect.png)

## Install

```bash
npm i -g design-os-code2flow
code2flow
```

Node 20+, Google Chrome, and the target app's development server are required.

## Quick start

```bash
code2flow init  /path/to/your-app    # config, .gitignore, AGENTS.md section, agent skills
code2flow run   /path/to/your-app    # dev server → scan → screenshots → lint → offline export
code2flow serve /path/to/your-app    # http://127.0.0.1:4317
```

![Terminal run](https://raw.githubusercontent.com/jangtrinh/design-os-code2flow/main/docs/assets/terminal-run.gif)

Start with the **[user guide](docs/user-guide.md)** — install to hand-outs, step by step.

## What you get

**See the product map first.** Features and the transitions between them, before any single flow.

![Product map](https://raw.githubusercontent.com/jangtrinh/design-os-code2flow/main/docs/assets/product-map.png)

**Inspect what the code found.** Click a screen or an edge pill: trigger, target, confidence, `file:line` evidence.

![Inspector panel](https://raw.githubusercontent.com/jangtrinh/design-os-code2flow/main/docs/assets/inspector-edge.png)

**Recognize UI states.** Modals, tabs, drawers, dropdowns and hover overlays are frames of their own, on a tinted container next to their page.

![State Screens](https://raw.githubusercontent.com/jangtrinh/design-os-code2flow/main/docs/assets/state-frames.png)

**Present one story at a time.** A clean lane per story, keyboard stepping, both sidebars out of the way.

![Present lane](https://raw.githubusercontent.com/jangtrinh/design-os-code2flow/main/docs/assets/present-lane.png)

**Play every step as a gallery.** All screenshots of a story in order; click any card to make it current.

![Play gallery](https://raw.githubusercontent.com/jangtrinh/design-os-code2flow/main/docs/assets/play-gallery.png)

**Keep the legend close.** The left rail holds features, stories and the arrow legend; every canvas icon explains itself on hover.

![Rail legend](https://raw.githubusercontent.com/jangtrinh/design-os-code2flow/main/docs/assets/rail-legend.png)

## Docs

- [User guide](docs/user-guide.md)
- [Getting started](docs/getting-started.md)
- [Configuration reference](docs/config-reference.md) — `code2flow.config.json`, `code2flow.stories.json`
- [Ingestor adapters](docs/adapters.md)
- [Confidence tiers and capture policy](docs/confidence-and-capture.md)
- Decisions: [docs/adr/](docs/adr/)

For agents: skills `code2flow-map-codebase`, `code2flow-answer-flow-questions`, `code2flow-stories-from-prd` ship in the package and are copied into your repo by `code2flow init`.

## Develop

```bash
npm run cli -- scan fixtures/synthetic/app-router-basic   # run from source (tsx)
npx tsc --noEmit && npx vitest run                          # browser tests drive the installed Chrome
npm run recall                                              # parser vs hand-labelled ground truth
npm run audit:design                                        # design:os floors on a fixture export
```

Layout: `src/parser` (adapters → CanonicalFlowGraph), `src/snapshot` (Playwright capture), `src/lint`, `src/viewer` (vanilla TS + SVG), all sharing only `src/schema`.
