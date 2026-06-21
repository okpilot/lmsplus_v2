Complete the described work autonomously through the full pipeline, open the PR, report status — and then **stop. You do NOT merge.** The user keeps merge authority.

> ## ⚠️ THIS COMMAND DOES **NOT** MERGE.
> Same autonomous work as `/automerge`, but it **halts at the open, green PR** and hands off to the user. Never run `gh pr merge` under this command.
> If you want it to merge itself once CI is green and CR is clean, use **`/automerge`** instead.

**Pairs with `/goal`.** `/goal` is the built-in harness goal mechanism (a session Stop hook that re-drives work until a condition holds — not a project command file). Invoke `/goal` with the same intent (e.g. *"complete this work autonomously per our pipeline; open the PR but do NOT merge — I will merge"*) so it keeps the work going until the terminal state — **an open PR with all gates green, awaiting the user's merge.** The Stop condition is satisfied by the open PR, NOT by a merge. If invoked without an active goal, still drive the work to the open-PR terminal state within the session.

**Scope:** `$ARGUMENTS` describes the work. If empty, continue the current in-flight task. Treat the goal/condition as the directive — do not pause to ask "should I proceed?"; only stop to ask the user when a genuine requirement ambiguity blocks correct execution.

---

## The pipeline

Run the **identical pipeline as `/automerge`** — every stage in its `## The pipeline` and `## Pre-push gate` sections (Explore → root cause → interview → spec → plan + validate → plan-critic → execute → implementation-critic → commit with all hooks → post-commit agents [+ red-team / coderabbit-sync when triggered] → validate findings → fix + re-review → learner → Apply-vs-Defer discipline → PR-level semantic sweep → `/crlocal` → `/fullpush` → push to a feature branch → open the PR).

All the same rules bind: never push to `master`, never `--no-verify`, never amend after a hook failure, implementation-critic never skips, no in-flight findings at push, default APPLY / DEFER-with-issue / SKIP-with-reason.

## Merge policy — 🛑 DO NOT MERGE

After the PR is open, **do everything `/automerge` does to reach a mergeable state, but never merge it:**

1. Wait for CI and cloud CodeRabbit; **report** their status (don't act on merge):
   - `gh pr checks <n>` — list any non-passing check. A failure may be re-run **only** when the log proves it is transient infra (e.g. Supabase `502` on container start, before any test executed) — at most twice; a failure that persists is real. Don't reclassify a real failure as flaky.
   - CodeRabbit's latest review on the **exact HEAD SHA** (`gh api .../pulls/<n>/reviews`, compare `commit_id` to HEAD) — a `CHANGES_REQUESTED` on a superseded commit is cleared by a later `APPROVED` on HEAD. The "Review skipped" *check* label is not the review state.
   - `gh pr view <n> --json mergeable,mergeStateStatus` — poll until `mergeable` is no longer `UNKNOWN` (GitHub computes it async after a push).
2. **Triage and fix anything blocking** (failing CI, CR change requests, unresolved CRITICAL/BLOCKING/ISSUE) — push fixes, and **re-route each fix commit through the gates** (impl-critic → post-commit agents [+ conditional red-team/coderabbit-sync] → PR-level semantic sweep → `/crlocal` → `/fullpush`) before re-evaluating readiness, exactly as `/automerge` would. The goal is to leave the PR in a *ready-to-merge* state.
3. **Then STOP.** Hand off to the user with a concise report:
   - PR link + merged-readiness verdict (`✅ ready to merge` / `⛔ blocked by <X>`).
   - CI summary (all green / which checks failing).
   - CodeRabbit verdict on HEAD (approved / changes requested + what).
   - **Manual-eval required? yes/no** — if the PR adds user-facing behavior a human should click through before merge, say so and name what to verify (the user is merging blind otherwise).
   - Deferred follow-up issue numbers.
   - One line: *"Ready for your merge — run `/automerge` to have me merge it, or merge it yourself."*

Do NOT run `gh pr merge`, do NOT squash, do NOT delete the branch, do NOT reset local master. Those are the user's call (or `/automerge`'s). If the user later merges, a subsequent session handles the local-master sync.
