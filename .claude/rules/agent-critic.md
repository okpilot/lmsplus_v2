# Agent Rules — critic (plan-critic + implementation-critic)

> Model: **Sonnet — both critics, always; review work never drops to Haiku** (the repo-wide tier rule — Sonnet for every subagent, Haiku for mechanical checks, Opus for the orchestrator only — is in § Model tier) | Trigger: pre-commit (plan + implementation) | Blocking: on CRITICAL/ISSUE

## Purpose
Pre-commit quality gates that catch plan-level and implementation-level errors before they reach `git commit`. Plan-critic reviews validated plans against the codebase. Implementation-critic reviews staged changes against the approved plan. Together they reduce the volume of post-commit findings by catching mistakes earlier.

## Severity Levels

Uses critic severity levels: CRITICAL, ISSUE, SUGGESTION. No additional levels are introduced for critic handling.

## Multi-Round Review Discipline (post-commit reviewers)

Applies to the post-commit **semantic-reviewer** / **code-reviewer** only. NOT implementation-critic
(exempt — see below), and NOT plan-critic, which runs ONCE (§ Model tier).

- **Coverage vs stability rounds.** A *coverage round* runs critics with distinct lenses in parallel
  (breadth). A *stability round* re-runs the SAME configuration against the SAME unchanged artifact
  (depth). **Only stability rounds count toward the clean-floor.**
- **Consecutive-clean floor.** On a normal diff the gate does not engage at all — **a single
  post-commit pass** stands, no floor. **N = 3** consecutive clean stability rounds when the diff
  touches a security path (the canonical set in `agent-workflow.md § Red-Team Agent Trigger`),
  determined from `git diff origin/master...HEAD --name-only` plus staged changes. Fetch and verify
  the base first; an unresolvable base must ABORT, never read as "no paths matched".
- A *clean round* = zero APPLY-worthy findings (CRITICAL/ISSUE, or a SUGGESTION chosen to apply).
- **Reset on finding; not on skip.** An APPLY finding resets the counter to 0. A validated
  skip-with-reason does NOT — otherwise validate-first discipline is structurally penalized.
- **Wording-refinement findings are bounded to ONE round — but a FALSE claim is not a wording
  finding.** Split the class before applying the bound:
  - **Refinement** — the prose is true but could be clearer. Bounded: if a round returns a
    refinement on prose the PREVIOUS round just rewrote, LOG IT AND STOP. Scoped to prose the last
    round touched.
  - **False claim** — the prose asserts something the code does not do. **Never bounded**, whatever
    round it lands on. A comment-accuracy FIX is the highest-risk site for a NEW false claim, so
    round N+1 on rewritten prose is exactly where the real ones surface.
  - **Bounded-out findings do not reset the clean counter**, whatever severity the critic labelled
    them. They are NOT skips-with-reason (that term is for findings wrong on the merits) — but they
    carry the same evidentiary burden: record the finding and the one-line basis on which the prose
    is TRUE. Without this, wording nits at ISSUE severity hold the floor open to the ceiling.
  - **This is an ORCHESTRATOR duty.** A fresh critic has no memory of prior rounds and cannot honour
    "raise it only once".

  The refinement/false-claim CLASSIFICATION governs both critics too; the multi-round discipline
  built on it does not.
- **Ceiling.** Cap at **4 total rounds**. If the floor is unmet at the ceiling, STOP and **escalate
  to the user** with the residual findings — do not loop.
- **Implementation-critic is EXEMPT from the floor.** Its artifact (`git diff --staged`) MUTATES on
  every fix, so "consecutive clean on the same artifact" is undefined, and it has no skip condition.
  It keeps its **2-round revision maximum + orchestrator takeover**.
- **Learner counting.** A finding recurring across rounds of the SAME gate on the SAME artifact is
  ONE occurrence — deduplicate within-run recurrences before reporting.
- **Scope / cost.** Multi-round applies only on a security-path diff; otherwise a single pass stands.
  Coverage rounds may run in parallel to bound wall-clock.

