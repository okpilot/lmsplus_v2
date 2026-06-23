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

   **Always pass `-c .coderabbit.yaml`** (belt-and-suspenders). Both the hosted PR bot AND the CLI auto-load the repo-root config — confirmed by behavioral A/B 2026-06-18 (CLI 0.6.1): a fixture violating the `actions.ts` `path_instructions` was flagged identically with and without `-c` (see `reference-crlocal-cli-vs-cloud` memory). So `-c` is **cheap redundancy, not a necessity** — keep it because it makes the config explicit and is robust if a future CLI version changes auto-load behavior. Omit only if `.coderabbit.yaml` does not exist. You may pass additional rule-dense docs the same way (`-c .coderabbit.yaml CLAUDE.md`); mind the prompt token budget. (Note: the CLI honors `path_instructions` but does NOT run `pre_merge_checks`/`custom_checks` as named merge gates — those are hosted-PR-bot-only, confirmed by a second A/B 2026-06-18; their protections still surface via `path_instructions` + CR's default security review.)

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

8. **Minimum-rounds-met + last-round-clean (rule chosen 2026-06-23, replaces consecutive-clean).** CodeRabbit is non-deterministic — the same diff yields different findings each run — so a *single* quiet round is weak evidence; run several rounds to sample it. But CR-local is a **pre-push preview** of the cloud CodeRabbit that reviews the actual PR on push (the authoritative gate — we never merge on `CHANGES_REQUESTED`), so a "stability proof" on the local preview is not required. Run a **minimum of M rounds**, then stop on the first round **at or after** M with **no apply-worthy findings** (0 findings, or stylistic-only `Aesthetic preference` / `Contradicts codebase pattern` with zero Apply verdicts):
   - **M = 2** for a normal diff.
   - **M = 3** when the diff touches a security path (the `agent-workflow.md § Red-Team Agent Trigger` set: `supabase/migrations/`, `packages/db/`, `apps/web/app/app/quiz/actions/`, `apps/web/app/auth/`, `apps/web/proxy.ts`, `docs/security.md`). Compute via `git diff master...HEAD --name-only`.

   Every round must run with `-c .coderabbit.yaml`. An **Apply** verdict does NOT reset a counter — it **extends the loop by one round** (fix it, run one more round to confirm nothing new surfaced). You cannot stop *on* a round that still has an Apply verdict, nor *before* round M. Report the running round count to the user each round (e.g. "round 2/2 min, last round clean → stop").

9. **Stop the loop** when EITHER:
   - The minimum-rounds rule above is satisfied (≥ M rounds run AND the latest round has no apply-worthy findings), OR
   - You've shipped **4 fix commits** driven by CR local on this branch — a hard ceiling that caps total effort even if the rule isn't met; escalate to user judgment rather than looping further.

## Round summary template (give this to the user after each round)

```
CR local round N — <count> findings

| File:line | Severity | Class | Verdict | Why |
|-----------|----------|-------|---------|-----|
| ...       | ...      | ...   | apply/skip | ... |

Applied: <count>
Skipped: <count>
Rounds run: <X> / min M   (M=2 normal, M=3 security-path); this round apply-worthy: yes/no
Stop condition met: yes/no — <reason: "≥M rounds and last round clean" or "4-fix ceiling → escalate">  (cloud CR on the PR is the authoritative gate)
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
