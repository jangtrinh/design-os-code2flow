# ADR 0001: Local-First AST & Canvas Architecture

- **Status:** Accepted
- **Date:** 2026-09-03
- **Deciders:** Product Owner, Architect
- **Amended by:** ADR-0004 (viewer is a static Vite bundle served by the CLI, not a Next.js app), ADR-0005 (screen scope + confidence tiers)

## Context

Vibe-coding developers and Product Owners need a way to visualize user flows from web codebases without manually recreating screens and arrows in Figma. Existing options require either uploading proprietary source code to cloud servers or running full E2E crawler runs that depend on active database credentials and auth bypasses.

## Decision

We adopt a **Local-First, Dual-Layer Architecture**:
1. **Layer 1 (Static AST Route & Trigger Extraction):** Use `@babel/parser` / `ts-morph` locally to extract routes, `<Link>`, `router.push`, and form actions into a canonical `FlowGraphSchema`. This requires zero running servers, works in under 2 seconds, and preserves 100% code privacy.
2. **Layer 2 (Interactive Canvas with Progressive Previews):** Render screens and flows on a local `@xyflow/react` canvas served by the CLI (see ADR-0004). Screen previews progressively enhance: default to a structured list of detected UI elements; if a local dev server is active, capture headless Playwright snapshots.

## Trade-offs & Consequences

- **Pros:** 
  - Zero cloud dependency, zero security/data privacy concerns.
  - Instant visualization even if the target app has compilation or database connection issues.
  - No Figma subscription or manual diagram maintenance needed.
- **Cons:**
  - Highly dynamic routes with backend-computed URLs may require heuristic fallbacks.
  - Screenshots require a running local dev server to capture pixel-perfect previews.