- **Model tier — EVERY subagent runs Sonnet (or Haiku for mechanical checks). Opus is the
  orchestrator, and only the orchestrator. No security-path exception.** A per-dispatch judgment call
  gets over-applied; a rule with no exception is one that actually gets followed. Where a security
  diff needs Opus-grade scrutiny, the ORCHESTRATOR reads it itself — it already holds the context.
  - **Fan-out, not tier, is the cost lever.** As of 2026-08-25: Opus 5 is $5/$25 per MTok, Sonnet 5
    $3/$15 list ($2/$10 promotional through 2026-08-31) — so **1.67x-2.5x**, not the 5-10x commonly
    assumed. Dropping the tier saves ~40-60%; running 3 critics instead of 9 saves ~67%. Re-read the
    current rates before quoting these; the conclusion holds either way.
  - **Never run critic ROUNDS on plan PROSE.** plan-critic runs ONCE per plan, skipped only for
    single-file changes under 10 lines. The findings that matter come from critics reading CODE.
  - **Cap coverage rounds at 2 lenses**, not 3 — three overlap heavily and re-derive each other.
  - **Prefer "execute / grep / diff and report the output" over "analyse and assess".** This is what
    makes cheap subagents safe: executable verification is both cheaper and more reliable than
    inference. See `agent-workflow.md § Delegation Protocol`.
  - **The backstop** is already required: the orchestrator validates every finding before acting
    (`agent-workflow.md § Finding Validation`), and it is the Opus.
  - Sonnet is the floor for review work; Haiku stays for mechanical checks (doc-updater).

## Handling Results

### DO
- Run plan-critic on every multi-file plan, after validation and before user approval.
- Fix all ISSUE and CRITICAL findings before proceeding to execution (plan-critic) or commit (implementation-critic).
- Run plan-critic **ONCE** per plan — no coverage rounds, no consecutive-clean floor, no ceiling. Fix its APPLY-worthy findings and proceed. If a finding is severe enough that the plan must be redrafted, the redraft is a NEW plan and gets its own single run. (2026-08-24: supersedes the consecutive-clean floor, which now governs the post-commit reviewers only. A plan is prose, and rounds on prose do not converge — § Model tier.)
- Respect the 2-round revision cap for implementation-critic. After 2 rounds between critic and implementer without convergence, the orchestrator takes over.
- Treat SUGGESTION findings as non-blocking — note them in the summary but do not gate on them.
- Validate critic findings before acting on them, same as with semantic-reviewer (see Finding Validation in `agent-workflow.md`).
- For plan-critic CRITICAL findings, the orchestrator resolves directly — with a single run there is no revision round to send them back to. An ISSUE **or** CRITICAL it cannot resolve escalates to the user instead; `agent-workflow.md` § NEVER forbids executing with either one still open, so neither has a proceed-anyway path.
- Report critic findings to the user in the agent findings summary (agent / severity / count / status) alongside post-commit agent results.
- Run implementation-critic on staged changes even for small single-file edits — only plan-critic is skipped for trivial changes.
- Trace the supersession chain — EVERY supersession form — an OPEN set headed by `CREATE OR REPLACE FUNCTION`, `DROP FUNCTION` + `CREATE FUNCTION` and `ALTER FUNCTION <fn>(<arg types>)`, and enumerated in `agent-workflow.md` § "For any task that locates a DB object's current definition, name EVERY supersession form" — to the latest definition FOR THE MATCHING SIGNATURE (an overloaded function has a different body per argument list) before flagging a missing-pattern finding on a Postgres function — see the "Pre-Flag Verification" sections in `plan-critic.md`, `semantic-reviewer.md`, and `implementation-critic.md`.

### NEVER
- Skip implementation-critic, even for small changes. Plan-critic may be skipped for single-file changes under 10 lines, but implementation-critic always runs.
- Re-run plan-critic on the same plan to chase a clean round — it runs ONCE. For implementation-critic, exceed **2 revision rounds** (then the orchestrator takes over). Infinite loops waste time and context.
- Count a coverage round (diverse lenses) toward a post-commit reviewer's consecutive-clean floor — only same-configuration stability rounds count.
- Apply the consecutive-clean floor to implementation-critic — it is exempt (moving artifact + no skip condition).
- Let critics modify code or plans directly. Critics report findings; the orchestrator or implementing agent makes changes.
- Replace post-commit agents with pre-commit critics. Critics are additive — they reduce but do not eliminate the need for post-commit review.
- Dismiss a critic finding because "the post-commit agents will catch it." Fix it now; post-commit agents are the safety net, not the primary gate.
- Let a CRITICAL finding from implementation-critic be handled by the implementing agent. CRITICAL triggers orchestrator intervention directly.
- Run plan-critic on single-file changes under 10 lines — the overhead exceeds the value.

---

*Last updated: 2026-08-25*
