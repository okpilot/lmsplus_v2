Complete the described work autonomously through the full pipeline — and **merge it yourself** once CI is fully green and CodeRabbit has requested no changes.

> ## ⚠️ THIS COMMAND **MERGES**.
> It will squash-merge the PR without further confirmation once the gate below passes.
> If you want to keep merge authority yourself, use **`/autonomerge`** instead (same work, stops at the open PR).

**Pairs with `/goal`.** `/goal` is the built-in harness goal mechanism (a session Stop hook that re-drives work until a condition holds — not a project command file). Invoke `/goal` with the same intent (e.g. *"complete this work autonomously per our pipeline; you may merge only if CI is fully green and CR requested no changes"*) so it keeps the work going until the terminal state — **a merged PR**. This command defines *how* (the pipeline + merge policy); `/goal` provides the persistence. If invoked without an active goal, still drive the work to the terminal state within the session.

**Scope:** `$ARGUMENTS` describes the work. If empty, continue the current in-flight task. Treat the goal/condition as the directive — do not pause to ask "should I proceed?"; only stop to ask the user when a genuine requirement ambiguity blocks correct execution (use AskUserQuestion sparingly).

---

## The pipeline (binding — follow `CLAUDE.md` and `.claude/rules/agent-workflow.md` exactly)

Run every stage. Do not skip stages to save time — the gates exist to prevent 24-hour review cycles.

1. **Explore** — delegate codebase mapping to Explore subagents. Keep your context clean.
2. **Root cause** — verify the described fix is the RIGHT fix before planning.
3. **Interview** — surface scope/behavioral/priority ambiguities. Auto-skip per `agent-workflow.md` only when truly unambiguous; state "No ambiguities identified" explicitly. In autonomous mode, ask the user only when an ambiguity genuinely blocks correctness.
4. **Spec** — create one via spec-workflow MCP if the change spans 3+ files or introduces a new pattern; skip for refactors/bug-fixes/<3 files (use a validated plan instead).
5. **Plan + validate** — impact analysis, contract check, pattern scan, doc/schema check, security surface (`agent-workflow.md § Plan Validation`).
6. **Plan-critic** — run the plan-critic agent (skip only for single-file <10-line changes). Resolve CRITICAL directly; 1 revision round for ISSUE, then resolve directly.
7. **Approval** — the active `/goal` IS the approval. Do not block on user sign-off; record assumptions in the plan and proceed.
8. **Execute** — delegate implementation to Sonnet subagents (parallel when independent, worktree isolation for risky parallel edits). Use the 5-section delegation template. Read every result.
9. **Implementation-critic** — run on `git diff --staged` before **every** commit. NEVER skip (even single-file). CRITICAL → orchestrator resolves; ISSUE → ≤2 revision rounds.
10. **Commit** — you create the commit. Let all hooks fire (pre-commit: biome + check-types + unit tests; commit-msg: conventional format). NEVER `--no-verify`. NEVER amend after a hook failure — make a new commit. End messages with the `Co-Authored-By` trailer.
11. **Post-commit agents (after EVERY commit, in parallel)** — code-reviewer, semantic-reviewer, doc-updater, test-writer. Read ALL results. Then: **red-team** if the diff touches the security paths in `agent-workflow.md § Red-Team Agent Trigger` (`supabase/migrations/**`, `packages/db/src/**`, `apps/web/app/app/quiz/actions/**`, `apps/web/app/auth/**`, `apps/web/proxy.ts`, `docs/security.md`) — plus `packages/db/migrations/**` per the two-dir migration mirror; **coderabbit-sync** if rules changed (`.claude/rules/code-style.md`, `.claude/rules/security.md`, `docs/security.md`, `biome.json`, `CLAUDE.md`).
12. **Validate findings before fixing** — analyze the claim, check implications, decide real/false-positive. Reviewer ISSUE ≠ automatically correct. Read the source; don't trust labels.
13. **Fix + re-review** — fix validated issues, commit, and **re-run the relevant agents on the fix commit when production code changed**.
14. **Learner** — run after each full post-commit cycle. Propose rule changes only at count ≥2 across distinct commits.
15. **Apply-vs-Defer discipline** (`agent-workflow.md`) — default **APPLY**. DEFER only when ALL THREE hold (≥30 LOC + separate concern + design decision) AND file a GitHub issue with effort + priority + acceptance + source link. **SKIP** only with a written on-the-merits reason. No in-flight findings at push.

