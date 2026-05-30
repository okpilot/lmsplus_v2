# Agent Memory — Native Subagent Memory Layout & Discipline

> Applies to every agent under `.claude/agents/` that declares `memory: project`.
> Governs the files under `.claude/agent-memory/<agent>/`.
> Binding. The orchestrator and each agent follow this when reading/writing memory.

---

## How native subagent memory works (the mechanics we rely on)

Setting `memory: project` in an agent's `.claude/agents/<name>.md` frontmatter binds a memory directory at `.claude/agent-memory/<name>/`. At each invocation Claude Code:

1. **Auto-injects** the first **200 lines / 25 KB** (whichever is smaller) of that dir's `MEMORY.md` into the agent's prompt.
2. Appends a **"curate if over budget"** instruction so the agent prunes its own `MEMORY.md` when it grows.
3. Grants the agent **auto Read/Write/Edit** on its memory dir.

Two consequences that shape every rule below:

- **Only `MEMORY.md` is auto-injected and auto-curated.** Sibling files in the dir (topic files) are read on demand and are **never** touched by native curation.
- **Agent defs snapshot at session start.** Adding/removing `memory:` only takes effect after a Claude Code restart.

## File layout — one index + on-demand topic files

```
.claude/agent-memory/<agent>/
  MEMORY.md          ← the auto-injected index. MUST stay < 200 lines AND < 25 KB.
  topics/<theme>.md  ← optional. Detailed, reusable content pulled in on demand.
```

`MEMORY.md` contains, in this order:

1. **Tracker table** (learner + code-reviewer maintain one; others add one only once a pattern recurs ≥2×).
2. **Durable knowledge** — short bullets of stable, load-bearing facts/conventions for this agent.
3. **Topic pointers** — one line each: `- [theme](topics/theme.md) — one-line hook`.

**Budget is hard.** Injection truncates at 200 lines *or* 25 KB, so content past the cap is invisible. Keep the tracker terse; push anything long or narrative into a topic file and leave a pointer. The `/insights` weekly check flags any `MEMORY.md` over 200 lines.

> **No journals.** Never append a dated "session log" section. History lives in **git** (`git log -p -- <file>`), not in the file. The journals this layout replaced were ~90% write-only narrative — that is exactly what must not come back.

## Tracker state machine — rows are NEVER deleted

A tracker row records a recurring pattern and its frequency. Rows **transition state**; they are never removed. The count keeps incrementing on every distinct-mechanism recurrence, because that count drives rule-promotion (≥2) and the Sweep-On-Rule-Promotion trigger in `agent-learner.md`, and because a row that *stops* recurring is itself a positive signal.

```
WATCHING ──(count reaches 2)──▶ RULE CANDIDATE ──(rule written)──▶ PROMOTED → <rule location>
   │                                                                    
   ├──(fix proven, stops recurring)──────────────────────────────▶ RESOLVED
   ├──(resolved but still worth watching for regressions)────────▶ RESOLVED-WATCH
   └──(turned out not to be a real issue)───────────────────────▶ FALSE POSITIVE
```

Tracker columns: `Pattern | First Seen | Count | Last Seen | Status (→ rule loc)`. Count increments only for a **distinct** mechanism/occurrence — not a re-mention of the same one. When a recurrence proves a count was mis-attributed, fix the count and note the reconciliation in the row (this is the one legitimate way a count changes other than incrementing).

> The tracker requirement for **code-reviewer** comes from its own agent definition (`.claude/agents/code-reviewer.md`) and the `## Recurring Issues Tracker` table it already maintains — **not** from `docs/security.md` (which has no such reference). The requirement for **learner** comes from `.claude/rules/agent-learner.md`.

## Memory Discipline — update IN PLACE, never append

When new knowledge arrives, **edit the existing row/bullet** so the file stays small and current. Do not stack a new dated paragraph each session.

```markdown
✅ CORRECT — update the existing tracker row in place
| Hook file > 80-line limit | 2026-03-01 | 4 | 2026-05-29 | PROMOTED → code-style.md §1 |

❌ WRONG — appending a dated journal entry every session
## 2026-05-29 session
Saw the hook-file-size thing again today on commit 741ae30. That's the 4th time.
Earlier notes: 2026-05-12 (commit 34a9352), 2026-04-20 (commit 9f5a6cc)...
## 2026-05-20 session
Reviewed 3 commits, found the hook-size issue once more...
```

Both encode "this happened 4 times," but the ✅ form is one line and the ❌ form grows without bound. If a row needs supporting evidence (the commit hashes behind a count), that's what `git log` and the topic file are for — keep the row itself terse.

## Protected topic files (never auto-curated, never pruned)

Some topic files are reference matrices that must survive verbatim:

- **`red-team/topics/attack-surface.md`** — the vector→spec mapping matrix. red-team keeps a small `MEMORY.md` index that *points* to it; the matrix itself is a topic file, so native curation never touches it. Do not rename it to `MEMORY.md` and do not prune it.

Any future protected matrix follows the same shape: keep it as a named topic file, reference it from `MEMORY.md`, never inline it into `MEMORY.md`.

## Which agents have memory

- **Standard (`memory: project`, MEMORY.md index):** learner, semantic-reviewer, test-writer, code-reviewer, doc-updater, plan-critic, implementation-critic.
- **red-team (special):** `memory: project` + small MEMORY.md index → protected `attack-surface.md` topic file.
- **security-auditor:** deferred — `findings.md` is empty; no `memory:` until it accumulates real content.
- **coderabbit-sync:** excluded — no memory dir, no `memory:`.

## DO

- Keep `MEMORY.md` under 200 lines and 25 KB — spill detail into `topics/`.
- Update rows and bullets in place; let git hold the history.
- Transition tracker rows through states; keep counts incrementing.
- Treat sibling topic files as durable reference — curate only `MEMORY.md`.

## NEVER

- Append a dated session-log section to any `MEMORY.md`. (This is the regression that created the bloat.)
- Delete a tracker row. State-transition it instead.
- Inline a protected matrix (e.g. `attack-surface.md`) into `MEMORY.md`.
- Recreate a `patterns.md` — the file is `MEMORY.md` now; write instructions point there.
- Let auto-curation drop a tracker row to save space — move durable prose to a topic file first.

---

*Last updated: 2026-05-29 (created during the native-subagent-memory adoption — replaces the append-only `patterns.md` journals).*
