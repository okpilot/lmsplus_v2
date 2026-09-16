Weekly self-review: analyse project health, audit agent system, and update memory.

> **RULE 0 — NO PROSE.** State what is true; delete the rest. No justification, no precedent, no archaeology — that is what `git log` is for. Every sentence is a claim that can be false, so fewer sentences means fewer defects. If a fact is derivable, ship the command, not the paragraph. Evidence is not prose: a skip reason, an `EVIDENCE:` line, a finding's stated basis or a required status/summary stays wherever a rule asks for it.

## Part 1 — Project Health
1. Run `git log --oneline --since="7 days ago"` — what was built this week
2. Read `.claude/agent-memory/code-reviewer/MEMORY.md` — recurring issues
3. Read `.claude/agent-memory/security-auditor/findings.md` — security patterns
4. Read `.claude/agent-memory/test-writer/MEMORY.md` — test coverage gaps
5. Check open questions in `docs/decisions.md` — any resolved?

## Part 2 — Agent System Health
6. Read ALL agent memory files:
   - `.claude/agent-memory/doc-updater/MEMORY.md`
   - `.claude/agent-memory/semantic-reviewer/MEMORY.md`
   - `.claude/agent-memory/red-team/topics/attack-surface.md`
   - `.claude/agent-memory/learner/MEMORY.md`
   - `.claude/agent-memory/plan-critic/MEMORY.md`
   - `.claude/agent-memory/implementation-critic/MEMORY.md`
7. Cross-reference agent health:
   - **Memory budget**: run `wc -lc .claude/agent-memory/*/MEMORY.md` — flag any MEMORY.md over **200 lines OR over 25 KB (25600 bytes)**, whichever it hits first. Native injection truncates at min(200 lines, 25 KB), and the **byte cap is usually the binding one** because tracker rows are long paragraphs — a file can be well under 200 lines yet 2–3× over 25 KB, silently losing its tail (and since new rows append at the bottom, the *most recent* learnings are what get dropped). A line-only check misses this. Spill detail into `topics/` files per `.claude/rules/agent-memory.md` (the tracker stays terse; verbose evidence/rationale moves out; terminal-state rows — PROMOTED/RULE EXISTS/FALSE POSITIVE/RESOLVED — move to the agent's `topics/tracker-archive.md`).
   - **Red-team**: list spec files in `apps/web/e2e/redteam/` vs mentions in `topics/attack-surface.md` — flag orphans and stale mappings
   - **Learner**: scan frequency table for entries with count >= 2 still at "Watch" — these should be "Rule Candidate"
   - **Semantic-reviewer**: note false positive patterns, check if any flagged patterns stopped recurring
   - **Test-writer**: verify mock patterns still match codebase (Supabase client shape, auth helpers)
   - **Doc-updater**: confirm watched file list matches actual doc files in repo; note any unresolved steering drift
   - **Security-auditor**: compare checklist in agent definition vs rules in `docs/security.md`
   - **CodeRabbit**: spot-check last 3 rules in `code-style.md` against `.coderabbit.yaml` path_instructions
   - **Retracted-phrase waivers**: `git log --format=%B | grep -c '^Retracted-ok:'` — counts
     TRAILERS, not commits: one commit can waive several tokens, and `--grep ... --oneline | wc -l`
     would score that as one. NOT
     `git log -S`, which searches changed FILE CONTENT and so cannot see a trailer that exists
     only in a commit message; it would report zero for ever and this check would certify a clean
     hatch permanently. Every waiver is a
     claim someone chose not to finish correcting. Read the reasons. If waivers are running above
     roughly one per 25 commits, the detector is mis-tuned and must be RE-NARROWED, not tolerated:
     a hatch used reflexively is how this guard dies quietly
   - **Inline guard waivers**: the retracted-phrase hatch above is a commit-message TRAILER;
     the ratcheted guards ship INLINE markers instead, and until 2026-09-16 nothing audited
     them.
     `git grep -n -e 'prose-claim-ok:' -e 'prose-path-ok:' | grep -v "git grep -n -e"`
     The filter drops every line that QUOTES this command — this bullet, and each note
     elsewhere that cites it. That set is OPEN (§10 cl.2) and grows on every citation — it grew
     twice during the single review that flagged it, once from the reviewing critic's own
     write-up. Any count here is stale before it is read, so state none; re-derive with
     `git grep -n -e 'prose-claim-ok:' -e 'prose-path-ok:' | grep "git grep -n -e"`.
     A quotation of the command is never a waiver, so dropping the class is correct — whereas
     excluding `.claude/commands/` would drop every command FILE, wider than the stated reason,
     so a waiver written in any other one would never appear. Do NOT exclude
     `.claude/hooks/`: the guards' sources and suites carry LIVE waivers, so excluding that
     directory hides exactly what this audit exists to see — and hides it silently, however
     many land there.
     A residue survives and is NOT tuned away. The classes below are ILLUSTRATIONS, not a
     closed list (`code-style.md` §10 cl.2): a rule that DESCRIBES the marker matches
     (`code-style.md` §9), as do each guard's own `WAIVER_RE` and its `console.error` help
     text, the fixture strings the suites write into sandbox repos, and any
     `.claude/agent-memory/**` note quoting a marker or this very command — that last class
     grows every time an agent cites it. So READ the list, never trust its length — which is
     why this greps `-n` and not `-c`: a waiver carries a written reason, a description
     carries a `<placeholder>`.
     A waiver states why the prose MUST carry that number or that unresolvable path. "False
     positive" is already refused by the guards (a reason under 20 non-whitespace characters,
     or one on their empty-reason list, is a FINDING). Unlike a baseline row, which
     grandfathers what already existed, a waiver is a live choice made on a line someone was
     editing. Growth means the detector is mis-tuned and must be RE-NARROWED — never that the
     baseline should absorb it.
   - **Plan-critic**: review recent plan validations — were plans challenged effectively? Any false positives or missed issues?
   - **Implementation-critic**: check pre-commit findings log — are staged-change reviews catching issues before commit?
8. **Spec workflow** — are specs up-to-date via spec-workflow MCP (`spec-status`)? Any steering drift unresolved? Flag stale or unapproved specs.
9. **Delegation protocol** — review any logged subagent failures. Were they addressed? Any patterns in delegation breakdowns?

## Part 3 — Synthesis
10. Update `MEMORY.md` — summarise insights, remove stale entries
11. Suggest: any new rules to add, any patterns to codify, any tech debt to prioritise

## Output Format
- 10-15 project health bullet points
- Agent health table (one row per agent):

| Agent | Status | Last Finding | Notable |
|-------|--------|-------------|---------|
| code-reviewer | ✅/⚠️ | date | summary |
| semantic-reviewer | ✅/⚠️ | date | summary |
| test-writer | ✅/⚠️ | date | summary |
| doc-updater | ✅/⚠️ | date | summary |
| learner | ✅/⚠️ | date | summary |
| red-team | ✅/⚠️ | date | summary |
| security-auditor | ✅/⚠️ | date | summary |
| plan-critic | ✅/⚠️ | date | summary |
| impl-critic | ✅/⚠️ | date | summary |
| coderabbit-sync | ✅/⚠️ | date | summary |
