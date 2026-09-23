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
   - **Retracted-phrase waivers**: `git log --format=%B | grep -c '^Retracted-ok:'` — counts
     TRAILERS, not commits: one commit can waive several tokens, and `--grep ... --oneline | wc -l`
     would score that as one. NOT
     `git log -S`, which searches changed FILE CONTENT and so cannot see a trailer that exists
     only in a commit message; it would report zero for ever and this check would certify a clean
     hatch permanently. Every waiver is a
     claim someone chose not to finish correcting. Read the reasons. If waivers are running above
     roughly one per 25 commits, the detector is mis-tuned and must be RE-NARROWED, not tolerated:
     a hatch used reflexively is how this guard dies quietly
   - **Inline guard waivers** — live waivers, never a count (the quoting set is OPEN, §10 cl.2):
     `git grep -n -e 'prose-claim-ok:' -e 'prose-path-ok:' | grep -v "git grep -n -e"`
     Quotations of the command, re-derive with:
     `git grep -n -e 'prose-claim-ok:' -e 'prose-path-ok:' | grep "git grep -n -e"`
     Do NOT exclude `.claude/commands/` or `.claude/hooks/`: both carry live waivers.
     Non-waiver residue (guard `WAIVER_RE`, help text, suite fixtures) is an
     OPEN set: a waiver carries a written reason, a description carries a `<placeholder>`.
     READ every reason. Growth means the detector must be RE-NARROWED, never baselined.
   - **Plan-critic**: review recent plan validations — were plans challenged effectively? Any false positives or missed issues?
   - **Implementation-critic**: check its round-1 reports — is the round-1 branch-diff review catching plan deviations before push?
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
| code-reviewer | ✅/⚠️ | date | summary |
| semantic-reviewer | ✅/⚠️ | date | summary |
| test-writer | ✅/⚠️ | date | summary |
| doc-updater | ✅/⚠️ | date | summary |
| red-team | ✅/⚠️ | date | summary |
| security-auditor | ✅/⚠️ | date | summary |
| plan-critic | ✅/⚠️ | date | summary |
| impl-critic | ✅/⚠️ | date | summary |
| coderabbit-sync | ✅/⚠️ | date | summary |
