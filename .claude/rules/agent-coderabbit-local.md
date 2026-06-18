# Agent Rules — coderabbit-local (external CLI)

> External LLM reviewer (`coderabbit review --plain --base master --type committed -c .coderabbit.yaml`) | Trigger: pre-push, mid-development | Non-blocking

## Purpose
CodeRabbit local CLI runs the same review engine that comments on PRs, against the local branch diff before push. Catches things our internal agents systematically miss — observability gaps on `.select('id')` chains, runtime guard omissions on RPC casts, cleanup ordering, helper hoisting, error-path consistency. Cheaper to run pre-push than to triage on the PR after CI.

The runtime command is `/crlocal`. This file is the binding policy.

## Trigger Conditions
- **Pre-push:** every multi-commit branch (2+ commits) before pushing. Required step in `/fullpush`.
- **Mid-development:** when a single commit added 200+ LOC of new code, or when the orchestrator wants early signal before continuing.
- **Skip if:** `which coderabbit` returns nothing — tell the user to install via `https://docs.coderabbit.ai/cli/`.

Do NOT run after every commit — too slow (2-5 min per round), no value on small fix commits.

## Apply-vs-Defer

The triage table below decides class; the apply/skip/defer **verdict** is bound by `agent-workflow.md § Apply-vs-Defer Discipline`. **Default to APPLY.** DEFER requires ≥30 LOC, separate concern, and a design decision the PR doesn't establish — all three. Defer-budget per PR is 0-2; 3+ is a red flag.

## Finding Classification (read source, do not trust labels)

Every CR finding falls into exactly one of these classes. Severity labels (`trivial`, `minor`, `major`, `critical`, `nitpick`, `potential_issue`) are advisory — verify against the actual code.

| Class | What it looks like | Verdict |
|---|---|---|
| **Real safety** | Missing error path, missing runtime guard on `as unknown as T` cast, unhandled rejection, race condition, leak, silent zero-row no-op | **APPLY** |
| **Project rule alignment** | Violates a rule in `code-style.md` or `security.md` (e.g. §5 mutation `{ error }` destructure, §5 cast guard pairing, §10 audit-event subquery soft-delete filter) | **APPLY** |
| **Readability that aids a future reader** | Helper hoisted out of a loop, name clarifies a non-obvious branch, comment explains a hidden invariant | **APPLY if < 10 lines** |
| **Aesthetic preference** | Pure style choice with no observable behaviour change; prefers a different but equivalent shape | **SKIP with reason** |
| **Contradicts the codebase pattern** | Suggestion would diverge from how 5+ similar files do the same thing (codebase consistency wins) | **SKIP with reason** |
| **Scope expansion** | "While you're here, also rewrite X" — outside the PR's purpose | **DEFER to GitHub Issue** |

## Stop Conditions for the Loop

CodeRabbit is an LLM. It does not converge — it can find a new nit on every round, and the same diff yields different findings run to run. A single quiet round is therefore NOT evidence the diff is clean. The loop ends when EITHER:

1. **Minimum-rounds floor met — N consecutive clean rounds.** A *clean round* = 0 findings, OR stylistic-only findings (`Aesthetic preference` / `Contradicts codebase pattern`) with zero APPLY verdicts.
   - **N = 2** for a normal diff.
   - **N = 3** when the diff touches a security path (the `agent-workflow.md § Red-Team Agent Trigger` set: `supabase/migrations/`, `packages/db/`, `apps/web/app/app/quiz/actions/`, `apps/web/app/auth/`, `apps/web/proxy.ts`, `docs/security.md`) — determined via `git diff master...HEAD --name-only`.
   - Every floor round runs with `-c .coderabbit.yaml`. Any round carrying an APPLY verdict **resets the consecutive-clean counter to zero** (fix, then resume counting).
2. **4 fix commits driven by CR local** on the current branch — a hard ceiling that caps total effort even if the floor is unmet; escalate to user judgment rather than looping further.

## Handling Results

