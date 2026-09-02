# Agent Memory — doc-updater

> Recipe library for keeping `docs/*.md` and `MEMORY.md` in sync with code changes.
> Index only — see `.claude/rules/agent-memory.md` for the governance format.

## Durable knowledge

- No tracker table yet — doc-updater adds one only once a doc-drift pattern recurs ≥2× (per `.claude/rules/agent-memory.md`).
- The binding scope rules (cross-reference audit, steering drift, severity escalation) live in `.claude/rules/agent-doc-updater.md` — this file holds only the doc-sync recipes.

## Recipes

### Migration reveals an undocumented structural constraint
1. Add it to `docs/database.md` § Migration Rules as a numbered rule with a clear explanation; include example syntax where relevant (e.g. `DROP FUNCTION IF EXISTS` before `CREATE OR REPLACE` when the return type changes).
2. No changes to `plan.md`, `decisions.md`, or `security.md` if the migration itself was already documented as complete.
3. Bump the `docs/database.md` footer timestamp.

### RPC superseded / deprecated by a newer one
1. `docs/database.md` § RPC summary table — mark the old RPC `(DEPRECATED — use <new_rpc>)`; list the new RPC separately with its purpose.
2. RPC detail sections — add a deprecation header to the old RPC's section; document the new RPC in full (parameters, behavior, atomicity guarantees).
3. `docs/decisions.md` — record the deprecation as a CONFIRMED DECISION section, explaining the problem the new RPC solves (atomicity, partial-failure risk, etc.).
4. Bump footer timestamps in both `docs/database.md` and `docs/decisions.md`, noting the reason.

### Internal hook / utility extraction (not a breaking API change)
- No doc updates needed when the hook/util is an internal implementation detail.
- Document only if it becomes public API or is reused across multiple features.

### RETURNS TABLE widened + sibling RPC added to a family (e.g. migs 118–121 Phase 2)
1. RPC naming/summary table — update the changed RPC's one-liner to mention the new column count and new behavior; add the new sibling RPC as a separate entry.
2. RPC detail section (changed RPC) — replace the `RETURNS TABLE` signature block; explain the structural reason for DROP+CREATE (RETURNS TABLE is not signature-compatible with CREATE OR REPLACE); document new columns + stripping guarantees; document any new security gate added (active-user gate, etc.).
3. Insert a new RPC detail section for the sibling (new RPC) after its closest family member; include guard set, §15 carve-out if applicable, parameter list, return shape, and signature (no full body needed).
4. §3 carve-out list ("Other functions sharing this carve-out") — add the new sibling to the list.
5. Bulk dispatcher refactored (per-type helpers) — update the dispatcher's key-behavior bullets and SQL body; document internal helpers with REVOKE EXECUTE FROM PUBLIC in the key-behavior section; note Decision reference.
6. Footer timestamp — prepend the new update entry.
- Do NOT edit `.spec-workflow/steering/*.md` directly; flag any drift as DRIFT finding.

### Playwright E2E tests added
1. `docs/plan.md` — mark the relevant phase complete; list the new specs, helpers (Mailpit, Supabase), and scripts (`pnpm e2e`, `e2e:ui`, `e2e:headed`); update the status line and footer.
2. `MEMORY.md` — keep the Tests summary count accurate (unit + integration + E2E); note any newly configured tooling (e.g. `@playwright/test`).
3. Files to check: `apps/web/playwright.config.ts`, `apps/web/e2e/`, `apps/web/package.json` (new scripts), `pnpm-lock.yaml` (new dep).

### A commit corrects a false rationale in a code comment (code-style.md §10 class)
`plan.md`/`decisions.md` narrative sections sometimes COPY a code comment's justification for a
gate/rule verbatim (e.g. "why this validator exists"). When a commit rewrites that comment because
the original justification was FALSE (not just reworded — actually wrong), grep the doc prose for
the same false claim's distinctive phrase, not just the file/rule name — the doc copy goes stale
silently because the doc-diff itself never touches it (the false claim was in the CODE COMMENT, not
in the doc, when it was first written). Fix the doc to state the corrected rationale, matching the
new comment's reasoning, not just its conclusion. Instance (2026-08-18, `chore/part3-audit-followup`):
`mc-content.ts`'s comment justified the MC key-balance gate with "guessable without reading a
stem" — false, because the graded draw shuffles options `ORDER BY random()`. The commit rewrote the
comment to the correct rationale (content-quality + admin-editor mis-render hazard); `docs/plan.md`
carried the same false phrase in its "Why the MC pools have an enforced key-balance gate" callout,
untouched by that commit's diff. count=1 (WATCHING) — promote the general check ("did a
rationale-correcting commit leave a doc copy of the old rationale behind") if it recurs.

### A doc line says an issue is "deferred"/"open" and the SAME branch closes it
A `Closes #N` trailer in this branch's own commits does not retroactively fix a `plan.md`/
`decisions.md` line elsewhere that still narrates `#N` as open/deferred — `gh issue view N` shows it
OPEN until merge, so don't rely on issue state to catch this; grep `docs/plan.md`/`docs/decisions.md`
for every issue number a `Closes #N` trailer in the branch's commits touches, and update any prose
that characterizes that issue as open. Instance: `chore/part3-audit-followup` closed #1194 (recorded
as resolved via new Decision 57), but `docs/plan.md`'s dated "Open: ... deferred ... #1194 ..." line
was untouched by the branch's diff and still read as if #1194 were an open deferral.

### Claim re-typed unchanged in a reflowed block (code-style.md §10 clause 5)
A claim copied verbatim into a reflowed paragraph/comment block arrives on a `+` line but reads as
already-reviewed text, slipping the one review most likely to catch it (diff-scoped or impl-critic
opening the cited source file without suspicion). When a diff re-types a block unchanged, every claim
it contains that a source file can answer (e.g., "function X does Y") must be re-derived from that
source, not re-read. Instance (2026-09-02, `18757ddf`): `CLAUDE.md`'s claim about `generate-agent-files.js`
comparing "byte-for-byte" — false, the actual code folds line endings — survived four passes because
it was re-typed verbatim in a reflowed paragraph while impl-critic had the file open but verified a
different claim.
