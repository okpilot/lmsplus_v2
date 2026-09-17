# Agent Rules — critic (plan-critic + implementation-critic)
> Model: **Sonnet — both critics, always; review work never drops to Haiku** (§ Model tier) | Trigger: plan-critic before user approval; implementation-critic in round 1 of the pre-push gate | Blocking: on CRITICAL/ISSUE
## Purpose
Plan-critic reviews a validated plan against the codebase, before user approval. Implementation-critic is an ordinary member of round 1 of the pre-push review gate (`agent-workflow.md § Pre-Push Review Gate`): it reviews the BRANCH diff against the approved plan and requirements, and its findings enter the same pooled triage as every other reviewer's.
## Severity Levels
CRITICAL, ISSUE, SUGGESTION. No additional levels.
## Loop Round Discipline
Governs every reviewer in the pre-push gate, implementation-critic included. NOT plan-critic, which runs ONCE (§ Model tier).
- A *clean round* = zero APPLY-worthy findings (CRITICAL/ISSUE, or a SUGGESTION chosen to apply). **Stop on the FIRST clean round.** No minimum, no floor.
- **Extend on finding; not on skip.** An APPLY finding **extends the loop by one round**: fix it, run one more round to confirm nothing new. Cannot stop *on* a round that still carries an APPLY verdict. A validated skip-with-reason neither extends nor blocks.
- **Wording-refinement findings are bounded to ONE round — a FALSE claim is not a wording finding.**
  - **Refinement** — prose is true but could be clearer. If a round returns a refinement on prose the PREVIOUS round just rewrote, LOG IT AND STOP.
  - **False claim** — prose asserts something the code does not do. **Never bounded**, whatever round it lands on.
  - **Bounded-out findings do not extend the loop.** Not skips-with-reason, but carry the same burden: record the finding and the one-line basis the prose is TRUE.
  - **This is an ORCHESTRATOR duty.** A fresh critic has no memory of prior rounds.
- **Ceiling — 3 rounds, the only round limit in this file.** At the ceiling STOP and escalate to the user with residual findings. A NEW critical in a section an earlier round passed means the diff is too large: SPLIT it, never run another round.
- **Learner counting.** A finding recurring across rounds on an UNCHANGED artifact is ONE occurrence (`agent-learner.md`).
- **Model tier — EVERY subagent runs Sonnet (or Haiku for mechanical checks). Opus is the orchestrator, and only the orchestrator. No security-path exception.** Where a security diff needs Opus-grade scrutiny, the ORCHESTRATOR reads it itself.
  - **Fan-out, not tier, is the cost lever.** Opus is ~1.67x-2.5x Sonnet, not 5-10x. Dropping tier saves ~40-60%; running 3 critics instead of 9 saves ~67%. Re-verify current rates before quoting.
  - **Never run critic ROUNDS on plan PROSE.** plan-critic runs ONCE per plan, skipped for single-file changes under 10 lines.
  - **Prefer "execute / grep / diff and report the output" over "analyse and assess".** `semantic-reviewer.md`, `code-reviewer.md` and `implementation-critic.md` each carry a § Verify by Executing and require an `EVIDENCE:` line on any runtime claim. plan-critic stays read-only by design — grep / `git show` / `git diff` only.
  - **The backstop:** the orchestrator validates every finding before acting (`agent-workflow.md § Finding Validation`).
  - Sonnet is the floor for review work; Haiku stays for mechanical checks (doc-updater).
## Handling Results
### DO
- Run plan-critic on every multi-file plan, after validation and before user approval.
- Fix all ISSUE and CRITICAL findings before proceeding to execution (plan-critic) or before the push (implementation-critic).
- Run plan-critic **ONCE** per plan — no rounds, no ceiling. Fix APPLY-worthy findings and proceed. A redraft severe enough to be a different plan gets its own single run.
- Run implementation-critic in round 1 of every pre-push gate, on the branch diff. No exemption.
- Treat SUGGESTION findings as non-blocking — note in the summary, do not gate.
- Validate critic findings before acting on them (`agent-workflow.md § Finding Validation`).
- For plan-critic CRITICAL findings, the orchestrator resolves directly — no revision round exists with a single run. An ISSUE **or** CRITICAL it cannot resolve escalates to the user.
- Report critic findings in the gate's pooled triage table (agent / severity / count / status).
- Trace the supersession chain — EVERY form, enumerated in `agent-workflow.md` § "name EVERY supersession form" — to the latest definition FOR THE MATCHING SIGNATURE before flagging a missing-pattern finding on a Postgres function (see "Pre-Flag Verification" in `plan-critic.md`, `semantic-reviewer.md`, `implementation-critic.md`).
### NEVER
- Skip implementation-critic in round 1. Plan-critic may be skipped for single-file changes under 10 lines.
- Re-run plan-critic on the same plan to chase a clean round — it runs ONCE.
- Exceed the 3-round ceiling; escalate instead.
- Punt a finding to another reviewer — six run in one round, so "someone else will catch it" is how a finding reaches nobody. Every finding gets a terminal disposition in the round's pooled triage.
- Let critics modify code or plans directly. Critics report findings; the orchestrator changes.
- Run plan-critic on single-file changes under 10 lines.
