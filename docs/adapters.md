# Ingestor adapters

## Static HTML

Static HTML is selected for a directory with one or more `.html` files containing an
anchor `href`, when the root has no `package.json`. Framework adapters get priority:
the static adapter deliberately returns no match for package-based projects.

Route Screen ids are file paths without `.html`: `index.html` is `/` and
`docs/index.html` is `/docs`. State Screen ids append `#dialog-id` for a discovered
`<dialog id>` opened by a literal `showModal()` handler, or `?tab=value` for a literal
tab link. Relative paths and trailing slashes resolve to these same route ids.

The adapter sees literal `<a href>`, form `action`, `location.href` and `window.open`
navigation. Header links repeated on at least half of route screens become one Shell
Navigation Edge. Literal external and mailto links remain external targets; broken
internal paths remain `missing:` targets.

Counters retain anchors without a discovered dialog as `anchor-hash`, mail links as
`mailto-link`, other external links as `external-link`, and duplicate shared header links as
`shell.duplicate-shell-edge`. The tag
scanner is intentionally tolerant rather than a full HTML parser: it does not model
malformed HTML, templates, script-built URLs, arbitrary JavaScript, or hash-router
applications.

## React Router

React Router is selected after Next.js when `package.json` declares `react-router` or
`react-router-dom` and source contains `createBrowserRouter`, `<Routes>`, or `<Route>`.
Route Screen ids normalize `:id` to `[id]` and `*` to `[...rest]`; modal and tab State
Screens append `#id` and `?tab=value`. The adapter extracts literal `<Link>`, `<NavLink>`,
`<Navigate>`, `useNavigate`, and `redirect` transitions, including shell navigation from a
layout with an outlet. Unowned navigation is counted as `navigation-without-route`; history
offsets, hash-only links, unresolved `to` values, and parse failures have their own counters.

Catch-all routes intentionally do not resolve ordinary unmatched literal links: those remain
`missing:` targets so lint keeps reporting broken links. The adapter does not prove runtime
route ownership through arbitrary component composition, computed navigation, hash routers,
or every possible `useSearchParams` data flow.

## Hover states

The Next.js App Router adapter emits a nested State Screen for literal Radix-style
`Tooltip`, `HoverCard`, and `DropdownMenu` trigger/content pairs, and for a literal
`onMouseEnter` overlay. Its id is `<route>#hover-<kind>-<trigger-slug>` and its Action
Edge has `triggerKind: "hover"`; `tooltip`, `popover`, and `dropdown` retain their
distinct Screen Node kinds. Capture needs a literal `data-testid` or `id` on the trigger
to replay the hover. CSS-only `:hover` reveals and literals without that selector become
`hover-trigger-unresolved` counters rather than speculative edges.
