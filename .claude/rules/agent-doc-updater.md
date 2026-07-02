# Agent Rules — doc-updater

> Model: haiku | Trigger: post-commit | Non-blocking

## Purpose
Keeps project documentation in sync with code changes. Watches for schema changes, new RPCs, new routes, dependency updates, and architecture shifts. Updates `docs/plan.md`, `docs/decisions.md`, `docs/database.md`, and `MEMORY.md`.

## Handling Results

### DO
- Commit doc updates alongside fix commits (same batch, separate or grouped as appropriate).
- Verify cross-references — if database.md was updated, check that decisions.md and plan.md are consistent.
- Trust the agent's judgment on what needs updating — it checks the diff against all doc files.
- Let the agent update progress tracking in `docs/plan.md` (sprint status, phase completion).
- Review the agent's doc changes for accuracy — it sometimes hallucinate details about code it didn't read.
- Report DRIFT findings with specific steering doc reference and contradicting code.
- Elevate to CRITICAL when drift contradicts security rules.

### NEVER
- Let the agent make architecture decisions — it documents decisions, it doesn't make them.
- Let the agent create new documentation files unless the user explicitly asks for one.
- Let the agent write speculative docs ("we might need...", "in the future...").
- Let the agent do partial updates — if a change affects multiple docs, all must be updated in the same cycle.
- Let the agent edit `MEMORY.md` without reading it first (it may overwrite recent entries).
- Let the agent pad docs with unnecessary detail — keep docs concise and scannable.
- Ignore the agent's "no changes needed" report — acknowledge it in the summary.
- Edit steering documents directly.
- Skip drift check when steering docs exist.
- Cite a migration number, RPC guard, error string, or other implementation detail — OR assert a feature's existence, capability, scope, or roadmap position — without reading the migration/source file directly. Plans, commit messages, and session context are unreliable for sequential numeric references (e.g. which `mig NNN` a function lives in), exact implementation specifics, AND feature-level claims. Read the file header and body before writing. (Promoted count=3: #856 doc-updater attributed `submit_quiz_answer`'s idempotency gate to mig 112 when it is mig 110; Batch-A `ee4d5544` fabricated a trigger exemption, inverted a guard order, and wrong-stringed an error from the plan summary; ELP Slice-0 2026-07-02 invented an "instructor grading UI / Grade Submissions = Slice 1" feature + a "feature flag" and wrote "No audit_events write" when `start`/`discard` DO write audit events — all from the plan/context without reading migs 151/152. haiku hallucinations include inventing entire features, not just wrong numbers.)

## Key Documents The Agent Watches
| Document | What triggers an update |
|----------|------------------------|
| `docs/database.md` | New migration, new RPC, schema change |
| `docs/decisions.md` | New architectural decision, changed approach |
| `docs/plan.md` | Phase/sprint progress, completed items |
| `MEMORY.md` | Significant new context for future sessions |
| `.spec-workflow/steering/*.md` | Code change contradicts a steering doc statement |

## File Rename Protocol
When the agent detects a renamed file (e.g., `middleware.ts` → `proxy.ts`), it must grep all docs for stale references. This is documented in `code-style.md` Section 9 and the agent enforces it.

## Cross-Reference Audit Rule

When a doc commit adds a **structural** cross-reference to an existing section — a new section whose body links/refers to an existing section, a row added to a summary table or RPC index that points at an existing function/section, or a TOC/anchor entry pointing at an existing target — the doc-updater audits the **entire referenced section** AND any related summary tables, matrices, or RPC indexes — not just lines marked `+` in the diff. Casual prose mentions ("see X for context") added inside otherwise-unrelated edits do NOT trigger this audit.

**Why:** PR #605 (`docs/database.md` `complete_overdue_exam_session` section) had four stale claims surviving since mig 063 widened the function's mode guard from `mock_exam` to `mock_exam OR internal_exam`. Three different reviewers each caught a different stale claim — semantic-reviewer per-commit caught L1310, PR-level semantic sweep caught L635 (RPC summary table), CodeRabbit caught L1290 and L1302 (prose drift). Per-commit doc-updater audited only the `+` lines and missed all four. Four stale claims concentrated in one section, surfaced across three reviewers and two review passes — promoted to a hard rule (the per-`+`-line scope is systematically insufficient regardless of cross-commit frequency, so the standard learner count=N threshold does not apply here).

