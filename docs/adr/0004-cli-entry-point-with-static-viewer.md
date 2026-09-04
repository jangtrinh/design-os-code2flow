# ADR 0004: CLI Entry Point With Static Viewer (Supersedes Next.js 16 App)

- **Status:** Accepted
- **Date:** 2026-09-03
- **Deciders:** Product Owner, Architect
- **Amends:** ADR-0001 (Layer 2 stack)

## Context

The initial config named Next.js 16 as the app shell while MoSCoW P0 required `npx code2flow` to run 100% locally on the user's repository. A browser app cannot read a local directory without an upload step or Chromium-only File System Access API, which contradicts local-first. Next.js is also heavy for a developer tool that ships as an npm package.

## Decision

Code2Flow is a **Node.js CLI that serves a static viewer**:
1. `npx code2flow <repo>` runs the Codebase Ingestor in Node, writes `.code2flow/graph.json` (and reads `code2flow.stories.json` if present).
2. The CLI starts a local static server on `127.0.0.1:4317` (strict port) serving a prebuilt Vite/React viewer bundle and the graph JSON, then opens the browser.
3. The viewer is a pure client: canvas, nodes, edges, drawers. It never reads the filesystem; it only fetches JSON from the local server.
4. Single-file HTML export inlines the same viewer bundle plus the graph JSON.

## Trade-offs & Consequences

- **Pros:** True local-first; one `npx` command; viewer bundle reused unchanged for export; no server framework to maintain.
- **Cons:** Playwright snapshots (cycle 2) must run in the CLI process, not the viewer; viewer cannot re-parse without re-running the CLI (add `--watch` later if needed).
