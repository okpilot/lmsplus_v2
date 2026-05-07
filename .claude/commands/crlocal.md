Run CodeRabbit's local CLI against the current branch and triage findings. Use this BEFORE pushing or before /fullpush, on any branch with 2+ commits where post-push CodeRabbit will review the PR.

## Why this exists

CodeRabbit local catches things our other agents miss — observability gaps, runtime guard omissions, cleanup ordering, unsafe casts. Running it before push is cheaper than doing the same triage on the PR after CI runs. We also want to catch findings before semantic-reviewer or impl-critic miss them, not after.

But CodeRabbit is an LLM reviewer with no convergence guarantee — it can find another nit on every round. The triage protocol below tells you when each finding deserves a fix vs. when to stop the loop.

## What to do

1. **Run the review:**
   ```bash
   coderabbit review --plain --base master --type committed && printf '\n\n════════════════════════════════════════════════════════════════════════════\nSTOP. Review output above is INPUT, not a TODO list.\n\nBefore any Edit:\n  1. Read the SOURCE CODE for every finding (do not trust CR line numbers — they\n     are sometimes wrong; verify by grep).\n  2. Triage each finding into apply / skip (with reason) / defer (with issue).\n  3. WRITE A PLAN inline to the user: files to change, blast radius (callers,\n     sibling files, tests, docs), risks, verification step.\n  4. Wait for user approval (or rely on prior global approval if the plan is\n     single-file < 10 LOC and the verdict is unambiguous).\n  5. ONLY THEN apply.\n\nThe triage output is NOT the plan. Triage tells you what to do; the plan tells\nyou how, in what order, with what risks. Skipping the plan step is the most\ncommon CR-local failure mode.\n════════════════════════════════════════════════════════════════════════════\n'
   ```
   The command runs in 2-5 minutes. Use `run_in_background: true` and the Monitor-style wait pattern (`until grep -qiE "Review completed|findings ✔" <output> ...`).

   The trailing `printf` block is a checklist the orchestrator MUST read before doing anything. It is not a separate `/plan` skill invocation — the orchestrator plans inline in the next user-facing message. The point is to break the reflex of going from "triage table" straight to "Edit call".

2. **Verify the CLI is installed:** if `which coderabbit` is empty, tell the user to install via the CodeRabbit docs and skip this step. Do NOT pretend the review ran.

3. **For each finding, classify it (read the source, do not trust labels OR line numbers):**

   | Class | What it looks like | Action |
   |---|---|---|
   | **Real safety** | Missing error path, missing runtime guard on cast, unhandled rejection, race condition, leak | Apply |
   | **Project rule alignment** | Violates `code-style.md` or `security.md` rule (e.g., `.select('id')` observability §5, audit-event subqueries §10) | Apply |
   | **Readability that aids a reader** | Helper hoisted out of a loop, name clarifies a non-obvious branch, comment explains a hidden invariant | Apply if < 10 lines |
   | **Aesthetic preference** | Pure style choice with no observable benefit; prefers a different but equivalent shape | Skip with reason |
   | **Contradicts the codebase pattern** | Suggestion would diverge from how 5+ similar files do the same thing | Skip with reason — pattern consistency wins |
   | **Scope expansion** | "While you're here, also rewrite X" — outside the PR's purpose | Defer to GitHub Issue |

4. **STOP. Plan before any Edit.** After the triage table, write a short inline plan: which findings will be applied, the file:line for each, what other files / tests / docs the change touches, what the verification step is. Get user approval (or rely on prior global approval if every applied finding is single-file < 10 LOC and pattern-matched). Triage output is NOT the plan — it tells you what to do, not how.

5. **Apply each approved "Apply" finding.** Don't batch unrelated fixes. If a fix changes more than 10 lines or touches a 4th file, stop and re-plan.

6. **For each "Skip" finding, briefly note the reason** in the round summary you give the user.

7. **Re-run the review** after your fix commit lands.

8. **Stop the loop** when ANY of these is true:
   - Round comes back with 0 findings.
   - ≥ 75% of a round's findings are "Aesthetic preference" or "Contradicts codebase pattern."
   - Two consecutive rounds produce only stylistic findings with no Apply verdicts.
   - You've shipped 4 fix commits driven by CR local on this branch (cap — escalate to user judgment after that).

## Round summary template (give this to the user after each round)

```
CR local round N — <count> findings

| File:line | Severity | Class | Verdict | Why |
|-----------|----------|-------|---------|-----|
| ...       | ...      | ...   | apply/skip | ... |

Applied: <count>
Skipped: <count>
Stop condition met: yes/no — <reason>
```

## Why this is not a hook

A pre-push hook running `coderabbit review` would block pushes for 2-5 minutes per attempt and trigger on every push including amended fixups. The orchestrator runs CR local at the right moments (mid-development for early signal, pre-push as part of `/fullpush`) — not on every git push.

## Common mistakes to avoid

- **Trusting CodeRabbit's severity labels.** Round 3 of PR #108 had `nitpick / trivial` findings that were genuine project-rule violations. Read the comment and judge against the codebase.
- **Trusting CodeRabbit's file paths and line numbers.** PR #108 round 4: CR pointed at `seed.ts:15-16` for a finding that actually lived in `rpc-start-internal-exam-session.spec.ts:55`. Always verify with grep/Read before editing.
- **Applying every finding to make CodeRabbit silent.** That's how PRs grow scope and refactor-induced bugs creep in. Skip-with-reason is a valid verdict.
- **Skipping a finding because "it's just a nit."** Round 2 of PR #108 caught a missing error path on `full_name` restore — labeled nitpick, was actually a real silent-failure path.
- **Skipping the plan step after triage.** The triage table is not a plan. Even when verdicts look obvious, READ THE SOURCE for every Apply, and write a short plan to the user before any Edit. The reminder block printed by the bash command exists because this is the most common failure mode.
- **Not re-running after a fix.** Each fix can surface new issues that the previous round didn't see. Re-run until a stop condition trips.
