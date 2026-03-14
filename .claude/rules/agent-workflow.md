# Agent Workflow — Pipeline & Orchestrator Rules

> How the orchestrator (Claude) plans, validates, and coordinates work.
> Per-agent handling rules are in separate `agent-*.md` files in this directory.

---

## Plan Validation Pipeline (runs BEFORE any code is written)

For any multi-file change, the orchestrator must validate the plan before executing it. This is where most defects are cheapest to catch.

```
User request
    │
    ▼
Explore (subagents map relevant code)
    │
    ▼
Draft plan (files to change, approach, risks)
    │
    ├─► Impact analysis    ─ who calls/imports each file being changed?
    ├─► Contract check     ─ do existing tests assert behavior we're changing?
    ├─► Pattern scan       ─ does our approach match existing codebase patterns?
    ├─► Doc/schema check   ─ will docs become inaccurate after this change?
    └─► Security surface   ─ does this touch auth, RLS, answers, or input validation?
    │
    ▼
Validated plan (includes: affected files, test updates, doc updates, risks)
    │
    ▼
User approves → Execute
```

### What each validation step does:

| Step | What to check | How | Blocker if... |
|------|--------------|-----|---------------|
| **Impact analysis** | Callers, importers, dependents of every file being changed | Explore agents: grep for imports/function usage | A caller relies on behavior you're about to change |
| **Contract check** | Test assertions that match the code being changed | Read `.test.ts` files for every changed source file | A test asserts a value you're changing (e.g., fallback `?? 0`) |
| **Pattern scan** | How similar code is written elsewhere in the repo | Explore agents: find 2-3 similar files | Your approach diverges from established patterns |
| **Doc/schema check** | docs/database.md, docs/decisions.md, docs/plan.md | Read relevant doc sections | A doc table/matrix will become inaccurate |
| **Security surface** | Auth checks, RLS policies, answer exposure, input validation | Read docs/security.md + check against plan | Change touches security boundary without matching rules |

### Plan output format:
```
PLAN — [task description]

Files to change:
  - path/to/file.ts (lines ~X-Y) — what and why

Files affected (callers/tests/docs that need updates):
  - path/to/file.test.ts — update assertion from X to Y
  - docs/database.md — update soft-delete matrix row for table Z

Risks:
  - [specific edge case or known concern]

Validation:
  ✓ Impact: [N callers checked, no breaking changes / list conflicts]
  ✓ Contracts: [N test files checked, M need updates]
  ✓ Patterns: [matches existing pattern in file X / diverges because Y]
  ✓ Docs: [no drift / update needed in Z]
  ✓ Security: [not applicable / checked against rule N]
```

### DO
- Run validation for EVERY multi-file change. No shortcuts.
- Include test updates in the plan, not as an afterthought.
- Use Explore agents for impact analysis — don't guess who calls a function.
- Block execution if a validation step reveals a conflict. Revise the plan first.

### NEVER
- Skip validation because the change "seems simple." Simple changes with wrong assumptions cause the biggest review cycles.
- Implement first and fix tests/docs later — plan them together.
- Guess at existing behavior — read the code and tests to verify.
- Proceed to execution with unresolved validation conflicts.

---

## Post-Implementation Pipeline Order

```
git commit
    │
    ├─► code-reviewer   (haiku)   ─┐
    ├─► semantic-reviewer (sonnet) ─┤  parallel, wait for all 4
    ├─► doc-updater      (haiku)   ─┤
    └─► test-writer      (sonnet)  ─┘
                                     │
                              read ALL results
                                     │
                              validate findings (see below)
                                     │
                              fix validated issues (commit)
                                     │
                              ┌──────┴──────┐
                              │   learner   │  (sonnet) — pattern detection
                              └──────┬──────┘
                                     │
                         (if rules changed)
                              ┌──────┴──────┐
                              │coderabbit-  │  (haiku) — sync .coderabbit.yaml
                              │   sync      │
                              └─────────────┘
```

## Pre-Push PR Sweep (MANDATORY for multi-commit PRs)

Before pushing a branch with 2+ commits, run a **PR-level semantic review** against the full diff:

```bash
git diff master...HEAD
```

This catches cross-file consistency issues that per-commit reviews miss:
- Test assertions not matching production code changed in a different commit
- Doc matrices inconsistent with schema changes from earlier commits
- Fallback values or error handling patterns introduced across separate commits

Run semantic-reviewer (sonnet) with the full PR diff as input, not just `HEAD~1..HEAD`.
This is what CodeRabbit sees — our agents must see it too.

## Finding Validation (MANDATORY before fixing)

When a reviewer flags an ISSUE or CRITICAL, do NOT immediately edit code. Validate first:

1. **Analyze the claim** — Is the reviewer correct? Think about domain logic, not just code patterns. Reviewers can produce false positives.
2. **Check implications** — If you apply the suggested fix, what callers/tests/docs break? Read the affected code.
3. **Decide** — Is this a real issue, a false positive, or a valid concern that needs a different fix than suggested?
4. **If the fix changes the plan** — Re-validate the changed parts before implementing.

Only then fix. This is a closed loop: `finding → validate → fix → re-validate if plan changed`.

## Orchestrator Role

- **You plan and review. Agents execute.**
- Read every agent result before proceeding. No fire-and-forget.
- If an agent found an issue, validate it first, then address it before moving on.
- Group related fixes into a single commit when possible.
- After fix commits that change production code, re-run semantic-reviewer on the new diff.
- Repeat until all agents report clean.

### DO
- Launch all 4 post-commit agents in parallel immediately after every commit.
- Read all results before starting any fixes.
- Validate every ISSUE/CRITICAL finding before fixing — analyze the claim, check implications.
- Report findings to the user in a summary table: agent / severity / count / status.
- Report ALL severity levels — not just criticals.
- Re-run agents on fix commits if production code changed.

### NEVER
- Skip post-commit agents. Ever. Not even for "trivial" commits.
- Start fixing after only one agent reports — wait for all 4.
- Fire-and-forget agents without reading results.
- **Jump to fix a reviewer finding without first validating the claim.** Reviewer says ISSUE ≠ automatically correct.
- Present "0 critical" as if that means clean — report every severity.
- Push with any unresolved CRITICAL, BLOCKING, or ISSUE finding.
- Push with failing tests.
- Characterize findings as "latent", "safe today", or "forward-looking" to justify skipping them.

---

*Per-agent rules: `agent-code-reviewer.md`, `agent-semantic-reviewer.md`, `agent-test-writer.md`, `agent-doc-updater.md`, `agent-learner.md`, `agent-security-auditor.md`, `agent-coderabbit-sync.md`*

*Last updated: 2026-03-13 (review-gate hook added)*
