Weekly self-review: analyse project health, audit agent system, and update memory.

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
