Review the current feature or recent changes for code quality, security, and correctness.

> **RULE 0 — NO PROSE.** State what is true; delete the rest. No justification, no precedent, no archaeology — that is what `git log` is for. Every sentence is a claim that can be false, so fewer sentences means fewer defects. If a fact is derivable, ship the command, not the paragraph. Evidence is not prose: a skip reason, an `EVIDENCE:` line, a finding's stated basis or a required status/summary stays wherever a rule asks for it.

## What to do
1. Run `git fetch origin` (abort if it fails — see `agent-workflow.md` § "Always diff against `origin/master`, never the bare local `master`"), then `git diff origin/master...HEAD` (full branch diff) or `git diff --staged` to see recent changes
2. Check against `.claude/rules/code-style.md` — flag any violations
3. Check against `docs/security.md` — flag any security issues
4. Look for: missing tests, missing error handling at boundaries, type safety gaps
5. **Spec compliance** — if a spec exists for this feature (check via spec-workflow MCP `spec-status`), verify implementation matches the approved spec
6. **Implementation-critic coordination** — implementation-critic runs in round 1 of the pre-push review gate, on this same branch diff, against the validated plan. Avoid duplicating it; focus here on what an ad-hoc read adds before the gate runs.
7. **Steering drift** — note any drift findings from doc-updater agent (stale docs, mismatched schemas). Flag for resolution before merge.
8. Output a structured review with: PASS / WARNING / BLOCKING items

Be specific: include file:line references for every issue found.
