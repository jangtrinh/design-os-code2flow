# ADR 0003: Figma-Like Infinite Canvas Interaction Model

- **Status:** Accepted
- **Date:** 2026-09-03
- **Deciders:** Product Owner, UX Designer, Architect

## Context

Product Owners require an intuitive, familiar canvas experience to inspect user flows without a steep learning curve. Figma's navigation model (infinite space, spacebar/middle-click pan, pinch-to-zoom, marquee multi-select, and draggable screen frames) is the gold standard for spatial design workflows.

## Decision

We configure `@xyflow/react` with a **Figma-Equivalent Canvas Engine**:
1. **Viewport & Spatial Controls:**
   - Smooth trackpad pan & 2-finger pinch zoom.
   - `Space + Left Drag` or `Middle Mouse Drag` for panning.
   - `Ctrl/Cmd + Wheel` for zoom.
   - `Shift + 1` (Zoom to Fit / Fit View) and `Shift + 2` (Zoom to Selected).
2. **Infinite Canvas Aesthetics:**
   - Subtle dot grid background (`#1E293B` on `#0B0F19`) replicating Figma's canvas matrix.
   - Minimap in the bottom-right corner with interactive viewport rectangle.
   - Floating glassmorphism toolbar (Zoom In/Out, Fit View, Lock Canvas, Story Filter).
3. **Screen Frame Nodes:**
   - Screen nodes styled like Figma artboard frames: top title banner, route badge, elevated card border, and interactive handle ports for edges.

## Trade-offs & Consequences

- **Pros:** Zero onboarding friction for POs and designers already accustomed to Figma and FigJam.
- **Cons:** Requires capturing key events (`Space`, `Shift`) and preventing default browser scroll behaviors while hovering the canvas.
