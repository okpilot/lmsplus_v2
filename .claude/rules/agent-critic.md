# Agent Rules — critic (plan-critic + implementation-critic)
> Model: **Sonnet — both critics, always; review work never drops to Haiku** (§ Model tier) | Trigger: pre-commit (plan + implementation) | Blocking: on CRITICAL/ISSUE
## Purpose
Pre-commit quality gates before `git commit`. Plan-critic reviews validated plans against the codebase. Implementation-critic reviews staged changes against the approved plan.
## Severity Levels
CRITICAL, ISSUE, SUGGESTION. No additional levels.
## Multi-Round Review Discipline (post-commit reviewers)
Applies to post-commit **semantic-reviewer** / **code-reviewer** only. NOT implementation-critic (exempt), NOT plan-critic (runs ONCE — § Model tier).
- **Coverage vs stability rounds.** A *coverage round* runs critics with distinct lenses in parallel (breadth). A *stability round* re-runs the SAME configuration against the SAME unchanged artifact (depth). **Only stability rounds count toward the minimum M.** A fix resets the baseline: the confirmation round after it is a stability round against the NEW baseline and counts toward M.
- **Minimum-rounds-met + last-round-clean floor.** On a normal diff: a single post-commit pass stands, no floor. **M = 3** stability rounds minimum, then stop on the first round at or after M with no APPLY-worthy findings, when the diff touches a security path (`agent-workflow.md § Red-Team Agent Trigger`), determined from `git diff origin/master...HEAD --name-status -M` plus staged changes, taking BOTH paths of an `R` entry — NOT `--name-only`, which prints only a rename's DESTINATION. Fetch and verify the base first; an unresolvable base must ABORT, never read as "no paths matched".
- A *clean round* = zero APPLY-worthy findings (CRITICAL/ISSUE, or a SUGGESTION chosen to apply).
- **Extend on finding; not on skip.** An APPLY finding does NOT reset the round counter — it **extends the loop by one round**: fix it, run one more round to confirm nothing new. Cannot stop *on* a round that still carries an APPLY verdict, cannot stop *before* round M. A validated skip-with-reason neither extends nor blocks.
- **Wording-refinement findings are bounded to ONE round — a FALSE claim is not a wording finding.**
  - **Refinement** — prose is true but could be clearer. If a round returns a refinement on prose the PREVIOUS round just rewrote, LOG IT AND STOP.
  - **False claim** — prose asserts something the code does not do. **Never bounded**, whatever round it lands on.
  - **Bounded-out findings do not extend the loop.** Not skips-with-reason, but carry the same burden: record the finding and the one-line basis the prose is TRUE.
  - **This is an ORCHESTRATOR duty.** A fresh critic has no memory of prior rounds.
- **Ceiling.** Cap at **4 total rounds**. Unmet floor at the ceiling → STOP, escalate to the user with residual findings.
- **Implementation-critic is EXEMPT from the floor** — its artifact (`git diff --staged`) mutates on every fix. Keeps its **2-round revision maximum + orchestrator takeover**.
- **Learner counting.** A finding recurring across rounds of the SAME gate on the SAME artifact is ONE occurrence.
- **Scope / cost.** Multi-round applies only on a security-path diff; otherwise a single pass stands. Coverage rounds may run in parallel.
- **Model tier — EVERY subagent runs Sonnet (or Haiku for mechanical checks). Opus is the orchestrator, and only the orchestrator. No security-path exception.** Where a security diff needs Opus-grade scrutiny, the ORCHESTRATOR reads it itself.
  - **Fan-out, not tier, is the cost lever.** Opus is ~1.67x-2.5x Sonnet, not 5-10x. Dropping tier saves ~40-60%; running 3 critics instead of 9 saves ~67%. Re-verify current rates before quoting.
  - **Never run critic ROUNDS on plan PROSE.** plan-critic runs ONCE per plan, skipped for single-file changes under 10 lines.
  - **Cap coverage rounds at 2 lenses**, not 3.
  - **Prefer "execute / grep / diff and report the output" over "analyse and assess".** `semantic-reviewer.md`, `code-reviewer.md` and `implementation-critic.md` each carry a § Verify by Executing and require an `EVIDENCE:` line on any runtime claim. plan-critic stays read-only by design — grep / `git show` / `git diff` only.
  - **The backstop:** the orchestrator validates every finding before acting (`agent-workflow.md § Finding Validation`).
  - Sonnet is the floor for review work; Haiku stays for mechanical checks (doc-updater).
## Handling Results
### DO
- Run plan-critic on every multi-file plan, after validation and before user approval.
- Fix all ISSUE and CRITICAL findings before proceeding to execution (plan-critic) or commit (implementation-critic).
- Run plan-critic **ONCE** per plan — no coverage rounds, no minimum-rounds floor, no ceiling. Fix APPLY-worthy findings and proceed. A redraft severe enough to be a different plan gets its own single run.
- Respect the 2-round revision cap for implementation-critic. After 2 rounds without convergence, the orchestrator takes over.
- Treat SUGGESTION findings as non-blocking — note in the summary, do not gate.
- Validate critic findings before acting on them (`agent-workflow.md § Finding Validation`).
- For plan-critic CRITICAL findings, the orchestrator resolves directly — no revision round exists with a single run. An ISSUE **or** CRITICAL it cannot resolve escalates to the user.
- Report critic findings in the agent findings summary (agent / severity / count / status).
- Run implementation-critic on staged changes even for small single-file edits — the sole exception is a commit whose paths are ALL under `.claude/agent-memory/**`. Plan-critic is additionally skipped for trivial changes.
- Trace the supersession chain — EVERY form, enumerated in `agent-workflow.md` § "name EVERY supersession form" — to the latest definition FOR THE MATCHING SIGNATURE before flagging a missing-pattern finding on a Postgres function (see "Pre-Flag Verification" in `plan-critic.md`, `semantic-reviewer.md`, `implementation-critic.md`).
### NEVER
- Skip implementation-critic for any commit other than an agent-memory-only one. Plan-critic may additionally be skipped for single-file changes under 10 lines.
- Re-run plan-critic on the same plan to chase a clean round — it runs ONCE. For implementation-critic, exceed **2 revision rounds** (then the orchestrator takes over).
- Count a coverage round toward a post-commit reviewer's minimum-rounds floor — only same-configuration stability rounds count.
- Apply the minimum-rounds floor to implementation-critic — exempt.
- Let critics modify code or plans directly. Critics report findings; the orchestrator or implementing agent changes.
- Replace post-commit agents with pre-commit critics — additive, not a substitute.
- Dismiss a critic finding because "the post-commit agents will catch it."
- Let a CRITICAL finding from implementation-critic be handled by the implementing agent — orchestrator intervenes directly.
- Run plan-critic on single-file changes under 10 lines.
