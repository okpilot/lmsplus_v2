# Agent Memory — Native Subagent Memory Layout & Discipline
> Applies to every agent under `.claude/agents/` that declares `memory: project`. Governs the files under `.claude/agent-memory/<agent>/`. Binding.
## How native subagent memory works (the mechanics we rely on)
`memory: project` in an agent's `.claude/agents/<name>.md` frontmatter binds a memory directory at `.claude/agent-memory/<name>/`. At each invocation Claude Code: **(1)** auto-injects the first **200 lines / 25 KB** (whichever is smaller) of that dir's `MEMORY.md` into the agent's prompt; **(2)** appends a "curate if over budget" instruction so the agent prunes its own `MEMORY.md`; **(3)** grants the agent **auto Read/Write/Edit** on its memory dir.
**`tools:` does NOT gate the memory directory.** `memory: project` auto-enables Read/Write/Edit for memory-file operations regardless of the `tools:` allowlist: every `memory: project` definition shows `Write, Edit` in the roster even where its own frontmatter omits them; every definition with no `memory:` key does not. Derive, don't trust a list — frontmatter side: `grep -l '^memory: project' .claude/agents/*.md` and `grep -n '^tools:' .claude/agents/*.md`; roster side is a runtime fact off the session's own available-agent list. Do not "restore" Write to a read-only agent on the theory that its tracker is broken — verify the tracker first.
- **Only `MEMORY.md` is auto-injected and auto-curated.** Topic files are read on demand and **never** touched by native curation.
- **Agent defs snapshot at session start.** Adding/removing `memory:` takes effect only after a restart.
## File layout — one index + on-demand topic files
```
.claude/agent-memory/<agent>/
  MEMORY.md          ← the auto-injected index. MUST stay < 200 lines AND < 25 KB.
  topics/<theme>.md  ← optional. Detailed, reusable content pulled in on demand.
```
`MEMORY.md` order: **(1)** tracker table (learner + code-reviewer always; others once a pattern recurs ≥2×), **(2)** durable knowledge as short bullets, **(3)** topic pointers — `- [theme](topics/theme.md) — one-line hook`. **Budget is hard** — injection truncates at 200 lines *or* 25 KB, content past the cap is invisible; `/insights` flags any `MEMORY.md` over 200 lines.
> **No journals.** Never append a dated "session log" section. History lives in **git** (`git log -p -- <file>`), not in the file.
## Tracker state machine — rows are NEVER deleted
A tracker row records a recurring pattern and its frequency. Rows **transition state**, never removed. Count increments only for a **distinct** mechanism/occurrence. States: `WATCHING` → (count reaches 2) → `RULE CANDIDATE` → (rule written) → `PROMOTED → <rule location>`; also `WATCHING`/`RULE CANDIDATE` → `RESOLVED` (fix proven, stops recurring), `RESOLVED-WATCH` (resolved but still worth watching), or `FALSE POSITIVE` (not a real issue).
Tracker columns vary by agent — read by header name, not position, before editing. A recurrence that proves a count was mis-attributed fixes the count and notes the reconciliation in the row.
> Tracker requirement: **code-reviewer** — `.claude/agents/code-reviewer.md`, `## Recurring Issues Tracker`. **learner** — `.claude/rules/agent-learner.md`.
## Memory Discipline — update IN PLACE, never append
Edit the existing row/bullet in place, e.g. `| Server Action file over its cap | 2026-03-01 | 4 | 2026-05-29 | PROMOTED → .claude/limits.json |` — do not stack a new dated paragraph each session (`## 2026-05-29 session` / `Saw the hook-file-size thing again today...`). Supporting evidence (commit hashes behind a count) belongs in `git log` and the topic file, not the row.
## Memory deltas are committed, never stashed
A round's memory/tracker updates MUST be committed — with that round's ONE pooled fixup commit or a dedicated `chore(memory)` commit — BEFORE any branch switch. The gate's diff scope EXCLUDES `.claude/agent-memory/**` — read the delta yourself before committing it. Never `git stash` it.
## Protected topic files (never auto-curated, never pruned)
- **`red-team/topics/attack-surface.md`** — the vector→spec mapping matrix. red-team's `MEMORY.md` only points to it; native curation never touches it. Never rename it to `MEMORY.md`, never prune it.
Any future protected matrix: named topic file, referenced from `MEMORY.md`, never inlined.
## Which agents have memory
- **Standard (`memory: project`, MEMORY.md index):** learner, semantic-reviewer, test-writer, code-reviewer, doc-updater, plan-critic, implementation-critic.
- **red-team (special):** `memory: project` + small MEMORY.md index → protected `attack-surface.md` topic file.
- **security-auditor:** deferred — derive, don't trust: `wc -c .claude/agent-memory/security-auditor/findings.md` and `git log -1 --format=%cs -- .claude/agent-memory/security-auditor/findings.md`. No `memory:` until it accumulates real content.
- **coderabbit-sync:** excluded — no memory dir, no `memory:`.
## DO
- Keep `MEMORY.md` under 200 lines and 25 KB — spill detail into `topics/`.
- Update rows and bullets in place; let git hold the history.
- Transition tracker rows through states; keep counts incrementing.
- Treat sibling topic files as durable reference — curate only `MEMORY.md`.
## NEVER
- Append a dated session-log section to any `MEMORY.md`.
- Delete a tracker row. State-transition it instead.
- Inline a protected matrix (e.g. `attack-surface.md`) into `MEMORY.md`.
- Recreate a `patterns.md` — the file is `MEMORY.md` now.
- Let auto-curation drop a tracker row to save space — move durable prose to a topic file first.
- Leave a memory/tracker delta in `git stash` across a branch switch — commit it first.
