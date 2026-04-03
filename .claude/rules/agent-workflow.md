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
Root cause check (is the described fix the RIGHT fix?)
    │
    ▼
Requirement interview (if multi-file — skip conditions below)
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
Plan-critic review (skip for single-file < 10 lines)
    │
    ├─► CRITICAL ─► Orchestrator resolves directly (no revision round)
    ├─► ISSUE ─► Revise plan (1 round max, then orchestrator resolves)
    └─► Clean / SUGGESTION only
    │
    ▼
User approves → Execute
```

### Requirement Interview (runs AFTER root cause check, BEFORE drafting the plan)

After the orchestrator has explored the code and checked root cause, but before drafting the plan, surface any requirement ambiguities as explicit questions.

**Interview template** (3-5 questions covering):

1. **Scope boundaries** — "Is X in scope or out of scope for this change?"
2. **Behavioral ambiguities** — "When Y happens, should the system do A or B?"
3. **Priority trade-offs** — "The full solution involves X, Y, Z. Are all must-have, or can Z be deferred?"

**Auto-skip conditions** (interview is skipped when ANY of these apply):
- Single-file bug fix with clear reproduction path and single root cause
- User explicitly says "skip interview" or "no questions needed"
- Orchestrator identifies zero ambiguities after root cause analysis (must state which of the three interview categories — scope boundaries, behavioral ambiguities, priority trade-offs — were checked and found unambiguous)

**Answer incorporation:** Answers feed into the plan draft. If a spec exists (see Spec Artifact Rules), answers are recorded in the spec's requirements section.

**Default behavior:** The interview is on by default for multi-file changes. Skippable but never skipped silently — the orchestrator either asks questions or explicitly states no ambiguities.

### What each validation step does:

| Step | What to check | How | Blocker if... |
|------|--------------|-----|---------------|
| **Impact analysis** | Callers, importers, dependents of every file being changed | Explore agents: grep for imports/function usage | A caller relies on behavior you're about to change |
| **Contract check** | Test assertions, exported type contracts (types/interfaces callers depend on), Zod schema contracts (validators referencing changed types), and doc-asserted behaviors (docs/database.md) | Read `.test.ts` files, trace exported types/interfaces, check Zod schemas referencing changed types, read relevant doc sections | A test asserts a value you're changing, a TypeScript caller depends on a type you're restructuring, or a schema validator references a changed type |
| **Pattern scan** | How similar code is written elsewhere in the repo | Explore agents: find 2-3 similar files | Your approach diverges from established patterns |
| **Sibling file audit** | When updating a function that provisions users, seeds fixtures, or manages test records, find ALL functions with the same semantic purpose (e.g., all `ensure*User` helpers, all seed functions) and update them together | Grep for function name patterns, check all helper files | A sibling function is missed and breaks at runtime |
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

### Plan-Critic Review (runs AFTER plan validation, BEFORE user approval)

After the plan is validated but before presenting it to the user, run the plan-critic agent (sonnet) via the Agent tool.

**Inputs:** The validated plan text, plus the source files listed in the plan's "Files to change" and "Files affected" sections.

**Revision loop:** CRITICAL findings are resolved directly by the orchestrator — no revision round. ISSUE findings trigger 1 revision round maximum. If the revised plan still has ISSUE findings after one revision, the orchestrator resolves directly — no further critic rounds.

**Skip condition:** Single-file changes under 10 lines skip the plan-critic. The plan validation pipeline is sufficient for these.

**Timeout:** Proceed with a warning if the plan-critic takes over 60 seconds for plans covering up to 10 files, or over 120 seconds for plans covering more than 10 files. Post-commit agents remain as the safety net.

### DO
- Run validation for EVERY multi-file change. No shortcuts.
- Run the interview for every multi-file change unless auto-skip conditions apply.
- Run plan-critic on every multi-file plan before user approval.
- Include test updates in the plan, not as an afterthought.
- Use Explore agents for impact analysis — don't guess who calls a function.
- Block execution if a validation step reveals a conflict. Revise the plan first.

### NEVER
- Skip validation because the change "seems simple." Simple changes with wrong assumptions cause the biggest review cycles.
- Skip the interview silently — always state "No ambiguities identified" or present questions.
- Skip plan-critic for multi-file changes.
- Proceed to execution with unresolved plan-critic ISSUE/CRITICAL findings.
- Implement first and fix tests/docs later — plan them together.
- Guess at existing behavior — read the code and tests to verify.
- Proceed to execution with unresolved validation conflicts.

---

## Spec Artifact Rules

Structured specs persist plans beyond chat history and provide session resume context.

### When to create a spec
Features spanning **3+ files** OR introducing a **new architectural pattern**. Create via spec-workflow MCP tools (`mcp__spec-workflow__*`).

### When NOT to create a spec
Bug fixes, single-file refactors, and changes touching fewer than 3 files. The plan validation pipeline above is sufficient for these.

### Spec lifecycle
1. **Created** during planning — captures requirements, approach, and file list.
2. **Updated** during implementation — deviations, decisions, and task progress recorded.
3. **Committed** with the feature branch — lives in `.spec-workflow/specs/<name>/`.
4. **Session resume context** — on session restart, the spec is the starting point, not chat history.

### Spec-as-context rule
When a spec exists for the current work, the orchestrator references it (not chat history) as the source of truth for requirements and plan.

### Deviation rule
After a spec reaches "approved" status, material changes to the approach require updating the spec and noting the deviation before implementing.

### MCP fallback
If the spec-workflow MCP is unavailable, write spec files manually to `.spec-workflow/specs/<name>/` using the existing template structure in `.spec-workflow/templates/`.

### DO
- Create a spec for any feature spanning 3+ files or introducing a new pattern.

### NEVER
- Make material changes to an approved spec's approach without updating the spec.

---

## Post-Implementation Pipeline Order

```
Execute (subagents implement)
    │
    ▼
