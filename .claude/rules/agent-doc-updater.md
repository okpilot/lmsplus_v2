# Agent Rules — doc-updater

> Model: haiku | Trigger: pre-push review gate — round 1; a later round only when the fixup added surface it has not seen | Non-blocking (it PRODUCES doc edits, it does not gate)

## Purpose
Keeps project documentation in sync with code changes: schema changes, new RPCs, new routes, dependency updates, architecture shifts. REPORTS the edits needed to `docs/decisions.md` and `docs/database.md` — the orchestrator applies them; the agent has no Write/Edit tool.

## Handling Results

### DO
- Apply the agent's reported doc edits YOURSELF and commit them in the round's ONE pooled fixup commit — it has no Write/Edit tool and cannot commit.
- Verify cross-references — if database.md changed, check decisions.md stays consistent.
- Trust the agent's judgment on what needs updating — it checks the diff against all doc files.
- Review reported doc edits for accuracy before applying — it can hallucinate details about code it didn't read.
- When a stale claim is found in a doc block, read the WHOLE block before reporting — adjacent claims are frequently stale too. Re-derive any claim a source file could falsify, don't re-read it.
- Report DRIFT findings with specific steering doc reference and contradicting code.
- Elevate to CRITICAL when drift contradicts security rules.
- **Any COUNT must arrive with the command that produced it and its pasted output** — not a remembered figure or estimate. If a count can't be derived in-session, write "not derived".
- **A CODE-BODY citation needs a pasted `grep` result, not just a line number** — `grep -rn '<distinctive token>' .` A citation not grounded in a grep result is fabricated.
- When a report claims a file "cites"/"mentions"/"references" content, paste the EXACT substring, not a paraphrase.

### NEVER
- Cite a flag, function, method or field as IMPLEMENTED without a pasted `grep` proving it exists — a name in the dispatch prompt, a commit message, a spec entry or a plan is a PROMPT EXAMPLE, never evidence.
- Let the agent make architecture decisions — it documents decisions, doesn't make them.
- Let the agent create new documentation files unless the user explicitly asks for one.
- Let the agent write speculative docs ("we might need...", "in the future...").
- Let the agent report partially — a multi-doc change needs edits for ALL of them in the same cycle.
- Let the agent pad docs with unnecessary detail — keep concise and scannable.
- Ignore the agent's "no changes needed" report — acknowledge it in the summary.
- Edit steering documents directly.
- Skip drift check when steering docs exist.
- Cite a migration number, RPC guard, error string, file path, commit SHA (as a change's cause), or **column name** without reading the source directly. Column names count even in an illustrative example — grep `packages/db/src/types.ts` and scan EVERY `ALTER TABLE` chronologically to HEAD first (one match only proves the column existed once, never its state at HEAD). Plans, commit messages and session context are unreliable for `mig NNN` references, paths, and implementation specifics — read the file before citing. Run `git show <sha> -- <path>` to confirm a cited SHA actually contains the change.
- Flag DRIFT (or any ISSUE) on an item the approved plan designates historical, or already in the session's exclusion list. Restate as known-open context at most, never a new finding — each re-litigation costs a validation cycle.

## Key Documents The Agent Watches
| Document | What triggers an update |
|----------|------------------------|
| `docs/database.md` | New migration, new RPC, schema change |
| `docs/decisions.md` | New decision — one new line (format in its header) |
| `.spec-workflow/steering/*.md` | Code change contradicts a steering doc statement |

## File Rename Protocol
When the agent detects a renamed file (e.g., `middleware.ts` → `proxy.ts`), it must grep all docs for stale references. This is documented in `code-style.md` Section 9 and the agent enforces it.

## Cross-Reference Audit Rule

When a doc commit adds a **structural** cross-reference to an existing section — a new section whose body links/refers to an existing section, a row added to a summary table or RPC index that points at an existing function/section, or a TOC/anchor entry pointing at an existing target — the doc-updater audits the **entire referenced section** AND any related summary tables, matrices, or RPC indexes — not just lines marked `+` in the diff. Casual prose mentions ("see X for context") added inside otherwise-unrelated edits do NOT trigger this audit.

**How to apply:** When the diff adds a structural cross-reference INTO an existing section:
1. Read the entire target section, not just the cross-reference site.
2. Scan summary tables, matrices, and indexes that mention the target subject (e.g., the `## RPC Summary` row for the function, or schema matrices that list the table).
3. Flag any claim that contradicts the latest migration or current code as DRIFT (severity: ISSUE; escalate to CRITICAL if it contradicts a rule in `docs/security.md` or `.claude/rules/security.md`).

### Repeated numeric-literal counts — DROPPED 2026-08-19 (#1222)

Do NOT flag a stale INVENTORY count as DRIFT, and do NOT re-derive one "while you are in there" —
those literals WILL drift and stay drifted, deliberately. A stale count in a steering doc misleads
nobody who can run `ls`.

**The exemption is staleness only, and only for inventory counts.** A count that is INTERNALLY
inconsistent is still a finding: an "N + M" whose terms no longer sum to the headline they explain,
or a total that contradicts a list in the same block. That is the `code-style.md` §10 defect and it
is unaffected by this drop — `.coderabbit.yaml` draws the same line. See Decision 58 in `docs/decisions.md`.

### `lefthook.yml` / `ci.yml` change ⇒ audit `CLAUDE.md` §QA-pipeline

When a commit touches `lefthook.yml` or `.github/workflows/ci.yml` (adds/removes/renames a hook command or CI gate, or changes which gates run at which stage), audit the **`CLAUDE.md` §QA-pipeline** bullet list for accuracy — the pre-commit / commit-msg / pre-push gate lists and their one-line descriptions (which also reference what runs in CI) must match what `lefthook.yml` and the CI workflow actually run. Flag any mismatch as DRIFT (ISSUE). The §QA-pipeline block is small and high-churn-adjacent; a per-`+`-line diff scope misses it because the lefthook change and the doc are in different files.

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
