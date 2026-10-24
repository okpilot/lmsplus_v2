Weekly self-review: analyse project health and audit the agent system.

> **RULE 0 — NO PROSE.** State what is true; delete the rest. No justification, no precedent, no archaeology — that is what `git log` is for. Every sentence is a claim that can be false, so fewer sentences means fewer defects. If a fact is derivable, ship the command, not the paragraph. Evidence is not prose: a skip reason, an `EVIDENCE:` line, a finding's stated basis or a required status/summary stays wherever a rule asks for it.

## Part 1 — Project Health
1. Run `git log --oneline --since="7 days ago"` — what was built this week

## Part 2 — Agent System Health
2. Cross-reference agent health:
   - **Red-team**: list spec files in `apps/web/e2e/redteam/` vs mentions in `apps/web/e2e/redteam/attack-surface.md` — flag orphans and stale mappings
   - **Test-writer**: verify mock patterns still match codebase (Supabase client shape, auth helpers)
   - **Doc-updater**: confirm watched file list matches actual doc files in repo; note any unresolved steering drift
   - **Security-auditor**: compare checklist in agent definition vs rules in `docs/security.md`
   - **CodeRabbit**: spot-check last 3 rules in `code-style.md` against `.coderabbit.yaml` path_instructions
   - **Inline guard waivers** — live waivers, never a count (the quoting set is OPEN, §10 cl.2):
     `git grep -n -e 'prose-path-ok:' | grep -v "git grep -n -e"`
     Quotations of the command, re-derive with:
     `git grep -n -e 'prose-path-ok:' | grep "git grep -n -e"`
     Do NOT exclude `.claude/commands/` or `.claude/hooks/`: both carry live waivers.
     Non-waiver residue (guard `WAIVER_RE`, help text, suite fixtures) is an
     OPEN set: a waiver carries a written reason, a description carries a `<placeholder>`.
     READ every reason. Growth means the detector must be RE-NARROWED, never baselined.
   - **Plan-critic**: review recent plan validations — were plans challenged effectively? Any false positives or missed issues?
3. **Spec workflow** — are specs up-to-date via spec-workflow MCP (`spec-status`)? Any steering drift unresolved? Flag stale or unapproved specs.
4. **Delegation protocol** — review any logged subagent failures. Were they addressed? Any patterns in delegation breakdowns?

## Part 3 — Synthesis
5. Update `MEMORY.md` — summarise insights, remove stale entries
6. Suggest: any new rules to add, any patterns to codify, any tech debt to prioritise

## Output Format
- 10-15 project health bullet points
- Agent health table (one row per agent):

| Agent | Status | Last Finding | Notable |
|-------|--------|-------------|---------|
| semantic-reviewer | ✅/⚠️ | date | summary |
| code-review (skill) | ✅/⚠️ | date | summary |
| test-writer | ✅/⚠️ | date | summary |
| doc-updater | ✅/⚠️ | date | summary |
| red-team | ✅/⚠️ | date | summary |
| security-auditor | ✅/⚠️ | date | summary |
| plan-critic | ✅/⚠️ | date | summary |
| coderabbit-sync | ✅/⚠️ | date | summary |
