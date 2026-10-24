# Agent Rules — doc-updater

> Model: haiku | Trigger: pre-push review gate — every round | Non-blocking (it PRODUCES doc edits, it does not gate)

## Purpose
Keeps project documentation in sync with code changes: schema changes, new RPCs, new routes, dependency updates, architecture shifts. REPORTS the edits needed to `docs/decisions.md` and `docs/database.md` — the orchestrator applies them; the agent has no Write/Edit tool.

## Handling Results

### DO
- Apply the agent's reported doc edits YOURSELF and commit them in the round's ONE pooled fixup commit — it has no Write/Edit tool and cannot commit.
- Verify cross-references — if database.md changed, check decisions.md stays consistent.
- Trust the agent's judgment on what needs updating — it checks the diff against all doc files.
- Review reported doc edits for accuracy before applying — it can hallucinate details about code it didn't read.
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

## Key Documents The Agent Watches
| Document | What triggers an update |
|----------|------------------------|
| `docs/database.md` | New migration, new RPC, schema change |
| `docs/decisions.md` | New decision — one new line (format in its header) |
| `.spec-workflow/steering/*.md` | Code change contradicts a steering doc statement |

## File Rename Protocol
When the agent detects a renamed file (e.g., `middleware.ts` → `proxy.ts`), it must grep all docs for stale references. This is documented in `code-style.md` Section 9 and the agent enforces it.

## Cross-Reference Audit Rule

Agent-directed rules: `.claude/agents/doc-updater.md`.

## Steering Document Drift Detection

**DRIFT** finding type — rules (severity, cross-reference audit, inventory counts, QA-pipeline audit): `.claude/agents/doc-updater.md`.

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
