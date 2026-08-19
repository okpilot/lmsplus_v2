# Agent Rules — doc-updater

> Model: haiku | Trigger: post-commit | Non-blocking

## Purpose
Keeps project documentation in sync with code changes. Watches for schema changes, new RPCs, new routes, dependency updates, and architecture shifts. Updates `docs/plan.md`, `docs/decisions.md`, `docs/database.md`, and its own agent memory (`.claude/agent-memory/doc-updater/MEMORY.md`).

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
- Let the agent edit its memory file (`.claude/agent-memory/doc-updater/MEMORY.md`) without reading it first (it may overwrite recent entries).
- Let the agent pad docs with unnecessary detail — keep docs concise and scannable.
- Ignore the agent's "no changes needed" report — acknowledge it in the summary.
- Edit steering documents directly.
- Skip drift check when steering docs exist.
- Cite a migration number, RPC guard, error string, file path, commit SHA (cited as the causal source of a change), **column name**, or other implementation detail without reading the migration/source file directly. Column names count even inside an illustrative example in a rule or skill file — grep `packages/db/src/types.ts` (`public.Tables.<name>.Row`) or the latest `CREATE TABLE`/`ALTER TABLE` before writing one. (Column-name instance, 2026-08-10 / #1174: `score` was cited as a `quiz_sessions` column across four security surfaces; the real column is `score_percentage`. A wrong column in a security example is worse than a vague one — it invites a reviewer to look for a field that does not exist and conclude the example is stale.) Plans, commit messages, and session context are unreliable for sequential numeric references (e.g. which `mig NNN` a function lives in), file paths, and exact implementation specifics — read the file header and body before writing the citation. When a commit SHA is cited as the CAUSE of a change, reading the current file is not sufficient — run `git show <sha> -- <path>` and confirm that commit actually contains the cited change, since a commit can touch a file without touching the text in question. (Promoted count=3; 4th instance appended 2026-08-08: #856 doc-updater attributed `submit_quiz_answer`'s idempotency gate to mig 112 when it is mig 110; Batch-A `ee4d5544` fabricated a trigger exemption, inverted a guard order, and wrong-stringed an error from the plan summary; #1059 cited `apps/web/lib/diagram-validation.ts` for the diagram validator that actually lives at `apps/web/app/app/quiz/actions/diagram-validation.ts`; 2026-08-07 batch-2 cycle of this run — doc-updater reported DRIFT asserting the `CLAUDE.md` `pnpm.overrides` audit rule "was removed in commit `27538a26`", verified false: `27538a26` IS on master but did not touch CLAUDE.md's overrides text at all, and `git log --all -S "pnpm.overrides" -- CLAUDE.md` shows the text was only ever ADDED by `514895e5`, which is NOT on master — the rule was never on master, so it could not have been removed. The underlying observation (CLAUDE.md lacks the rule) was CORRECT — only the causal attribution was fabricated.)
- Flag DRIFT (or any ISSUE) on an item the approved plan explicitly designates as a historical record, or that is already named in the session's planned-work exclusion list. Re-state it as known-open context at most — never as a new finding requiring triage. Each re-litigated finding costs a validation cycle to re-skip. (Promoted count=2, 2026-07-11 pipeline-audit cycles: batch-3 run re-flagged a planned batch-6 drift item as new; batch-4 run flagged plan.md L855/L1430 as DRIFT despite their explicit historical-record adjudication in the approved plan AND this file's own historical-exclusion rule.)

## Key Documents The Agent Watches
| Document | What triggers an update |
|----------|------------------------|
| `docs/database.md` | New migration, new RPC, schema change |
| `docs/decisions.md` | New architectural decision, changed approach |
| `docs/plan.md` | Phase/sprint progress, completed items |
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

### Repeated numeric-literal counts — DROPPED 2026-08-19 (#1222)

This sub-rule obliged doc-updater to chase a stale count literal across `tech.md` ×3 + `decisions.md`
(red-team spec count) and `docs/plan.md` (integration-test count). **It is dropped.** A stale count
in a steering doc misleads nobody who can run `ls`, while chasing it cost real review rounds and
fixup commits — the "counts — is nonsense" complaint that sourced #1222.

Deliberate consequence: those literals WILL drift and stay drifted. That is accepted. Do NOT flag a
stale INVENTORY count as DRIFT, and do NOT re-derive one "while you are in there".

**The exemption is staleness only, and only for inventory counts.** A count that is INTERNALLY
inconsistent is still a finding: an "N + M" whose terms no longer sum to the headline they explain,
or a total that contradicts a list in the same block. That is the `code-style.md` §10 defect and it
is unaffected by this drop — `.coderabbit.yaml` draws the same line. See `docs/decisions.md`.

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

*Last updated: 2026-08-19 (repeated-numeric-literal sub-rules DROPPED — see docs/decisions.md Decision 58, #1222. Prior: 2026-08-08.)*
