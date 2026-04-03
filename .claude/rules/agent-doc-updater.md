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

## Steering Document Drift Detection

New finding type: **DRIFT** — non-blocking by default; escalates to CRITICAL when it contradicts security rules (treat as semantic-reviewer CRITICAL in that case).

**Severity escalation:** If drift contradicts `docs/security.md` or `.claude/rules/security.md`, elevate to CRITICAL.

### What the agent checks
After normal doc sync, compare the commit diff against each file in `.spec-workflow/steering/` (`product.md`, `tech.md`, `structure.md`) for:
- Code contradicting steering doc statements
- New patterns not documented in steering docs

### What the agent does NOT do
Edit steering docs. Steering document changes require developer approval via the spec-workflow MCP approval flow.

### Orchestrator decision tree
- **Intentional drift** (code correct, doc outdated) — update steering doc via spec-workflow MCP approval flow.
- **Unintentional drift** (doc correct, code wrong) — treat as ISSUE, fix code same session.

### Skip condition
If `.spec-workflow/steering/` does not exist or is empty, skip the drift check without error.

---

*Last updated: 2026-04-03*