**How to apply:** When the diff adds a structural cross-reference INTO an existing section:
1. Read the entire target section, not just the cross-reference site.
2. Scan summary tables, matrices, and indexes that mention the target subject (e.g., the `## RPC Summary` row for the function, or schema matrices that list the table).
3. Flag any claim that contradicts the latest migration or current code as DRIFT (severity: ISSUE; escalate to CRITICAL if it contradicts a rule in `docs/security.md` or `.claude/rules/security.md`).

### Repeated numeric-literal counts (e.g. red-team spec count)

When a commit adds a red-team Playwright spec (`apps/web/e2e/redteam/**/*.spec.ts`), the suite's spec-count appears as a **numeric literal in multiple current-state surfaces** and routinely goes stale in some but not all. Grep ALL occurrences of the count literal across `.spec-workflow/steering/tech.md` (it appears 3×: Testing section, Security & Compliance section, Decision 27) AND `docs/decisions.md` (Decision 27) so every current-state occurrence is corrected together. **Respect the steering boundary** (*What the agent does NOT do*, below): the doc-updater does NOT edit `tech.md` directly — it **flags every stale `tech.md` occurrence as DRIFT** and the orchestrator/approval flow applies the edit. `docs/decisions.md` is not a steering doc, so the doc-updater updates it directly per normal doc sync. **Exclude historical milestone records** — a phase-completion entry (e.g. `docs/plan.md` "Phase 5B-6 COMPLETE — N specs as delivered") documents the count at a point in time and must NOT be rewritten. The separate E2E suite count (`tech.md` "Playwright (N specs …)") is a different suite — out of scope for a red-team spec addition.

**Why:** promoted at count=2 (PR #779-family `18→37` stale across tech.md ×3 + decisions.md, after a 2026-05-07 `9-spec` instance). The structural-cross-reference scope above does not catch grep-able repeated numeric literals; this sub-rule does.

The same sub-rule applies to the **integration-test count literal in `docs/plan.md`** (current-phase header + "Integration tests:" line): when a commit adds or removes tests under `packages/db/src/__integration__/`, grep `docs/plan.md` for the current-phase count literal and correct every current-state occurrence together (historical phase-completion entries stay untouched). Promoted at count=2+ on the #697 Phase A branch (115→118, 118→121, 121→125, 125→127 — each bump caught post-commit by the doc-updater instead of landing with the test commit). At count=3+ (2026-06-10) the primary duty shifted to the COMMITTER: update the plan.md count in the same commit that adds or removes integration tests; the doc-updater check remains as the safety net.

### `lefthook.yml` / `ci.yml` change ⇒ audit `CLAUDE.md` §QA-pipeline

When a commit touches `lefthook.yml` or `.github/workflows/ci.yml` (adds/removes/renames a hook command or CI gate, or changes which gates run at which stage), audit the **`CLAUDE.md` §QA-pipeline** bullet list for accuracy — the pre-commit / commit-msg / pre-push gate lists and their one-line descriptions (which also reference what runs in CI) must match what `lefthook.yml` and the CI workflow actually run. Flag any mismatch as DRIFT (ISSUE). Promoted at count=2: (1) #833/#840 — §QA-pipeline claimed unit tests run in pre-commit when they don't; (2) #925 Phase 3 — a new `soft-delete-guard` pre-commit command was added without updating the §QA-pipeline list. The §QA-pipeline block is small and high-churn-adjacent; a per-`+`-line diff scope misses it because the lefthook change and the doc are in different files.

## Steering Document Drift Detection

**DRIFT** finding type — ISSUE by default (per the Cross-Reference Audit Rule above); escalates to CRITICAL when it contradicts security rules (treat as semantic-reviewer CRITICAL in that case).

**Severity escalation:** If drift contradicts `docs/security.md` or `.claude/rules/security.md`, elevate to CRITICAL.

### What the agent checks
After normal doc sync, compare the commit diff against each file in `.spec-workflow/steering/` (`product.md`, `tech.md`, `structure.md`) for:
- Code contradicting steering doc statements
- New patterns not documented in steering docs

### What the agent does NOT do
Do not edit steering docs. Steering document changes require developer approval via the spec-workflow MCP approval flow.

### Orchestrator decision tree
- **Intentional drift** (code correct, doc outdated) — update steering doc via spec-workflow MCP approval flow.
- **Unintentional drift** (doc correct, code wrong) — treat as ISSUE, fix code same session.

### Skip condition
If `.spec-workflow/steering/` does not exist or is empty, skip the drift check without error.

---

*Last updated: 2026-06-10 (extended repeated-numeric-literal rule to the docs/plan.md integration-test count — learner count=2 on Phase A)*
