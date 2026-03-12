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

### NEVER
- Let the agent make architecture decisions — it documents decisions, it doesn't make them.
- Let the agent create new documentation files unless the user explicitly asks for one.
- Let the agent write speculative docs ("we might need...", "in the future...").
- Let the agent do partial updates — if a change affects multiple docs, all must be updated in the same cycle.
- Let the agent edit `MEMORY.md` without reading it first (it may overwrite recent entries).
- Let the agent pad docs with unnecessary detail — keep docs concise and scannable.
- Ignore the agent's "no changes needed" report — acknowledge it in the summary.

## Key Documents The Agent Watches
| Document | What triggers an update |
|----------|------------------------|
| `docs/database.md` | New migration, new RPC, schema change |
| `docs/decisions.md` | New architectural decision, changed approach |
| `docs/plan.md` | Phase/sprint progress, completed items |
| `MEMORY.md` | Significant new context for future sessions |

## File Rename Protocol
When the agent detects a renamed file (e.g., `middleware.ts` → `proxy.ts`), it must grep all docs for stale references. This is documented in `code-style.md` Section 9 and the agent enforces it.

---

*Last updated: 2026-03-12*
