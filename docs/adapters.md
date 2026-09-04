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
`mailto-link`, and other external links as `external-link`, per source file. The tag
scanner is intentionally tolerant rather than a full HTML parser: it does not model
malformed HTML, templates, script-built URLs, arbitrary JavaScript, or hash-router
applications.
