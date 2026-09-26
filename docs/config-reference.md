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
  "storageState": ".code2flow/storage-state.json",  // Playwright session for apps behind a login (relative to this repo; this path is the default when the file exists)
  "stage": {                          // Presenter Stage live frame (serve only); every field optional
    "url": "http://127.0.0.1:3000",   // default: serverUrl; must be 127.0.0.1, localhost or [::1] — anything else is a config error
    "live": true,                     // false = the Stage always shows captures
    "frameQuery": { "review": "0" },  // appended to every frame URL (hide an in-app overlay, pick a preview mode)
    "localeParam": "lang"             // the frame URL carries ?lang=<Stage locale>; absent = the app's language is untouched
  }
}
```

> `run` executes `devCommand` with a shell inside the target repo, exactly like `npm run dev` would. It is a repo-supplied command: read `code2flow.config.json` before running Code2Flow on a repo you did not write. The command is echoed before it starts.

- `match` accepts an exact path or `/prefix/**`. First match wins. Routes matched by nothing fall back to their top segment; `/`, `/settings…`, `/notifications` go to `account`.
- Route samples are resolved in order: string-literal hrefs in the code → links discovered on captured pages → `routeExamples` → the `needs-sample` counter (and lint finding).
- `stage`: `serve` probes `stage.url ?? serverUrl` once at start (2 s timeout, reads `X-Frame-Options` and `frame-ancestors`) and logs `stage  live <url>` or `stage  captured · <reason>`. Only when live does the served viewer's CSP gain `frame-src <origin>`; exports never do. `serve --no-live` forces captures. The frame URL for a step is the screen's captured URL (`url-map.json`) plus `frameQuery`, `c2f-stage=1` and `<localeParam>=<locale>`.

## `code2flow.stories.json` (Story Manifest)

Produced from a PRD by `code2flow stories scaffold` + the `code2flow-stories-from-prd` skill, or written by hand. v1 files (only `screens`) and v2 files stay valid; v3 adds optional audience copy for the Stage.

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

### v3: audience copy for the Stage

```jsonc
{
  "version": 3,
  "locales": ["en", "vi"],                       // first = default; absent → one unnamed locale
  "names": {                                      // Audience Names, used by every view (map, rail, palette, Stage)
    "idp": { "text": { "en": "Identity provider", "vi": "Nhà cung cấp danh tính" }, "source": "docs/product-map.md" },
    "/idp/approvals": { "en": "Approvals inbox", "vi": "Hộp thư phê duyệt" }
  },
  "stories": [{
    "id": "approve-request",
    "title": { "en": "Approve or reject a pending request", "vi": "Duyệt hoặc từ chối một yêu cầu" },
    "description": { "en": "…", "vi": "…" },
    "feature": "idp", "entry": "/idp/approvals",
    "steps": [
      { "screen": "/idp/approvals",
        "caption": { "en": "The approver sees every pending request.", "vi": "Người duyệt thấy mọi yêu cầu đang chờ." },
        "note": { "en": "Three requests, newest first.", "vi": "Ba yêu cầu, mới nhất trước." } },
      { "screen": "/idp/approvals?modal=approve-confirm", "via": "Approve",
        "title": { "en": "Confirm the approval", "vi": "Xác nhận phê duyệt" },
        "cue": { "en": "Click Approve on the first row.", "vi": "Bấm Approve ở dòng đầu." },
        "caption": { "en": "A confirm dialog names the request before anything changes.", "vi": "Hộp thoại xác nhận nêu tên yêu cầu trước khi thay đổi." } }
    ]
  }]
}
```

Every text field (`title`, `description`, `caption`, `note`, `cue`, `names` values) is a plain string (the default locale) or one string per locale. `caption` is read by the audience under the screen; `note` and `cue` are presenter-only (`N` on the Stage) but travel with the manifest into exports. `via` keeps its meaning: the Action Trigger label matched against detected edges, never a sentence. Names resolve `names[id]` → captured real title → humanized id; a step `title` overrides the name inside that story only. `L` on the Stage cycles `locales`.

`code2flow stories validate` adds (all warnings): a locale missing from any text, a `names` key that is neither a feature id in this manifest nor a screen id, two names in one manifest showing the same text, v3 fields on a file that still says `"version": 2`, and a `via` longer than 60 characters or containing sentence punctuation (*reads like a sentence: via is the Action Trigger label; put directions in "cue"*).

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