### DO
- Run via `/crlocal` slash command — never call `coderabbit review` ad hoc; the command embeds the protocol.
- **Always pass `-c .coderabbit.yaml`.** The hosted PR bot auto-loads the repo-root config; the CLI does not reliably do so, so the project's `path_instructions`/rules are absent unless fed explicitly — the single biggest controllable gap between a local run and the PR review. Omit only if the file is absent. (Especially load-bearing post-Forgejo-migration, where the PR bot is gone and the CLI is the only CodeRabbit — see `reference-crlocal-cli-vs-cloud` memory.)
- **Honor the minimum-rounds floor** (Stop Conditions §1): a single clean round never satisfies the gate — require N consecutive clean rounds (2 normal / 3 security-path), resetting on any APPLY verdict.
- Read the source for every finding before triaging — CR's labels are LLM-generated, not authoritative.
- Apply each APPLY-verdict finding in a focused commit (one subject per commit). Don't batch unrelated fixes.
- Report a per-round summary table (file:line / severity / class / verdict / why) to the user before re-running.
- Re-run the review after each fix commit — fixes can surface new findings that weren't visible before.
- For DEFER verdicts, file a GitHub Issue with the CR comment context (severity, file, line, suggestion).
- Stop the loop the moment a stop condition trips (floor met, or 4-fix ceiling hit) — but NOT on a single clean round; report the running consecutive-clean count each round and tell the user which condition tripped.
- Treat findings labeled `nitpick / trivial` with the same source-reading rigour as `potential_issue / major`. Severity labels are unreliable.
- When SKIPPING, give a concrete reason (cite the codebase pattern, point to a code-style rule, or explain the trade-off).

### NEVER
- Trust CodeRabbit's severity label as a triage shortcut — read the code.
- Apply every finding to make CodeRabbit silent. Refactor-induced bugs creep in this way.
- Skip a finding because "it's just a nit" — past PRs had `nitpick / trivial` findings that were genuine project-rule violations (PR #108 round 1: 3 such findings on `.select('id')` observability; round 2 caught a missing error path on `full_name` restore labeled trivial).
- Run more than 4 fix-driven loops without escalating to the user.
- Bypass the skip-with-reason requirement. Silent skips are forbidden — every skip needs a one-line rationale in the round summary.
- Run CR local as a pre-push git hook. The wall-clock is too long, the protocol needs orchestrator judgment, and `--no-verify` would be the natural workaround. The orchestrator runs it via `/fullpush`.
- Defer something that's < 10 lines and clearly within scope. The per-agent SUGGESTION rules (e.g., `agent-semantic-reviewer.md`, `agent-code-reviewer.md`) say "fix if under 10 lines"; for the broader APPLY-vs-DEFER decision, see `agent-workflow.md § Apply-vs-Defer Discipline` (DEFER requires ≥ 30 LOC plus separate concern plus design decision — all three).

## Common Pitfalls Observed

These are the patterns CR local caught that our internal agents missed (#1–5 first surfaced on PR #108, 2026-05-07). Update this list as new ones surface.

1. **Service-role cleanup discarding `.select('id')` result.** code-style.md §5 explicitly requires logging on `data?.length > 0` even for cleanup-context where zero rows is valid. Internal agents read `.select('id')` is present and stop there.
2. **Cast `as unknown as T` without runtime guard.** code-style.md §5 requires pairing the cast with `Array.isArray`/`typeof` checks. Internal agents accept the cast as type assertion.
3. **Silent failure paths on cleanup.** `await admin.from(...).update(...).eq(...)` without `{ error }` destructure in afterEach blocks. Same pattern as the §5 mutation rule but in test infrastructure.
4. **`.clear()` of in-memory ID set unreachable on cleanup throw.** Need try/finally so state resets on both success and error paths, otherwise next afterEach masks its own state.
5. **Helper functions defined inside `for`-loop iteration.** Closures over loop-scoped vars + harder to scan. Move out, accept as parameter.
6. **CR-local flags a Postgres guard/branch as "missing" without tracing the `CREATE OR REPLACE FUNCTION` chain.** CR reads one migration in isolation and never traces forward to where the guard was added or last redefined. Before accepting any such finding, trace the chain to the LATEST definition (the same "Pre-Flag Verification" rule our internal agents follow in `agent-critic.md` / `semantic-reviewer.md` / `implementation-critic.md` / `plan-critic.md` — but CR-local is external and does not apply it, so the orchestrator must). Also: file-path refs may look wrong due to the **two-dir migration mirror** (`packages/db/NNN_* ≡ supabase/timestamp_*`); neither dir is authoritative over the other, and docs use the supabase timestamp convention. Both validated as false positives on PR #750 (`start_exam_session` guard claimed missing; the AJ red-team-vector migration ref claimed "should be 044").

---

*Last updated: 2026-06-18 (made `-c .coderabbit.yaml` config parity the default; added minimum-rounds floor — 2 consecutive clean rounds normally, 3 for security-path diffs — to counter CR non-determinism)*