Implementation-critic review (always runs)
    │
    ├─► ISSUE ─► Implementer revises (max 2 rounds, then orchestrator takes over)
    ├─► CRITICAL ─► Orchestrator intervenes directly
    └─► Clean / SUGGESTION only
    │
    ▼
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
                    (if diff touches security files)
                              ┌──────┴──────┐
                              │  red-team   │  (sonnet) — map diff to specs, flag gaps
                              └──────┬──────┘
                                     │
                         (if rules changed)
                              ┌──────┴──────┐
                              │coderabbit-  │  (haiku) — sync .coderabbit.yaml
                              │   sync      │
                              └──────┬──────┘
                                     │
                              ┌──────┴──────┐
                              │ update spec │  tasks.md: [ ] → [x]
                              │  (if spec)  │
                              └─────────────┘
```

### Pre-Commit Implementation Review (runs AFTER execution, BEFORE git commit)

After subagents complete implementation but before committing, run the implementation-critic agent (sonnet) via the Agent tool.

**Inputs:** `git diff --staged`, the validated plan, and the requirements (from the spec if one exists, or from the plan output).

**Revision flow:**
- **ISSUE** — the implementing agent revises. Maximum 2 revision rounds between critic and implementer.
- **CRITICAL** — the orchestrator intervenes directly (no implementer revision).
- After 2 unsuccessful revision rounds, the orchestrator takes over resolution to prevent infinite loops.

**No skip condition.** Even single-file changes get implementation review. The plan-critic is what gets skipped for small changes, not the implementation-critic.

**Timeout:** Proceed with a warning if the implementation-critic takes over 90 seconds for diffs under 500 lines. Post-commit agents remain as the safety net.

### Red-Team Agent Trigger (conditional)

After the learner, check if the commit diff includes any of these paths:
- `supabase/migrations/**`
- `packages/db/src/**`
- `apps/web/app/app/quiz/actions/**`
- `apps/web/app/auth/**`
- `apps/web/proxy.ts`
- `docs/security.md`

If yes, run the red-team agent (sonnet). It maps changes to red-team specs and flags coverage gaps. If it reports affected specs, run `pnpm --filter @repo/web e2e:redteam` to verify defenses still hold.

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
- Run implementation-critic on staged changes before every commit.
- Launch all 4 post-commit agents in parallel immediately after every commit.
- Read all results before starting any fixes.
- Validate every ISSUE/CRITICAL finding before fixing — analyze the claim, check implications.
- Report findings to the user in a summary table: agent / severity / count / status.
- Report ALL severity levels — not just criticals.
- Re-run agents on fix commits if production code changed.
- Create tasks via TaskCreate for features with 5+ steps.
- After all agents report clean, update `tasks.md` in the active spec (`[ ]` → `[x]`) for every completed task. This is the last step before moving on.

### NEVER
- Skip implementation-critic, even for small changes.
- Allow more than 2 revision rounds between critic and implementer.
- Skip post-commit agents. Ever. Not even for "trivial" commits.
- Start fixing after only one agent reports — wait for all 4.
- Fire-and-forget agents without reading results.
- **Jump to fix a reviewer finding without first validating the claim.** Reviewer says ISSUE ≠ automatically correct.
- Present "0 critical" as if that means clean — report every severity.
- Push with any unresolved CRITICAL, BLOCKING, or ISSUE finding.
- Push with failing tests.
- Characterize findings as "latent", "safe today", or "forward-looking" to justify skipping them.
- Start a new session on in-progress work without checking TaskList first.
- Finish a task without updating `tasks.md` in the spec — the dashboard shows 0% for completed work otherwise.

---

## Task Persistence

Track multi-step work across session restarts using persistent tasks.

### When to create tasks
Features with **5+ discrete implementation steps**. Use `TaskCreate` for each step with a clear title and description.

### Task lifecycle
1. **`pending`** — created during planning, before execution begins.
2. **`in_progress`** — set via `TaskUpdate` when work on that step begins.
3. **`completed`** — set via `TaskUpdate` when the step passes review.

### Session resume protocol
When a new session begins and the developer asks to resume work, run `TaskList` before exploring the codebase. Outstanding tasks provide the starting context — no need to re-read chat history.

### Completion reporting
When all tasks for a feature are `completed`, report a summary to the developer covering what was done, what was deferred, and any outstanding concerns.

### Threshold
Below 5 steps, task creation is optional (orchestrator's discretion). Simple changes tracked via the plan are sufficient.

### Fallback
If `TaskCreate`/`TaskUpdate`/`TaskList` are unavailable, track tasks in session summary text and use the spec's `.spec-workflow/specs/<name>/tasks.md` as the resume starting point instead of `TaskList`.

### DO
- Create tasks via TaskCreate for features with 5+ steps.

### NEVER
- Start a new session on in-progress work without checking TaskList first.

---

## Proactive Engineering Guidance (MANDATORY)

The user is learning software engineering. Claude must proactively flag non-obvious consequences before they become tech debt. This is not optional — silent execution of a bad process is worse than pausing to explain.

### When to speak up:

| Situation | What to say |
|-----------|-------------|
| Major dependency bump | "This needs a migration pass for deprecated APIs — let's do it in the same PR" |
| Adding a new quality tool | "Let's configure exclusions for generated code first, then run a local baseline before enabling in CI" |
| Adding a new CI check | "Let me run this locally first to triage the baseline — we don't want surprise failures blocking PRs" |
| Architectural shortcut | "This works now but will cause [specific problem] when [specific trigger] — here's the alternative" |
| Process gap | "We don't have a rule for X yet — here's what can go wrong and the rule I'd suggest" |

### DO
- Explain the *why* briefly — one sentence, not a lecture.
- Flag before executing, not after the mess.
- Suggest the fix alongside the warning.
- If the user decides to proceed anyway, respect that — but log it.

### NEVER
- Execute silently when you know a step is missing.
- Assume the user knows industry conventions — explain them.
- Wait for tech debt to accumulate before mentioning it.
- Over-explain or block progress — keep it brief and actionable.

---

## Delegation Protocol

Every subagent prompt must be self-contained and unambiguous. Use this template for all subagent dispatches.

### Template

```
TASK: [action verb + scope]
OBJECTIVE: [why it matters, connects to user's goal]
DONE WHEN: [measurable exit criteria]
CONSTRAINTS: [what NOT to do, file boundaries, limits, security rules]
CONTEXT: [file paths, type signatures, patterns to follow, related tests]
```

### Litmus test
Before dispatching any subagent, ask: **"Could this agent execute end-to-end without a follow-up question?"** If no, add the missing context to the prompt.

### Parallel dispatch rule
When multiple subagents launch in parallel, each prompt must be self-contained. No prompt may depend on a sibling agent's output from the same batch.

### Failure logging
If a subagent returns a result indicating it lacked context (e.g., "file not found", "unclear which pattern"), log it as a delegation failure and improve future prompts:

```
DELEGATION FAILURE — [agent type] — [timestamp]
Missing: [what the agent needed but didn't have]
Fix: [what to include next time]
```

### Post-commit agent integration
For post-commit agents (code-reviewer, semantic-reviewer, doc-updater, test-writer), the existing agent definition files (`.claude/agents/*.md`) serve as the CONSTRAINTS and CONTEXT sections. The delegation template supplements with TASK, OBJECTIVE, and DONE WHEN — it does not duplicate the definitions.

### DO
- Use the 5-section delegation template for every subagent prompt.
- Log delegation failures and improve future prompts.

### NEVER
- Dispatch a subagent without all 5 template sections.
- Duplicate agent definition content in delegation prompts.

---

*Per-agent rules: `agent-code-reviewer.md`, `agent-semantic-reviewer.md`, `agent-test-writer.md`, `agent-doc-updater.md`, `agent-learner.md`, `agent-security-auditor.md`, `agent-red-team.md`, `agent-coderabbit-sync.md`, `agent-critic.md`*

*Last updated: 2026-04-03 (critic integration, spec artifacts, interview phase, task persistence, delegation protocol)*
