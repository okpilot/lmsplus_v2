---
name: redteam
description: Run the red team test suite and report results
user_invocable: true
---

# /redteam — Red Team Test Suite

Run the adversarial security test suite against local Supabase.

## Prerequisites

1. Local Supabase must be running: `npx supabase start`
2. Next.js dev server must be running: `pnpm dev` (only needed for PKCE test)
3. Test data must be seeded (specs handle this automatically)

## Steps

### 0. Establish the expected baseline (do this BEFORE running)

There is no hardcoded expected-results table — it drifts the moment a spec is
added. Derive the baseline at runtime from two live sources:

- **Expected per-spec status** — the source of truth is the `## Vector-to-Spec
  Mapping` table in
  `.claude/agent-memory/red-team/topics/attack-surface.md` (the `Status`
  column). The cells are free-form prose, not a fixed enum — the runner is you,
  an agent, not a regex, so judge each row's posture from the **leading
  word(s)** of its `Status` cell by meaning, ignoring trailing commit refs,
  quotes, or a vector-ID prefix (e.g. `CK2 COVERED` → treat as `COVERED`). Two
  buckets (representative, not exhaustive — bucket new statuses by meaning):
  - **Defense should hold → spec expected to PASS:** statuses that read as
    covered or enforced — `COVERED` (incl. `COVERED AT INTEGRATION LAYER`,
    `FULLY COVERED`), `PASSING`, `FIXED`, `ENFORCED`, `HARDENED`, `DB-CAPPED`.
  - **Known gap, or assessed-safe with no spec → no PASS expected:** `GAP`,
    `DOCUMENTED GAP`, `PARTIAL`, `TBD`, `INTENTIONAL`, and the `ASSESSED …`
    family (`ASSESSED LOW`, `ASSESSED NON-ISSUE`, `ASSESSED IMPROVED`) — these
    usually carry `(no spec)` in the Spec File column, so they produce no
    Playwright result and matter only for the coverage/drift check.

  The `Status` column does **not** use the word `SKIPPED` — that is a Playwright
  run state (step 2), not a mapping posture. Print just this section (the `awk`
  range stops at the next `## ` heading without printing it):
  ```bash
  awk '/^## Vector-to-Spec Mapping/{f=1;print;next} /^## /{f=0} f' \
    .claude/agent-memory/red-team/topics/attack-surface.md
  ```
- **The live spec set** — what actually exists on disk:
  ```bash
  ls apps/web/e2e/redteam/*.spec.ts
  ```

Spec-level `.skip` / `.fixme` markers corroborate documented-gap rows but are
not the primary source — the `COVERED`-vs-`PASSING` nuance and vector context
live only in attack-surface.md.

### 1. Run the red team specs

```bash
pnpm --filter @repo/web e2e:redteam
```

### 2. Compare actual results against the baseline and report

Map each spec's Playwright run result (`passed` / `failed` / `skipped`) against
its expected posture from step 0 — a `passed` "defense should hold" spec is
normal; a `skipped` spec corresponds to a known-gap row. Then surface three
**drift** classes:

- **Newly failing** — a spec the mapping lists as `PASSING`/`COVERED` now fails.
  A defense was weakened: treat as **CRITICAL**. Read the failing spec to
  identify the attack vector and report the exact vector + recommended fix.
- **Uncovered spec** — a spec file exists on disk but has no row in the
  Vector-to-Spec Mapping. Coverage drift: flag it so the red-team agent /
  attack-surface map can be updated.
- **Stale mapping row** — a mapping row whose spec file no longer exists on
  disk. Flag it for removal from attack-surface.md.

### 3. Write back the current status

Update the `## Vector-to-Spec Mapping` table (and Lessons Learned, if a vector
changed) in `.claude/agent-memory/red-team/topics/attack-surface.md` to reflect
this run — closing the read → run → compare → write loop.
