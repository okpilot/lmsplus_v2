---
name: crlocal-retirement-audit-2026-09-19
description: Branch docs/schedule-cr-local-retirement — retirement of CodeRabbit local CLI
metadata:
  type: project
---

## Audit findings — branch docs/schedule-cr-local-retirement

### What changed
- **Deleted:** `.claude/commands/crlocal.md`, `cr-local-plan-reminder.sh`, `cr-local-plan-reminder.test.sh`
- **Renamed:** `.claude/rules/agent-coderabbit-local.md` → `.claude/rules/agent-coderabbit.md`
- **Added:** `.claude/rules/agent-code-review.md` (new agent rule for `/code-review` skill)
- **Removed from CI:** CR-local unit test step in `.github/workflows/ci.yml`
- **Documentation updates:** CLAUDE.md pre-push section, agent-learner.md, all `.claude/commands/*.md` files, docs/decisions.md (Decision 77 added, Decision 74 annotated as superseded), docs/plan.md, steering/tech.md

### Cross-doc verification
**Status:** ✅ ALL BINDING DOCS UPDATED ON BRANCH

1. **CLAUDE.md:** Pre-push dispatcher updated. §QA-pipeline unchanged and accurate (pre-commit / commit-msg / pre-push + CI structure still documented correctly).
2. **docs/decisions.md:** Decision 77 (CR-local retirement) added in full; Decision 74 (CR-local round membership) annotated `*(Superseded 2026-09-19 by Decision 77...)*`
3. **docs/plan.md:** Round 1 roster updated (six members including `code-review (skill)`), learner input updated
4. **agent-learner.md:** Updated to state `code-review (skill)` is ordinary round-1 learner input (not special-cased like CR-local was)
5. **agent-code-review.md:** New file, documents the skill's behavior
6. **agent-workflow.md:** Roster updated; executor note clarified that `code-review (skill)` dispatches forked
7. **Steering:** `tech.md` updated with six-member roster and detailed member list
8. **Commands:** automerge, autonomerge, coderabbit, fullpush, wrapup all updated — no CR-local references remain

### No stale references found
- `docs/database.md` — no changes needed, doesn't mention CR-local
- Steering docs (`product.md`, `structure.md`) — no references
- Spec files — `.spec-workflow/specs/corpus-codification/tasks.md` retains CR-local mentions deliberately (historical task list, all `[x]`)

### §QA-pipeline check
**Gate:** `ci.yml` changed (CR-local test removed).
**Finding:** CLAUDE.md §QA-pipeline at lines 195-202 still accurate:
- pre-commit: mechanical guards only ✅
- commit-msg: SHA resolution gate ✅
- pre-push: security-auditor + dep audit ✅
- "Everything else (review, docs, tests) runs through subagents" ✅
No updates needed.

### Code-review (skill) binding
The new member `code-review (skill)` is documented in:
- CLAUDE.md line 162 ✅
- docs/plan.md page 1073 ✅
- agent-code-review.md (new file) ✅
- agent-learner.md (ordinary round-1 input) ✅
- agent-workflow.md (roster, executor forked dispatch) ✅
- steering/tech.md (full member list) ✅
- All `.claude/commands/*.md` files ✅

**Consensus:** Branch is self-contained and accurate. No doc-updater edits needed.
