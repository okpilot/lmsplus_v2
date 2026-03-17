Weekly self-review: analyse project health, audit agent system, and update memory.

## Part 1 — Project Health
1. Run `git log --oneline --since="7 days ago"` — what was built this week
2. Read `.claude/agent-memory/code-reviewer/patterns.md` — recurring issues
3. Read `.claude/agent-memory/security-auditor/findings.md` — security patterns
4. Read `.claude/agent-memory/test-writer/patterns.md` — test coverage gaps
5. Check open questions in `docs/decisions.md` — any resolved?

## Part 2 — Agent System Health
6. Read ALL agent memory files:
   - `.claude/agent-memory/doc-updater/patterns.md`
   - `.claude/agent-memory/semantic-reviewer/patterns.md`
   - `.claude/agent-memory/red-team/attack-surface.md`
   - `.claude/agent-memory/learner/patterns.md`
7. Cross-reference agent health:
   - **Red-team**: list spec files in `apps/web/e2e/redteam/` vs mentions in attack-surface.md — flag orphans and stale mappings
   - **Learner**: scan frequency table for entries with count >= 2 still at "Watch" — these should be "Rule Candidate"
   - **Semantic-reviewer**: note false positive patterns, check if any flagged patterns stopped recurring
   - **Test-writer**: verify mock patterns still match codebase (Supabase client shape, auth helpers)
   - **Doc-updater**: confirm watched file list matches actual doc files in repo
   - **Security-auditor**: compare checklist in agent definition vs rules in `docs/security.md`
   - **CodeRabbit**: spot-check last 3 rules in `code-style.md` against `.coderabbit.yaml` path_instructions

## Part 3 — Synthesis
8. Update `MEMORY.md` — summarise insights, remove stale entries
9. Suggest: any new rules to add, any patterns to codify, any tech debt to prioritise

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
| coderabbit-sync | ✅/⚠️ | date | summary |
