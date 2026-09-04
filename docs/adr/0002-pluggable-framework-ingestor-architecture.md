# ADR 0002: Pluggable Multi-Framework Ingestor Architecture

- **Status:** Accepted
- **Date:** 2026-09-03
- **Deciders:** Product Owner, Architect
- **Scope note (2026-09-03):** Cycle 1 ships only `NextJsIngestorAdapter` (App Router). `HtmlIngestorAdapter`, `ReactRouterIngestorAdapter`, and Pages Router are cycle 2. `UserStory[]` moved out of the graph into the Story Manifest (ADR-0006).

## Context

Target web codebases are heterogeneous: static HTML/CSS/JS multi-page sites, single-page React apps (Vite, CRA, React Router), and full-stack Next.js applications (App Router / Pages Router). A hardcoded parser for a single framework would make the tool unusable for non-Next.js vibe-coded projects.

## Decision

We decouple codebase parsing into a **Pluggable Ingestor Pipeline**:
1. **Framework Detector:** Identifies project type by file tree conventions (`package.json`, index.html, `app/`, `routes/`).
2. **Ingestor Adapters:**
   - `HtmlIngestorAdapter`: Parses `*.html` files with Cheerio / HTML5 parser; extracts pages, `<a href>`, `<form action>`, buttons.
   - `ReactRouterIngestorAdapter`: Parses JSX/TSX AST with Babel; extracts `<Route>`, `<Link to>`, `useNavigate()`.
   - `NextJsIngestorAdapter`: Extracts routes from `app/**/page.tsx` / `pages/**/*.tsx`, `<Link href>`, `router.push()`, `redirect()`.
3. **Canonical Graph Output:** All adapters emit a uniform `CanonicalFlowGraph` (`ScreenNode[]`, `ActionEdge[]`) consumed by the `@xyflow/react` canvas.

## Trade-offs & Consequences

- **Pros:** Zero coupling between the UI canvas and the framework of the target codebase. Support for plain HTML, React, and Next.js out-of-the-box.
- **Cons:** Requires testing against different router conventions and file structures.
