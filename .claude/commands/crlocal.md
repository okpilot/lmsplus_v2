Run CodeRabbit's local CLI against the current branch and triage findings. Use this BEFORE pushing or before /fullpush, on any branch with 2+ commits where post-push CodeRabbit will review the PR.

## Why this exists

CodeRabbit local catches things our other agents miss — observability gaps, runtime guard omissions, cleanup ordering, unsafe casts. Running it before push is cheaper than doing the same triage on the PR after CI runs. We also want to catch findings before semantic-reviewer or impl-critic miss them, not after.

But CodeRabbit is an LLM reviewer with no convergence guarantee — it can find another nit on every round. The triage protocol below tells you when each finding deserves a fix vs. when to stop the loop.

## What to do

1. **Run the review:**
   ```bash
   coderabbit review --plain --base master --type committed -c .coderabbit.yaml > /tmp/cr-local-roundN.log 2>&1; \
   printf '\n════════════════════════════════════════════════════════════════════════════\nSTOP. Triage → Plan → Execute → Pipeline → Re-run.\nThe review log is INPUT, not a TODO list. Read source for every finding\n(verify file paths and line numbers — CR is sometimes wrong), triage into\napply/skip/defer, write a short plan inline (files, blast radius, risks,\nverification), then execute and run the post-commit review agents.\n════════════════════════════════════════════════════════════════════════════\n' >> /tmp/cr-local-roundN.log
   ```
   The command runs in 2-5 minutes. Use `run_in_background: true` and the Monitor-style wait pattern (`until grep -qiE "Review completed|findings ✔" <output> ...`).

   **Always pass `-c .coderabbit.yaml`** (config parity). The hosted PR bot auto-loads the repo-root config; the CLI does NOT reliably do so, so the project's `path_instructions` and rules are absent unless fed explicitly — this is the single biggest controllable difference between a local run and the PR review. Omit `-c` only if `.coderabbit.yaml` does not exist. You may pass additional rule-dense docs the same way (`-c .coderabbit.yaml CLAUDE.md`); mind the prompt token budget. (Note: whether the CLI parses the YAML as *structured* config — `profile`, `tools`, `path_filters` — vs. plain-text instructions is unverified; `path_instructions` are natural-language and transfer regardless.)

   **Belt-and-suspenders reminder delivery.** Two layers:
   1. The trailing `printf` block is appended to `/tmp/cr-local-roundN.log` via `>>` (must be on the printf, not on the `coderabbit review` line — shell redirect scope ends at the semicolon, so `2>&1` on the first command does not carry over to printf). When the orchestrator reads the completed log, the STOP block is at the bottom, right after the findings. Works in both foreground and background bash modes.
   2. A `PostToolUse` hook (`.claude/hooks/cr-local-plan-reminder.sh`, wired in `.claude/settings.json`) also fires for any Bash invocation containing `coderabbit review`. For background commands the hook fires when the wrapper exits (early), priming the orchestrator before findings exist; for foreground commands it fires when the review actually returns.

   Do not strip either layer. The hook alone is unreliable on background bash (fires too early); the printf alone is unreliable if someone forgets to redirect it into the log (then it lands only in bash stdout, which background mode doesn't see).

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

8. **Minimum-rounds floor (anti-non-determinism).** CodeRabbit is non-deterministic — the same diff yields different findings each run, so a *single* quiet round is NOT evidence the diff is clean. Declare CR-local "clean" only after **N consecutive clean rounds**, where a *clean round* = 0 findings, OR stylistic-only findings (`Aesthetic preference` / `Contradicts codebase pattern`) with zero Apply verdicts:
   - **N = 2** for a normal diff.
   - **N = 3** when the diff touches a security path (the `agent-workflow.md § Red-Team Agent Trigger` set: `supabase/migrations/`, `packages/db/`, `apps/web/app/app/quiz/actions/`, `apps/web/app/auth/`, `apps/web/proxy.ts`, `docs/security.md`). Compute via `git diff master...HEAD --name-only`.

   Every floor round must run with `-c .coderabbit.yaml`. Any round carrying an **Apply** verdict **resets the consecutive-clean counter to zero** — fix it, then resume counting from the next round. Report the running count to the user each round (e.g. "clean round 1/2").

9. **Stop the loop** when EITHER:
   - The minimum-rounds floor above is satisfied (N consecutive clean rounds), OR
   - You've shipped **4 fix commits** driven by CR local on this branch — a hard ceiling that caps total effort even if the floor isn't met; escalate to user judgment rather than looping further.

## Round summary template (give this to the user after each round)

```
CR local round N — <count> findings

| File:line | Severity | Class | Verdict | Why |
|-----------|----------|-------|---------|-----|
| ...       | ...      | ...   | apply/skip | ... |

Applied: <count>
Skipped: <count>
Consecutive clean rounds: <X>/<N>   (floor: N=2 normal, N=3 security-path; any Apply resets to 0)
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
