# Configuration reference

Two optional files in the **target repo** root. Everything has a default; the files exist for what static analysis cannot know.

## `code2flow.config.json`

```jsonc
{
  "features": [                       // groups the product map and the left rail; default = top URL segment
    { "id": "access",  "title": "Access",  "match": ["/sign-in", "/welcome"], "order": 0 },
    { "id": "billing", "title": "Billing", "match": ["/billing/**"],          "order": 1 }
  ],
  "routeExamples": {                  // concrete URLs for dynamic routes the parser cannot resolve
    "/users/[id]": ["/users/alice"],
    "/docs/[...parts]": ["/docs/getting-started/install"]
  },
  "capture": {                        // defaults shown
    "baseWidth": 1440, "baseHeight": 900,
    "capWidth": 2200,  "capHeight": 10000,
    "quality": 65
  },
  "serverUrl": "http://127.0.0.1:3000",   // used when `snapshot` is run without --url
  "devCommand": "npm run dev",             // executed with your shell in the target repo — treat like a package script
  "storageState": ".code2flow/storage-state.json"  // Playwright session for apps behind a login (relative to this repo; this path is the default when the file exists)
}
```

> `run` executes `devCommand` with a shell inside the target repo, exactly like `npm run dev` would. It is a repo-supplied command: read `code2flow.config.json` before running Code2Flow on a repo you did not write. The command is echoed before it starts.

- `match` accepts an exact path or `/prefix/**`. First match wins. Routes matched by nothing fall back to their top segment; `/`, `/settings…`, `/notifications` go to `account`.
- Route samples are resolved in order: string-literal hrefs in the code → links discovered on captured pages → `routeExamples` → the `needs-sample` counter (and lint finding).

## `code2flow.stories.json` (Story Manifest)

Produced from a PRD by `code2flow stories scaffold` + the `code2flow-stories-from-prd` skill, or written by hand. v1 files (only `screens`) stay valid.

```jsonc
{
  "version": 2,
  "features": [ /* same shape as the config; wins over the config when both exist */ ],
  "stories": [{
    "id": "approve-request",
    "title": "Approve or reject a pending request",
    "feature": "idp",
    "order": 2,
    "source": "docs/prd/approvals.md#approve",
    "entry": "/idp/approvals",
    "steps": ["/idp/approvals", { "screen": "/idp/approvals?modal=approve-confirm", "via": "Approve" }, "/idp/approvals?status=approved"],
    "branches": [{ "title": "Reject", "from": "/idp/approvals", "steps": ["/idp/approvals?modal=reject-reason", "/idp/approvals?status=rejected"] }],
    "exit": ["/idp/approvals?status=approved", "/idp/approvals?status=rejected"],
    "screens": ["/idp/approvals", "/idp/approvals?modal=approve-confirm", "/idp/approvals?status=approved", "/idp/approvals?modal=reject-reason", "/idp/approvals?status=rejected"],
    "acceptance": ["Approve and Reject each open a confirm dialog"]
  }]
}
```

`screens` may be omitted in v2: it is derived from `steps` and `branches`. `code2flow stories validate` reports: a step without a `screen` id (error), unknown screen ids (warn), entry not in screens (warn), duplicate ids / empty screens (error), and for every consecutive `steps`/`branches` pair with no detected transition: *asserted by the PRD, not found in code* (warn), suffixed *"(endpoint not in graph)"* when either screen is itself unknown. That last one is the drift signal; it is never auto-fixed or silently skipped even when an endpoint is a ghost screen — a ghost step gets both the unknown-screen warning and the no-transition warning.

Feature ids (in either file) must match `^[a-z0-9][a-z0-9._-]*$` — they end up in export filenames and the viewer's URL hash, so anything else is rejected with a one-line error.

## Screen ids

- Route Screen: the route path as in the App Router tree: `/users`, `/users/[id]`, `/docs/[...parts]`.
- State Screen: parent route + the query that addresses it: `/users?drawer=edit-roles`, `/checkout?step=review`, `/orders?tab=archived`; overlays toggled by local state use `#`: `/invite#edit-roles-drawer`.

## locale

`"locale": "en"` — the locale used to fill a `[locale]` / `[lang]` segment when sampling dynamic routes. Default: the app`s `defaultLocale` from its next-intl routing file, else the first `messages/<locale>.json`.

## login

Scripted sign-in for apps behind authentication. Only the NAMES of the environment variables live in the config; values are read from the environment when `login` or `run` executes and are never written anywhere.

| Field | Default | Meaning |
| --- | --- | --- |
| `path` | `/login` | page with the sign-in form |
| `emailEnv` | required | env var holding the email / username |
| `passwordEnv` | required | env var holding the password |
| `successUrl` | any path other than `path` | where the app lands after a successful sign-in |
| `selectors.email` / `.password` / `.submit` | auto-detected (`input[type=email]`, `input[type=password]`, the submit button) | CSS selectors for unusual forms |

`run` signs in before capturing when `login` is set and `.code2flow/storage-state.json` is missing (`--relogin` forces it); the summary line reports `login: ok`, `login: skipped (no <ENV>)` or `login: failed (<reason>)`. `code2flow login <repo> --url <server>` runs the same flow alone; `--email-env`, `--password-env`, `--path`, `--success-url` override the config and `--manual` opens a window to sign in by hand.