## Pre-push gate

16. **PR-level semantic sweep** (branches with 2+ commits) — run semantic-reviewer on the full PR diff (`git diff origin/master...HEAD`) — what CodeRabbit will see.
17. **`/crlocal`** — run CodeRabbit local; triage each finding per `.claude/rules/agent-coderabbit-local.md` (read source, classify, APPLY/SKIP/DEFER, re-run after fix commits, stop on the loop's stop conditions).
18. **`/fullpush`** — run the full self-audit + read-only lint + check-types + full test suite + build, plus conditional migration / e2e / **mandatory red-team** when those paths changed.
19. **Push** — NEVER push to `master`; always a feature branch + PR. The pre-push hook (security-auditor + dep audit) must pass — NEVER bypass it.
20. **Open the PR** — descriptive title + body (summary, verification, deferred follow-ups). End the body with the Claude Code attribution line.

## Merge policy — ✅ MERGE WHEN, AND ONLY WHEN, ALL HOLD

After the PR is open, wait for CI and cloud CodeRabbit, then merge if **every** condition is true:

- **CI is fully green** — zero non-passing checks (`gh pr checks <PR>`). A failure may be re-run **only** when the log proves it is transient infrastructure (e.g. Supabase `502` on container start, *before any test executed*) — not inferred from "looks flaky." **Bound: re-run a given check at most twice; if it still fails, treat it as a real failure regardless of appearance.** Never merge while any check is non-green.
- **CodeRabbit's latest review on the exact HEAD SHA is not CHANGES_REQUESTED.** Bind to the head commit: a `CHANGES_REQUESTED` on a *superseded* commit is cleared by a later `APPROVED`/`COMMENTED` on the current HEAD. Verify with `gh api repos/<owner>/<repo>/pulls/<n>/reviews` and compare `commit_id` to HEAD. The "CodeRabbit / Review skipped" *check* label is not the review state — check the actual review.
- **No finding requires manual evaluation** (no functional/UX behavior a human must click through). Behavior-preserving refactors and self-verifying changes qualify; new user-facing behavior usually does not. If manual eval IS required, do NOT auto-merge — fall back to the `/autonomerge` handoff (open PR, report, let the user merge).
- **`mergeable: MERGEABLE` and `mergeStateStatus: CLEAN`.** GitHub computes these asynchronously — right after a push they are often `UNKNOWN`. **Poll** (`gh pr view <n> --json mergeable,mergeStateStatus`, re-query after a short wait) until `mergeable` is no longer `UNKNOWN` before deciding.

**If any condition fails — fix, then RE-RUN THE GATES, not just CI.** A fix commit re-enters the pipeline at stage 9 and must pass impl-critic → post-commit agents (+ conditional red-team / coderabbit-sync) → PR-level semantic sweep → `/crlocal` → `/fullpush` **before** the merge gate is re-evaluated. Do NOT merge a fix commit on a green-CI + re-approved-CR signal alone while skipping the internal re-review the pipeline mandates. Never merge with unresolved CRITICAL/BLOCKING/ISSUE, failing CI, or a standing CR change request.

**On merge:** `gh pr merge <n> --squash --delete-branch`. Then:
- **Sync local master — guarded, NOT a blind hard reset.** First inspect `git log origin/master..master --oneline`. If it is empty, `git checkout master && git fetch origin -q && git reset --hard origin/master`. If it lists commits, each is EITHER a commit that rode this branch (folded into the squash — safe to drop) OR a local-master commit cut after this branch that rides a *future* PR (e.g. an `/insights`/memory-curation commit — **must be preserved**). Verify each by content before discarding; cherry-pick/keep any survivor (do not let the reset destroy un-merged local-master work). Only hard-reset once survivors are preserved.
- Confirm the issue auto-closed (`Closes #N`); close it manually if needed.
- Update the board (move to Done; the squash's `Closes #N` usually automates this).
- Report: merged commit SHA, closed issues, and any deferred follow-up issue numbers.
