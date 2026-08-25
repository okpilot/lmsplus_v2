# Agent Rules — critic (plan-critic + implementation-critic)

> Model: **Sonnet — both critics, always; review work never drops to Haiku** (the repo-wide tier rule — Sonnet for every subagent, Haiku for mechanical checks, Opus for the orchestrator only — is in § Model tier) | Trigger: pre-commit (plan + implementation) | Blocking: on CRITICAL/ISSUE

## Purpose
Pre-commit quality gates that catch plan-level and implementation-level errors before they reach `git commit`. Plan-critic reviews validated plans against the codebase. Implementation-critic reviews staged changes against the approved plan. Together they reduce the volume of post-commit findings by catching mistakes earlier.

## Severity Levels

Uses critic severity levels: CRITICAL, ISSUE, SUGGESTION. No additional levels are introduced for critic handling.

## Multi-Round Review Discipline (post-commit reviewers)

> Rationale: LLM review is probabilistic — one clean pass is one sample, not proof. This ports the `agent-coderabbit-local.md` non-determinism discipline to internal review. Applies to the post-commit **semantic-reviewer** / **code-reviewer**. It does NOT apply to **implementation-critic** (see the exemption below), and as of 2026-08-24 it no longer applies to **plan-critic** either, which runs ONCE — see § Model tier, "Never run critic ROUNDS on plan PROSE".

- **Coverage rounds vs stability rounds.** A *coverage round* runs critics with distinct lenses in parallel to surface findings broadly (breadth). A *stability round* re-runs the SAME critic configuration against the SAME (unchanged) artifact to test for variance (depth). **Only stability rounds count toward the clean-floor** — diverse-lens coverage rounds find different things; they do not prove any one lens is stable.
- **Minimum consecutive-clean floor (stability rounds).** Where the gate engages it is NOT satisfied by one clean round — but on a normal diff it does not engage at all:
  - **A single post-commit pass** on a normal multi-file diff: no stability rounds, no floor to meet (§ Scope / cost below). The **N = 2** that stood here until 2026-08-24 was **plan-critic's** floor — the row read "a normal multi-file *plan*" — and it left with plan-critic. Do not restore it for the post-commit reviewers; that would double the fan-out § Model tier exists to cut.
  - **N = 3** consecutive clean stability rounds when the diff touches a security path — the canonical trigger set from `agent-workflow.md § Red-Team Agent Trigger` (`supabase/migrations/**`, `packages/db/src/**`, `apps/web/app/app/quiz/actions/**`, `apps/web/app/auth/**`, `apps/web/proxy.ts`, `docs/security.md`), determined from `git diff origin/master...HEAD --name-only` plus staged changes. Fetch and verify the base first (see `agent-workflow.md` § "Always diff against `origin/master`, never the bare local `master`") — an unresolvable base must ABORT, never be read as "no paths matched".
  - A *clean round* = zero APPLY-worthy findings (CRITICAL/ISSUE, or a SUGGESTION chosen to apply). Stylistic-only and skip-with-reason findings do NOT break a clean round.
