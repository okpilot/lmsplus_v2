# Agent Rules — critic (plan-critic + implementation-critic)

> Model: sonnet by default; **Opus** for security-path / high-stakes gates + the final stability round (see Multi-Round Review Discipline § Model tier) | Trigger: pre-commit (plan + implementation) | Blocking: on CRITICAL/ISSUE

## Purpose
Pre-commit quality gates that catch plan-level and implementation-level errors before they reach `git commit`. Plan-critic reviews validated plans against the codebase. Implementation-critic reviews staged changes against the approved plan. Together they reduce the volume of post-commit findings by catching mistakes earlier.

## Severity Levels

Uses critic severity levels: CRITICAL, ISSUE, SUGGESTION. No additional levels are introduced for critic handling.

## Multi-Round Review Discipline (plan-critic + post-commit reviewers)

> Rationale: LLM review is probabilistic — one clean pass is one sample, not proof. This ports the `agent-coderabbit-local.md` non-determinism discipline to internal review. Applies to **plan-critic** and the post-commit **semantic-reviewer** / **code-reviewer**. It does NOT apply to **implementation-critic** (see exemption below).

- **Coverage rounds vs stability rounds.** A *coverage round* runs critics with distinct lenses in parallel to surface findings broadly (breadth). A *stability round* re-runs the SAME critic configuration against the SAME (unchanged) artifact to test for variance (depth). **Only stability rounds count toward the clean-floor** — diverse-lens coverage rounds find different things; they do not prove any one lens is stable.
- **Minimum consecutive-clean floor (stability rounds).** The gate is NOT satisfied by one clean round:
  - **N = 2** consecutive clean stability rounds for a normal multi-file plan.
  - **N = 3** when the plan/diff touches a security path — the canonical trigger set from `agent-workflow.md § Red-Team Agent Trigger` (`supabase/migrations/**`, `packages/db/src/**`, `apps/web/app/app/quiz/actions/**`, `apps/web/app/auth/**`, `apps/web/proxy.ts`, `docs/security.md`), determined from the plan's file list (plan reviews) or `git diff origin/master...HEAD --name-only` plus staged changes (diff reviews). Fetch and verify the base first (see `agent-workflow.md` § "Always diff against `origin/master`") — an unresolvable base must ABORT, never be read as "no paths matched".
  - A *clean round* = zero APPLY-worthy findings (CRITICAL/ISSUE, or a SUGGESTION chosen to apply). Stylistic-only and skip-with-reason findings do NOT break a clean round.
- **Reset on finding; not on skip.** Any round with an APPLY finding resets the consecutive-clean counter to 0 (fix, then resume counting). A validated skip-with-reason (false positive / contradicts the codebase pattern) does NOT reset — otherwise the validate-first discipline (`agent-workflow.md § Finding Validation`) is structurally penalized.
- **Ceiling / diminishing returns.** Cap at **4 total rounds**. If the floor is unmet at the ceiling, STOP and **escalate to the user** with the residual findings — do not loop. This replaces "orchestrator resolves directly" for the ceiling case: when the orchestrator cannot converge the critics, the user decides.
- **Implementation-critic is EXEMPT from the floor.** Its artifact (the `git diff --staged`) MUTATES on every fix, so "consecutive clean on the same artifact" is undefined; and it has no skip condition, so a floor would force ≥2 passes on every trivial commit. It keeps its existing **2-round revision maximum + orchestrator takeover** (below).
- **Learner counting.** A finding that recurs across rounds of the SAME gate on the SAME artifact counts as ONE occurrence for the learner's frequency tracker (which promotes at 2+ across *different* commits, per `agent-learner.md`) — the orchestrator deduplicates within-run recurrences before reporting to the learner.
- **Scope / cost.** plan-critic already skips <10-line single-file changes (its cost control). Post-commit reviewer multi-round applies only when the diff touches the security-path trigger set above; otherwise a single post-commit pass stands. Coverage rounds may run in parallel to bound wall-clock.
- **Model tier (couple model strength to stakes — the second lever against non-determinism).** More rounds add cheap *samples*; a stronger model gives *better* samples. Use both:
  - **Sonnet** (default) — mechanical implementation, routine post-commit review, coverage rounds on normal diffs.
  - **Opus** — critics (plan-critic, implementation-critic, semantic-reviewer) when the diff touches the **security-path trigger set** (the canonical set in `agent-workflow.md § Red-Team Agent Trigger`: `supabase/migrations/**`, `packages/db/src/**`, quiz actions, auth, `proxy.ts`, `security.md`) OR the work is high-stakes (the user flags it, or it introduces a new architectural pattern), AND for the **final stability round** of any gate (the decision round needs confidence, not breadth). Set via the Agent tool's `model: 'opus'` override per invocation.
  - Precedent: code-reviewer was bumped haiku→sonnet after haiku threw false positives — same reasoning, one tier up. The mechanical *implementer* stays on Sonnet; the *reviewer of its output* goes to Opus on high-stakes gates.

## Handling Results

### DO
- Run plan-critic on every multi-file plan, after validation and before user approval.
- Fix all ISSUE and CRITICAL findings before proceeding to execution (plan-critic) or commit (implementation-critic).
- Run plan-critic under the **Multi-Round Review Discipline** (above): coverage rounds surface findings, then require N consecutive clean stability rounds (2 normal / 3 security-path), ceiling 4, then escalate to the user. (Supersedes the former single-revision-round cap.)
- Respect the 2-round revision cap for implementation-critic. After 2 rounds between critic and implementer without convergence, the orchestrator takes over.
- Treat SUGGESTION findings as non-blocking — note them in the summary but do not gate on them.
- Validate critic findings before acting on them, same as with semantic-reviewer (see Finding Validation in `agent-workflow.md`).
- For plan-critic CRITICAL findings, the orchestrator resolves directly — do not send back for a revision round.
- Report critic findings to the user in the agent findings summary (agent / severity / count / status) alongside post-commit agent results.
- Run implementation-critic on staged changes even for small single-file edits — only plan-critic is skipped for trivial changes.
- Trace `CREATE OR REPLACE FUNCTION` chain to the latest definition before flagging a missing-pattern finding on a Postgres function — see the "Pre-Flag Verification" sections in `plan-critic.md`, `semantic-reviewer.md`, and `implementation-critic.md`.

### NEVER
- Skip implementation-critic, even for small changes. Plan-critic may be skipped for single-file changes under 10 lines, but implementation-critic always runs.
- Exceed the round ceiling — **4 total rounds for plan-critic** (then escalate to the user, per the Multi-Round Review Discipline), **2 revision rounds for implementation-critic** (then the orchestrator takes over). Infinite loops waste time and context.
- Count a coverage round (diverse lenses) toward the plan-critic consecutive-clean floor — only same-configuration stability rounds count.
- Apply the consecutive-clean floor to implementation-critic — it is exempt (moving artifact + no skip condition).
- Let critics modify code or plans directly. Critics report findings; the orchestrator or implementing agent makes changes.
- Replace post-commit agents with pre-commit critics. Critics are additive — they reduce but do not eliminate the need for post-commit review.
- Dismiss a critic finding because "the post-commit agents will catch it." Fix it now; post-commit agents are the safety net, not the primary gate.
- Let a CRITICAL finding from implementation-critic be handled by the implementing agent. CRITICAL triggers orchestrator intervention directly.
- Run plan-critic on single-file changes under 10 lines — the overhead exceeds the value.

---

*Last updated: 2026-07-23 (security-path floor derivation now reads `origin/master...HEAD` — never the stale local `master`; #1134. Prior: 2026-06-20 Multi-Round Review Discipline.)*
