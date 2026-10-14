# `design-os-code2flow` Prompt & CLI Cookbook

Copy-paste recipes for **DESIGN:OS Code2Flow** (`skills/design-os-code2flow/SKILL.md`).

---

## 1. Generate & Scaffold

> "Scan this Next.js App Router repository with code2flow, generate the Mermaid user-flow diagram, and list all high-severity UX gaps."

## 2. Audit & Verify

> "Audit our SwiftUI navigation stack for dead-end screens, missing loading/error states, and unguarded destructive actions."

## 3. Export & Automate

> "Export a JSON + Markdown user-flow topology report for our PR review gate."

---

## 4. CLI & Diagnostic Commands

```bash
# Run deterministic offline self-check
python3 scripts/self_check.py

# Run primary domain verification / workflow
npm test

# Run primary CLI command
node bin/code2flow.mjs audit .
```
