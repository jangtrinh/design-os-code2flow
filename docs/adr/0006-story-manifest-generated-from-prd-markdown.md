# ADR 0006: Story Manifest Generated From PRD Markdown

- **Status:** Accepted
- **Date:** 2026-09-03
- **Deciders:** Product Owner, Architect

## Context

User Story Clusters need a data source. The PO's source of truth is PRD markdown (free text), which cannot be mapped deterministically onto routes by static parsing. `UserStory[]` had been placed inside `CanonicalFlowGraph` although no adapter could produce it.

## Decision

1. Stories live in a separate **Story Manifest** file, `code2flow.stories.json`, next to the target repo. `CanonicalFlowGraph` no longer contains `UserStory[]`; the viewer joins graph and manifest by screen id.
2. Manifest format (v1):
   ```json
   {
     "version": 1,
     "stories": [
       {
         "id": "guest-checkout",
         "title": "Guest Checkout",
         "source": "docs/prd/checkout.md#guest-checkout",
         "entry": "/cart",
         "screens": ["/cart", "/checkout", "/checkout/success", "/checkout#payment-modal"],
         "acceptance": ["Guest can pay without creating an account"]
       }
     ]
   }
   ```
3. **Import workflow** (PRD markdown → manifest) is agent-assisted and lives outside the tool's runtime, preserving local-first with no API keys in Code2Flow:
   - `code2flow stories scaffold <prd.md>` emits a prompt pack: the PRD text, the current screen list from `graph.json`, and the manifest JSON schema.
   - The user's coding agent (Claude Code skill `code2flow-stories-from-prd`, or any LLM) fills the manifest.
   - `code2flow stories validate` checks the manifest against the schema and against `graph.json`, reporting unknown screen ids instead of dropping them.
4. Reachability filtering (entry node + depth N) remains available without a manifest.

## Trade-offs & Consequences

- **Pros:** Deterministic tool, LLM step is auditable and re-runnable; PRD stays the PO's source of truth; manifest is diffable in git.
- **Cons:** Two-step workflow for the PO; manifest drifts when routes are renamed (mitigated by `validate`).
