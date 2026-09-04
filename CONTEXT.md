# Code2Flow

Local CLI that parses a web codebase and opens an interactive user flow canvas of its screens.

## Language

<!-- Domain glossary — one term per concept. Filled by /es:brainstorm grilling sessions as terms crystallise.
Glossary ONLY: no implementation details, no specs, no decisions (those go to docs/adr/).
Format:
**{Term}**:
{One-two sentence definition of what it IS.}
_Avoid_: {rejected synonyms}
-->

**Screen Node**:
A visual node on the interactive canvas that represents one thing a user perceives as a distinct screen in the target web codebase: a route, a modal overlay, a wizard step, or a tab state. Shows its title, route path or state label, and a Screen Preview.
_Avoid_: page box, screen card

**Frame** (viewer-side, decided 2026-09-03):
The drawn box of one Screen Node on the canvas: header (feature eyebrow, real title, route path), Screen Preview, footer chips. "Frame" names the geometry and layout unit in `src/viewer` (`frameNode`, `frameDims`, frame edges); "Screen Node" names the domain object. User-facing text says "screen", never "frame".

**Route Screen**:
A Screen Node backed by a URL route in the target codebase's router.
_Avoid_: page node, url node

**State Screen**:
A Screen Node nested under a parent Route Screen that represents a modal, drawer, wizard step, or tab, reached by a UI state change or a query parameter (`?modal=`, `?step=`, `?tab=`).
_Avoid_: sub-screen, virtual page, overlay node

**User Flow Edge**:
A directed connection line linking an action trigger on a source screen to the resulting destination screen.
_Avoid_: wire, arrow line, connection

**Action Trigger**:
The interactive UI element (button, link, form submission, modal toggle, step/tab change) on a screen that initiates a transition to another screen.
_Avoid_: event handler, clicker, hook

**Shell Navigation Edge**:
A User Flow Edge originating from the app shell (sidebar, top nav, notification bell) that is available from every screen; drawn once and hidden by default.
_Avoid_: global link, nav edge, sidebar arrow

**Transition Confidence**:
The tier (`high`, `medium`, `low`) expressing how certain the Codebase Ingestor is that a User Flow Edge exists and points where it claims.
_Avoid_: score, certainty level, accuracy

**Flow Canvas**:
The pan-and-zoom infinite interactive workspace where screen nodes and flow edges are laid out and explored.
_Avoid_: whiteboard, diagram board

**User Story Cluster**:
A filtered sub-graph of the flow canvas isolating the screen nodes and transitions belonging to one story in the Story Manifest, or reachable from a chosen entry node within N hops.
_Avoid_: sub-flow, slice, group view

**Story Manifest**:
The Code2Flow-format file (`code2flow.stories.json`) that lists each PRD user story with its entry screen and member screens, produced from the PO's PRD markdown.
_Avoid_: story config, PRD file, tags file

**Screen Preview**:
The visual representation inside a Screen Node, rendered either as an automated screen snapshot or a structured list of detected UI elements.
_Avoid_: card image, screenshot card, thumbnail, wireframe

**Codebase Ingestor**:
The static analysis engine that parses the target codebase's directory structure, routes, and UI components to extract screens and navigation actions.
_Avoid_: scanner, scraper

**Ingestor Adapter**:
A modular parser plugin tailored to a specific web framework (HTML, React Router, Next.js) that normalizes code into the canonical flow graph schema.
_Avoid_: converter, driver, parser module