- **Reset on finding; not on skip.** Any round with an APPLY finding resets the consecutive-clean counter to 0 (fix, then resume counting). A validated skip-with-reason (false positive / contradicts the codebase pattern) does NOT reset — otherwise the validate-first discipline (`agent-workflow.md § Finding Validation`) is structurally penalized.
- **Wording-refinement findings are bounded to ONE round (#1222) — but a FALSE claim is not a
  wording finding.** Split the class before applying the bound:
  - **Refinement** — the prose is true but could be clearer, tighter, better placed, or the commit
    message could be phrased better. Bounded. If a round returns a refinement finding on prose that
    the PREVIOUS round just rewrote, the orchestrator LOGS IT AND STOPS; it does not spend a round.
    The bound is scoped to prose the last round touched — a refinement on a comment no round has
    rewritten is an ordinary finding and may be raised.
  - **False claim** — the prose asserts something the code does not do: a guard that is not there, a
    count that does not add up, an invariant the function does not hold. **Never bounded**, whatever
    round it lands on. This is `code-style.md` §10, whose promoted rationale is that a wrong comment
    is what the next reader trusts when deciding whether a guard can safely be removed. The
    semantic-reviewer tracker records that a comment-accuracy FIX is the highest-risk site for a new
    false claim — so round N+1 on rewritten prose is exactly where the real ones surface, and
    bounding it would suppress the highest-yield case. `a0e01943` is itself an
    instance: rewriting the defer-budget section, it attributed "8 filed against 7 closed" to
    the PR body's `## Deferred` section, which names 2 — the figure 8 is right, its stated source
    was not — and the round after caught it.
  - **Bounded-out findings do not reset the clean counter.** A refinement that is logged-and-stopped
    neither breaks a clean round nor resets the counter, whatever severity the critic labelled it —
    exactly as a validated skip-with-reason does not. It is NOT one of those, though: that term is
    reserved for findings wrong on the merits, and a refinement is correct on the merits, merely
    deferred by rule. It carries an evidentiary burden all the same — record the finding and the
    one-line basis on which the prose is TRUE. Classification is not self-certifying, and the
    orchestrator is the party that wants the loop to end, so an unwritten "that's just a refinement"
    is the same self-assertion this section refuses to accept from a first-illumination claim.
    Without this clause a critic returning wording nits at ISSUE severity would hold the floor unmet
    to the ceiling and force the escalation the bound exists to prevent.
  - **This is an ORCHESTRATOR duty, not a critic constraint.** A fresh critic invocation has no
    memory of prior rounds and cannot honour "raise it only once"; the orchestrator is what carries
    the round history and drops the repeat.

  The refinement/false-claim CLASSIFICATION above also governs plan-critic and
  implementation-critic; the multi-round discipline built on it does not — that is the post-commit
  reviewers' alone. Neither critic has a clean-round floor for a refinement to hold open:
  implementation-critic is exempt for the reasons below (its artifact mutates on every fix), and
  plan-critic runs once. Mirrors
  the post-commit stop rule in `CLAUDE.md § Post-commit review`. Rationale: an LLM reviewer returns
  non-empty on almost any prose, so the loop ends by rule or not at all. On this branch a single
  hook file drew four §10 wording findings across three critic rounds while the defects that
  mattered were behavioural.
- **Ceiling / diminishing returns.** Cap at **4 total rounds**. If the floor is unmet at the ceiling, STOP and **escalate to the user** with the residual findings — do not loop. This replaces "orchestrator resolves directly" for the ceiling case: when the orchestrator cannot converge the critics, the user decides.
- **Implementation-critic is EXEMPT from the floor.** Its artifact (the `git diff --staged`) MUTATES on every fix, so "consecutive clean on the same artifact" is undefined; and it has no skip condition, so a floor would force ≥2 passes on every trivial commit. It keeps its existing **2-round revision maximum + orchestrator takeover** (below).
- **Learner counting.** A finding that recurs across rounds of the SAME gate on the SAME artifact counts as ONE occurrence for the learner's frequency tracker (which promotes at 2+ across *different* commits, per `agent-learner.md`) — the orchestrator deduplicates within-run recurrences before reporting to the learner.
- **Scope / cost.** Post-commit reviewer multi-round applies only when the diff touches the security-path trigger set above; otherwise a single post-commit pass stands. Coverage rounds may run in parallel to bound wall-clock. (plan-critic's cost control is separate and no longer lives in this section: it runs once, and skips <10-line single-file changes altogether.)
- **Model tier — EVERY subagent runs Sonnet (or Haiku for mechanical checks). Opus is the
  orchestrator, and only the orchestrator. No security-path exception.** Superseded 2026-08-24
  (user directive: *"let's really think about Opus as the orchestrator and rest sonnet. cost is
  getting out of hand."*). The prior rule allowed Opus for security-path critics and the final
  stability round; that carve-out is precisely what failed, because a per-dispatch judgment call
  gets over-applied — on the run that prompted this, it was applied to every lens on every round.
  A rule with no exception is one that actually gets followed. Where a security diff needs
  Opus-grade scrutiny, the ORCHESTRATOR does that read itself: it already holds the context, so it
  costs one pass instead of re-loading a fresh ~200k-token context into a subagent.
  - **The tier was never the main cost lever — fan-out was.** Measured 2026-08-24 from the live
    model table: Opus 5 is $5/$25 per MTok against Sonnet 5's $3/$15 list, i.e. **1.67x**, not the
    5-10x commonly assumed. That run spent ~3.5M subagent tokens across ~12 Opus subagents at
    ~200-270k each. Dropping the tier saves ~40%; running 3 critics instead of 9 saves ~67%.
  - **Never run critic ROUNDS on plan PROSE.** plan-critic runs ONCE per plan, and is skipped only
    for single-file changes under 10 lines — the threshold § DO / § NEVER below carry, and the one
    every mirror carries. "Multi-file or security work" is NOT the trigger: that phrasing stood here
    briefly and would have skipped a 15-line single-file plan the threshold requires. On the run
    above, implementation-critic reading a real diff produced more real defects per token than nine
    plan-critics reading a planning document. The findings that mattered came from critics reading
    CODE.
  - **Cap coverage rounds at 2 lenses**, not 3. Three lenses overlapped heavily and largely
    re-derived each other.
  - **Prefer "execute / grep / diff and report the output" over "analyse and assess"** in subagent
    prompts. This is what makes cheap subagents safe: on that run the highest-value findings — a
    `42804` cast error and a `42702` ambiguity, both invisible to a clean `supabase db reset` —
    came from EXECUTING the function, not from model strength. Executable verification is both
    cheaper and more reliable than inference. See `agent-workflow.md § Delegation Protocol`.
  - **The backstop that makes this safe** is already required: the orchestrator validates every
    finding before acting (`agent-workflow.md § Finding Validation`), and it is the Opus. On that
    run the orchestrator caught several SUBAGENT errors that way — a doc-updater citation that did
    not say what it claimed, a critic reasoning from a design that had been superseded, and one of
    its own misreads.
  - Precedent retained: code-reviewer was bumped haiku→sonnet after haiku threw false positives.
    Sonnet is the floor for review work; Haiku stays for mechanical checks (doc-updater).

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

*Last updated: 2026-08-25 (the retired "BOTH supersession forms" quantifier is gone from the operative trace instruction here, and the § title quoted in this footer now matches the canonical heading. Cloud CodeRabbit found the quantifier standing in two files after the de-quantification commit; the repo-wide fixed-string grep (`code-style.md` §10 clause 3) found it in six, this one among them — the partial-edit tell that clause names. Found by cloud CodeRabbit on PR #1242. Prior: 2026-08-24 (trace instructions now name BOTH supersession forms — `CREATE OR REPLACE FUNCTION` and `DROP FUNCTION` + `CREATE FUNCTION` — matching the canonical rule in `agent-workflow.md` § "For any task that locates a DB object's current definition, name EVERY supersession form" (promoted learner count=2, 2026-08-09). A `CREATE OR REPLACE`-only grep certifies a superseded body as current, which is the exact failure that rule exists to prevent. Found by cloud CodeRabbit on PR #1242. Prior: 2026-08-24 (the plan-critic DO bullet now names an unresolvable ISSUE alongside CRITICAL — "resolves directly" described only the CRITICAL half while `agent-workflow.md` § NEVER forbids executing with either open, so a reader following the pointer from `plan-critic.md` landed on a page naming one severity. Found by implementation-critic during the mirror sweep for that widening; a phrase-grep had reported the sweep clean because `automerge.md` paraphrases it as "a CRITICAL YOU cannot resolve". Prior, same day: § Model tier's plan-critic trigger read "only for multi-file or security work", contradicting the skip threshold this same file states in four other places and every mirror carries — single-file changes under 10 lines. A 15-line single-file plan got opposite answers. The threshold is now stated inline. Found by CR-local round 3 on PR #1242. Prior, same day: the floor's N=2 row is GONE — a normal diff gets a single post-commit pass. That row read "a normal multi-file *plan*" and was plan-critic's floor; retiring plan-critic from this section orphaned it onto the post-commit reviewers, where it flatly contradicted § Scope / cost's "otherwise a single post-commit pass stands". The three live N=2 references in `agent-workflow.md` follow it; the two that narrate dated incidents under the then-current rule are left as the historical records they are. The refinement-classification sentence now names the classification as the thing both critics share, not the discipline. `agent-workflow.md § Prefer executable verification` is bounded by the target agent's own definition — plan-critic is read-only, so it is never asked to run code. `wrapup.md`'s critic checklist asks for ISSUE/CRITICAL resolved and SUGGESTIONs dispositioned, SUGGESTIONs being non-blocking. Found by CR-local round 1 on PR #1242. Prior, same day: plan-critic is OUT of the Multi-Round Review Discipline — it runs ONCE, per § Model tier's "Never run critic ROUNDS on plan PROSE"; the section heading, its scope sentence, the refinement-classification sentence, the DO bullet and two NEVER bullets all still demanded a consecutive-clean floor and a 4-round ceiling for it, and the mirrors in `agent-workflow.md`, `.claude/agents/plan-critic.md`, `.claude/commands/automerge.md` and `.claude/commands/wrapup.md` said the same. The floor now governs the post-commit reviewers only. The L3 model summary also read "sonnet — always, no exception" while § Model tier carves out Haiku for mechanical checks and Opus for the orchestrator; it now states what is true of the two critics and points at § Model tier for the repo-wide rule. Both were found by cloud CodeRabbit on PR #1242; the full mirror set was enumerated by the plan-critic agent. Model tier: EVERY subagent runs Sonnet/Haiku and Opus is the orchestrator only, no security-path exception — the carve-out was over-applied to every lens on every round; plus never run critic rounds on plan PROSE, cap coverage at 2 lenses, and prefer executable verification, since the tier is only a 1.67x lever while fan-out was ~67%. Prior: 2026-08-19 (the ONE-round bound splits wording REFINEMENTS, which are bounded and do not break the clean-round floor — the same effect as a validated skip-with-reason, but NOT classified as one, since that term is reserved for findings wrong on the merits — and must record the one-line basis on which the prose is TRUE, from FALSE claims about a guard/count/invariant, which are never bounded (the CHAIN is capped in `CLAUDE.md § Post-commit review`, at 3 follow-up commits then escalate) — the bound is an orchestrator duty, since a fresh critic has no round history; #1222 AC#4. Prior: 2026-07-23 security-path floor reads `origin/master...HEAD`.))))*
