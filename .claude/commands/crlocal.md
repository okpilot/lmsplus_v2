Run CodeRabbit's local CLI against the branch diff and triage findings. CR-local is a member of EVERY round of the pre-push review gate (`agent-workflow.md § Pre-Push Review Gate`), dispatched in the same batch as the other reviewers and reading the same range — not a separate step after them.

> **RULE 0 — NO PROSE.** State what is true; delete the rest. No justification, no precedent, no archaeology — that is what `git log` is for. Every sentence is a claim that can be false, so fewer sentences means fewer defects. If a fact is derivable, ship the command, not the paragraph. Evidence is not prose: a skip reason, an `EVIDENCE:` line, a finding's stated basis or a required status/summary stays wherever a rule asks for it.

## What to do

1. **Run the review:**

   **Version-gate FIRST (CLI ≥ 0.7.0), before anything else.** `which coderabbit` only proves the binary exists; a 0.6.x install still reaches `--committed` and dies on it mid-round. Parse `major.minor.patch` and compare NUMERICALLY (a glob like `0.[0-6].*` is fragile — it mis-handles multi-digit minors). This must run above the `coderabbit review` block:

   ```bash
   command -v coderabbit >/dev/null || { echo 'coderabbit CLI not installed — install via https://docs.coderabbit.ai/cli/ then re-run (do NOT pretend the review ran)'; exit 1; }
   ver=$(coderabbit --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
   IFS=. read -r vmaj vmin _ <<< "$ver"
   if [ -z "$ver" ] || [ "$vmaj" -eq 0 -a "$vmin" -lt 7 ]; then
     echo "coderabbit '${ver:-unknown}' too old — need >= 0.7.0 (or use the 0.6.x flags: --type committed --plain)"; exit 1
   fi
   ```

   The `command -v` check comes FIRST so a missing binary reports "not installed → install" (the actionable fix), not a misleading "too old". Only once the CLI exists does the numeric `major.minor` compare gate an outdated one.

   Fetch next — the review's `--base` reads `origin/master`, and a failed fetch leaves it resolvable at its OLD value (see `agent-workflow.md` § "Always diff against `origin/master`, never the bare local `master`").

   ```bash
   git fetch origin || { echo 'fetch failed — ABORT, do not review against a stale base'; exit 1; }
   coderabbit review --committed --base origin/master -c .coderabbit.yaml > /tmp/cr-local-roundN.log 2>&1; rc=$?; \
   printf '\n════════════════════════════════════════════════════════════════════════════\nSTOP. Triage → Plan → Execute → Pipeline → Re-run.\nThe review log is INPUT, not a TODO list. VERIFY THE CLAIM, not just the\npath: every finding asserts something about the code and CR is sometimes\nwrong on the merits — trace functions to their LATEST definition, grep for\ncolumns it says exist, recompute counts, establish any asserted extent. See agent-coderabbit-local.md\n\u00a7 Verify Before Acting. Then triage apply/skip/defer, write a short plan\ninline (files, blast radius, risks, verification), then execute and land the\nround's ONE pooled fixup commit.\n════════════════════════════════════════════════════════════════════════════\n' >> /tmp/cr-local-roundN.log; \
   echo "coderabbit exit code: $rc" >> /tmp/cr-local-roundN.log; exit "$rc"
   ```

   **Capture `rc=$?` — do not let the review's exit code be swallowed.** The `;` before `printf` means the shell's final status is `printf`'s, not the review's, so a missing CLI, a removed flag, or a rejected `--base` would otherwise look like a clean pass with zero findings. **A non-zero exit code means the review DID NOT RUN — never count that round as clean.** Read the code off the last line of the log.
   The command runs in 2-5 minutes. Use `run_in_background: true` and the Monitor-style wait pattern — and include the exit-code line in the predicate, or a fast failure never terminates the wait:

   ```bash
   until grep -qiE "Review completed|findings ✔|coderabbit exit code" /tmp/cr-local-roundN.log; do sleep 5; done
   ```

   On the exact failures the `rc` capture exists to catch (missing CLI, removed flag, rejected `--base`) the CLI exits in milliseconds and the log contains only the STOP banner plus `coderabbit exit code: N` — neither "Review completed" nor "findings ✔" ever appears, so a predicate without the third term spins to timeout instead of failing fast. Then read the last line to decide clean-vs-failed.

   **Flags (CLI 0.7.0+).** `--plain` was REMOVED (plain text is now the default output) and `--type committed` was renamed to `--committed`. CLI 0.6.5 still accepted the old forms, so a stale invocation dies with `unknown option '--plain'` before reviewing anything. If a future release moves them again, read `coderabbit review --help` rather than guessing.

   **If the CLI rejects `origin/master` as a `--base` value**, fall back to `--base-commit`, but resolve the SHA into a variable FIRST and guard it — an `exit 1` INSIDE `$(...)` only exits the command-substitution subshell, so `--base-commit "$(... || exit 1)"` still runs with an EMPTY base on failure (verified). Use:

   ```bash
   BASE=$(git rev-parse --verify origin/master^{commit}) || { echo 'origin/master unresolvable — ABORT'; exit 1; }
   coderabbit review --committed --base-commit "$BASE" -c .coderabbit.yaml > /tmp/cr-local-roundN.log 2>&1; rc=$?; \
   printf '\n════════════════════════════════════════════════════════════════════════════\nSTOP. Triage → Plan → Execute → Pipeline → Re-run.\nThe review log is INPUT, not a TODO list. VERIFY THE CLAIM, not just the\npath: every finding asserts something about the code and CR is sometimes\nwrong on the merits — trace functions to their LATEST definition, grep for\ncolumns it says exist, recompute counts, establish any asserted extent. See agent-coderabbit-local.md\n\u00a7 Verify Before Acting. Then triage apply/skip/defer, write a short plan\ninline (files, blast radius, risks, verification), then execute and land the\nround's ONE pooled fixup commit.\n════════════════════════════════════════════════════════════════════════════\n' >> /tmp/cr-local-roundN.log; \
   echo "coderabbit exit code: $rc" >> /tmp/cr-local-roundN.log; exit "$rc"
   ```

   The fallback uses the SAME monitored wrapper as the primary invocation above — fresh `/tmp/cr-local-roundN.log` redirect, STOP banner, and `rc` capture + `exit "$rc"`. A bare fallback (no redirect, no rc) lets the monitor stop on the primary's failed attempt while the fallback is still running, and drops the fallback's findings from the log.

   (The help text documents `--base <branch>` with plain-branch examples, so a slash-containing remote-tracking ref may not resolve on every version.) Do NOT fall back to a bare `--base master` — that is the stale-base bug this form exists to avoid (see `agent-workflow.md` § "Always diff against `origin/master`, never the bare local `master`").

   **Always pass `-c .coderabbit.yaml`** (belt-and-suspenders). Both the hosted PR bot AND the CLI auto-load the repo-root config — confirmed by behavioral A/B 2026-06-18 (CLI 0.6.1): a fixture violating the `actions.ts` `path_instructions` was flagged identically with and without `-c` (see `reference-crlocal-cli-vs-cloud` memory). So `-c` is **cheap redundancy, not a necessity** — keep it because it makes the config explicit and is robust if a future CLI version changes auto-load behavior. Omit only if `.coderabbit.yaml` does not exist. You may pass additional rule-dense docs the same way (`-c .coderabbit.yaml CLAUDE.md`); mind the prompt token budget. (Note: the CLI honors `path_instructions` but does NOT run `pre_merge_checks`/`custom_checks` as named merge gates — those are hosted-PR-bot-only, confirmed by a second A/B 2026-06-18; their protections still surface via `path_instructions` + CR's default security review.)

   **Belt-and-suspenders reminder delivery.** Two layers:
   1. The trailing `printf` block is appended to `/tmp/cr-local-roundN.log` via `>>` (must be on the printf, not on the `coderabbit review` line — shell redirect scope ends at the semicolon, so `2>&1` on the first command does not carry over to printf). When the orchestrator reads the completed log, the STOP block is at the bottom, right after the findings. Works in both foreground and background bash modes.
   2. A `PostToolUse` hook (`.claude/hooks/cr-local-plan-reminder.sh`, wired in `.claude/settings.json`) also fires for any Bash invocation containing `coderabbit review`. For background commands the hook fires when the wrapper exits (early), priming the orchestrator before findings exist; for foreground commands it fires when the review actually returns.

   Do not strip either layer. The hook alone is unreliable on background bash (fires too early); the printf alone is unreliable if someone forgets to redirect it into the log (then it lands only in bash stdout, which background mode doesn't see).

2. **Verify the CLI is installed:** if `which coderabbit` is empty, tell the user to install via the CodeRabbit docs and skip this step. Do NOT pretend the review ran.

3. **For each finding, VERIFY ITS FACTUAL PREMISE, then classify it.** Do not trust the label, the
   line number, or the assertion itself. A finding claiming a function behaves a certain way, that a
   file writes a column, or that something is a type error is a HYPOTHESIS — confirm it against
   source first (latest `CREATE OR REPLACE` **and** `DROP`+`CREATE`; grep the column; run a scoped
   type-check that includes the file). Only a purely mechanical edit, where a wrong value fails a
   test immediately, may be applied on the test's word. Full table:
   `.claude/rules/agent-coderabbit-local.md` § Verify Before Acting — MANDATORY GATE.

   | Class | What it looks like | Action |
   |---|---|---|
   | **Real safety** | Missing error path, missing runtime guard on cast, unhandled rejection, race condition, leak | Apply |
   | **Project rule alignment** | Violates `code-style.md` or `security.md` rule (e.g., `.select('id')` observability §5, audit-event subqueries §10) | Apply |
   | **Readability that aids a reader** | Helper hoisted out of a loop, name clarifies a non-obvious branch, comment explains a hidden invariant | Apply if < 10 lines |
   | **Aesthetic preference** | Pure style choice with no observable benefit; prefers a different but equivalent shape | Skip with reason |
   | **Contradicts the codebase pattern** | Suggestion would diverge from how 5+ similar files do the same thing | Skip with reason — pattern consistency wins |
   | **Scope expansion** | "While you're here, also rewrite X" — outside the PR's purpose | Defer to GitHub Issue |

4. **STOP. Plan before any Edit.** After the triage table, write a short inline plan: which findings will be applied, the file:line for each, what other files / tests / docs the change touches, what the verification step is. Get user approval (or rely on prior global approval if every applied finding is single-file < 10 LOC and pattern-matched). Triage output is NOT the plan — it tells you what to do, not how.

5. **Pool this round's "Apply" findings with the other reviewers' before committing.** CR-local's verdicts are not a commit of their own: the round's fixup commit carries every reviewer's applied findings together (`agent-workflow.md § Pre-Push Review Gate` — one fixup commit per round, never per finding, never per reviewer). If a fix changes more than 10 lines or touches a 4th file, stop and re-plan. The fixup commit triggers NOTHING itself — the next round reads it. **Keep this round's triage table**: the learner runs once per branch after the loop and takes every round's CR-local table as input, the only place a CR-local finding is counted toward rule promotion (`agent-learner.md § DO`).

6. **For each "Skip" finding, briefly note the reason** in the round summary you give the user.

7. **The next round re-runs the review** once the round's pooled fixup commit lands. Never re-run on an unchanged diff to chase a clean result.

8. **The gate owns the loop, not this command.** Stop on the FIRST round carrying no apply-worthy finding — 0 findings, or stylistic-only `Aesthetic preference` / `Contradicts codebase pattern` with zero Apply verdicts. No minimum and no floor. An **Apply** verdict extends the loop by one round; a skip-with-reason does not. **Ceiling 3 rounds** — at it, STOP and escalate to the user; a NEW critical in a section an earlier round passed means the diff is too large, so split it rather than running another round. Every round runs with `-c .coderabbit.yaml`. Cloud CR on the pushed PR stays the authoritative gate — we never merge on `CHANGES_REQUESTED`.

## Round summary template (give this to the user after each round)

```
CR local round N — <count> findings

| File:line | Severity | Class | Verdict | Why |
|-----------|----------|-------|---------|-----|
| ...       | ...      | ...   | apply/skip | ... |

Applied: <count>  (pooled into the round's single fixup commit with the other reviewers')
Skipped: <count>
Round <N> of max 3; this round apply-worthy: yes/no
Stop condition met: yes/no — <reason: "no apply-worthy finding → stop" or "3-round ceiling → escalate">  (cloud CR on the PR is the authoritative gate)
```

## Common mistakes to avoid

- **Trusting CodeRabbit's severity labels.** Round 3 of PR #108 had `nitpick / trivial` findings that were genuine project-rule violations. Read the comment and judge against the codebase.
- **Trusting CodeRabbit's file paths and line numbers.** PR #108 round 4: CR pointed at `seed.ts:15-16` for a finding that actually lived in `rpc-start-internal-exam-session.spec.ts:55`. Always verify with grep/Read before editing.
- **Applying every finding to make CodeRabbit silent.** That's how PRs grow scope and refactor-induced bugs creep in. Skip-with-reason is a valid verdict.
- **Skipping a finding because "it's just a nit."** Round 2 of PR #108 caught a missing error path on `full_name` restore — labeled nitpick, was actually a real silent-failure path.
- **Skipping the plan step after triage.** The triage table is not a plan. Even when verdicts look obvious, READ THE SOURCE for every Apply, and write a short plan to the user before any Edit. The reminder block printed by the bash command exists because this is the most common failure mode.
- **Not re-running after a fix.** Each fix can surface new issues that the previous round didn't see. The round after a fixup commit is not optional; only a round with no apply-worthy finding ends the loop.
