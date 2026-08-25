# Agent Rules — coderabbit-local (external CLI)

> External LLM reviewer (`coderabbit review --committed --base origin/master -c .coderabbit.yaml`) | Trigger: pre-push, mid-development | Non-blocking

## Purpose
CodeRabbit local CLI runs the same review engine that comments on PRs, against the local branch diff before push. Catches things our internal agents systematically miss — observability gaps on `.select('id')` chains, runtime guard omissions on RPC casts, cleanup ordering, helper hoisting, error-path consistency. Cheaper to run pre-push than to triage on the PR after CI.

The runtime command is `/crlocal`. This file is the binding policy.

## Trigger Conditions
- **Pre-push:** every multi-commit branch (2+ commits) before pushing. Required step in `/fullpush`.
- **Mid-development:** when a single commit added 200+ LOC of new code, or when the orchestrator wants early signal before continuing.
- **Skip if:** `which coderabbit` returns nothing — tell the user to install via `https://docs.coderabbit.ai/cli/`. **Also version-gate, don't just presence-check:** the `--committed` / default-plain flags require CLI **≥ 0.7.0** (0.6.x used `--type committed` / `--plain`). Confirm `coderabbit --version` before running; on an older install either tell the user to upgrade or use the 0.6.x flag spelling — do NOT enter `/crlocal` and let it die on the flag mid-round.

Do NOT run after every commit — too slow (2-5 min per round), no value on small fix commits.

## Apply-vs-Defer

The triage table below decides class; the apply/skip/defer **verdict** is bound by `agent-workflow.md § Apply-vs-Defer Discipline`. **Default to APPLY.** DEFER requires ≥30 LOC, separate concern, and a design decision the PR doesn't establish — all three. Two budgets bind, both checked before push: VOLUME (0-2 deferrals per PR; 3+ does not fail automatically but means re-triaging every survivor and naming them in the push summary) and RATIO (if this PR filed anything at all and filed at least as many issues as it closes, counting every issue the branch author created after the merge-base, whatever its origin — the PR body's `## Deferred` section must name them all — `filed > 0 AND filed >= closed` — re-triage or claim the first-illumination exemption on its test).

## Verify Before Acting — MANDATORY GATE

**A CodeRabbit finding is a HYPOTHESIS about the code, never an observation of it.** CR sees a diff.
It does not trace a `CREATE OR REPLACE` chain, does not know which directories are frozen, and
routinely reasons from a superseded definition. Before ANY edit — including "obviously right" ones —
the factual premise must be confirmed against the source. Applying an unverified claim is the same
defect class as writing an unverified comment (`code-style.md` §10), and it is worse in one respect:
the finding arrives pre-argued, so it reads as already-checked.

### Which claims REQUIRE source verification (not optional, not "if unsure")

| Claim shape | Required check |
|---|---|
| "function X does / does not do Y" | Trace to the LATEST definition — EVERY supersession form (an OPEN set, enumerated in `agent-workflow.md`), sorted by timestamp prefix, and for the MATCHING SIGNATURE — an overloaded function has a different body per argument list. Never the first match. |
| "file X writes / reads column Y" | `grep` the column in that file. Absence is proof; do not infer from the filename. |
| "constraint / index / policy Z enforces W" | Read the constraint body. Which constraint carries a rule is frequently NOT the one its name suggests. |
| "this is a type error" / "this is a syntax error" | Run a **scoped** type-check that actually INCLUDES the file (see `agent-workflow.md § Plan Validation`). A green `tsc` from a config that excludes the path proves nothing. |
| "cite X instead" | Verify X exists AND is current. CR has proposed citing `packages/db/migrations/`, which is FROZEN and carries false history. |
| A count, total, or line number | Recompute it. Line numbers drift; prefer citing a grep-able predicate. |

### Which may be applied on the strength of a green test

Purely mechanical edits where a wrong value fails immediately — turning a literal into the constant
it already equals, a rename, a comment relocation. The test IS the check. **A behaviour change is
never in this class:** pair it with a mutation test (break the mechanism, confirm exactly the
intended test goes red) before committing.

### Precedent — both from one branch, one round apart

`content/vfr-rt-part3`, CR-local round 2, 2026-08-18. Two findings in the same round were **factually
false**, and both would have caused damage if applied:

1. *"`get_quiz_questions` does not shuffle ordering items — remove the clause."* It does:
   `20260702000300` (latest) runs `ORDER BY random()` over `jsonb_array_elements(q.ordering_items)`.
   CR had read `20260623000500`, a body predating the ordering type entirely. Complying would have
   deleted a TRUE statement about an answer-exposure guard.
2. *"`upsert-question.ts:47-55` updates questions with validated `subtopic_id`."* That file contains
   no `subtopic_id` at all, and a repo-wide sweep finds no app-layer write of it. Complying would
   have weakened a correct immutability claim into a hedge.

Neither was labelled speculative; both read as confident findings with line numbers. The only thing
that separated them from the ten real findings in the same run was tracing the source.

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

CodeRabbit is an LLM. It does not converge — it can find a new nit on every round, and the same diff yields different findings run to run. A single quiet round is therefore weak evidence; multiple rounds sample the reviewer. But CR-local is only a **pre-push preview** of the cloud CodeRabbit that reviews the actual PR on push — and we never merge on a `CHANGES_REQUESTED`, so the cloud review is the authoritative CR gate. CR-local's job is to catch the cheap stuff before push, not to produce a stability proof a non-deterministic (and sometimes slow/timing-out) reviewer can't reliably give. The loop ends when EITHER:

1. **Minimum-rounds-met + last-round-clean (rule chosen 2026-06-23, replaces the former consecutive-clean floor).** Run a **minimum of M rounds**, then stop on the first round **at or after** the minimum that has **no apply-worthy findings** (0 findings, or stylistic-only `Aesthetic preference` / `Contradicts codebase pattern` with zero APPLY verdicts).
   - **M = 2** for a normal diff.
   - **M = 3** when the diff touches a security path (the canonical `agent-workflow.md § Red-Team Agent Trigger` set: `supabase/migrations/**`, `packages/db/src/**`, `apps/web/app/app/quiz/actions/**`, `apps/web/app/auth/**`, `apps/web/proxy.ts`, `docs/security.md`) — determined via `git diff origin/master...HEAD --name-only`. Fetch and verify the base first (see `agent-workflow.md` § "Always diff against `origin/master`, never the bare local `master`") — an unresolvable base must ABORT, never be read as "no paths matched".
   - An APPLY finding does **NOT reset a consecutive-clean counter** — it **extends the loop by one round** (fix the finding, then run one more round to confirm the fix surfaced nothing new). Rounds count cumulatively toward M; you simply cannot stop *on* a round that still carries an APPLY verdict, and cannot stop *before* round M.
   - Every round runs with `-c .coderabbit.yaml`. The cloud CodeRabbit review on the pushed PR stays the strict authoritative gate regardless of how many local rounds ran.
2. **4 fixup commits driven by CR local** on the current branch (= 4 fix rounds, under one-fixup-commit-per-round — see DO below) — a hard ceiling that caps total effort even if the floor is unmet; escalate to user judgment rather than looping further.

## Handling Results

### DO
- Run via `/crlocal` slash command — never call `coderabbit review` ad hoc; the command embeds the protocol.
- **Always pass `-c .coderabbit.yaml`.** Both the hosted PR bot AND the CLI auto-load the repo-root config — confirmed by behavioral A/B 2026-06-18 (CLI 0.6.1): a fixture violating `actions.ts` path_instructions was flagged identically with and without `-c` (see `reference-crlocal-cli-vs-cloud` memory). So `-c` is **cheap redundancy, not a necessity** — keep it as belt-and-suspenders: it makes the config explicit and is robust if a future CLI version changes auto-load behavior. Omit only if the file is absent. (Especially relevant post-Forgejo-migration, where the PR bot is gone and the CLI is the only CodeRabbit — the experiment confirms the CLI honors `.coderabbit.yaml` off-platform with no extra wiring.)
- **Honor the minimum-rounds rule** (Stop Conditions §1): run at least M rounds (M=2 normal / 3 security-path), then stop on the first round at/after M with no apply-worthy findings. An APPLY verdict extends the loop by one round (fix + re-run); it does NOT reset to zero. Cloud CR on the pushed PR is the authoritative gate.
- **Verify the factual premise of every finding against source before triaging — see § Verify Before
  Acting.** CR's labels AND its assertions are LLM-generated, not authoritative. A finding that
  asserts what the code does is a hypothesis; confirm it, then triage. Two findings in a single
  round on `content/vfr-rt-part3` were outright false.
- Collect ALL APPLY-verdict findings of a round into ONE fixup commit per round (`agent-workflow.md § PR Batching`, user directive 2026-07-02) — never per-finding commits; each extra commit re-triggers the review cycle.
- Report a per-round summary table (file:line / severity / class / verdict / why) to the user before re-running.
- Re-run the review after each fix commit — fixes can surface new findings that weren't visible before.
- For DEFER verdicts, file a GitHub Issue with the CR comment context (severity, file, line, suggestion).
- Stop the loop the moment a stop condition trips (≥ M rounds run AND the latest round has no apply-worthy findings, or the 4-fix ceiling hit) — but NOT before round M; report the running round count each round (e.g. "round 2/2 min, last round clean → stop") and tell the user which condition tripped.
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

Examples of patterns CR local caught that our internal agents missed — an open list; add as new
ones surface.

1. **Service-role cleanup discarding `.select('id')` result.** §5 requires logging on
   `data?.length > 0` even where zero rows is valid.
2. **Cast `as unknown as T` without runtime guard.** §5 requires pairing with `Array.isArray`/`typeof`.
3. **Silent failure paths on cleanup.** `.update(...)` without `{ error }` destructure in afterEach.
4. **`.clear()` of an in-memory ID set unreachable on cleanup throw.** Needs try/finally.
5. **Helper functions defined inside a `for`-loop iteration.** Hoist out, pass as parameter.

6. **CR flags a Postgres guard as "missing" without tracing the supersession chain** (EVERY form —
   an OPEN set enumerated in `agent-workflow.md`). CR reads one migration in isolation. Trace to the
   LATEST definition FOR THE MATCHING SIGNATURE before accepting. Also: `packages/db/migrations/` is
   **FROZEN since 2026-07-11** and carries false history — when CR cites a path there, re-check the
   claim against `supabase/migrations/`, the sole source of truth.

7. **CR proposes a fix that CONTRADICTS a documented project rule or decision — verify before
   applying.** Check against `code-style.md` / `security.md` / the relevant `agent-*.md` before
   applying ANY suggestion that removes a guard or relocates a value. Applies equally to cloud CR.
   **The contradicting decision is not always in a rule file — read the code's own comment block.**
   An in-file comment naming the hazard IS a documented decision; a clean rules grep is not evidence
   that a change is unconstrained. **For any CSS layout/sizing suggestion, MEASURE — do not reason
   about the cascade.** Serve a minimal repro over localhost and use `getBoundingClientRect`
   (`file://` is refused by the browser tooling). Reasoning alone cleared a change that collapsed an
   input from 116.8px to 19.0px.

8. **CR can fabricate a finding describing a construct that does not exist** — a duplicate
   declaration, a phantom import, a non-existent call site — at ANY severity, from either delivery
   mechanism. Before acting on a claimed SYNTAX or TYPE error, grep for the construct and check
   whether `tsc` is green on that exact head — but only under a config that INCLUDES the file.
   `apps/web/tsconfig.json` excludes the integration tests; `apps/web/e2e/**` is covered by NO
   config, so green proves nothing there; `apps/web/scripts/**` is covered by `tsconfig.scripts.json`
   but not every script passes `<Database>` to `createClient` (derive which do:
   `grep -rl 'createClient<' apps/web/scripts/`), so structural errors are caught and schema ones
   are not.
   A green test SUITE proves nothing unless some test actually loads the file.
   **The mirror image is also on record: CR asserting the ABSENCE of a guard that exists.** So
   "absence is proof" cuts both ways — when CR says something is MISSING, grep for it first.
   Severity is NOT predictive: on PR #1124 the single Critical was fabricated while both Majors and
   the Minor were real.

9. **A CR suggestion that sets a DISPOSITION is the highest-risk class to adopt verbatim — diff it
   against 2-3 existing implementations first.** A *disposition* is the behavioural policy a fix
   encodes: return-on-error strategy, fallback value, validation posture, retry-vs-fail. CR sees
   only the diff, never the convention, so it proposes a locally-plausible policy that can invert
   the codebase's. Distinct from #7: there is often no written rule at all, only a sibling pattern,
   so a rules grep comes back clean. Find the 2-3 nearest implementations of the same operation
   (same data shape, same consumer kind), read what they DO on the bad-input path, and apply the
   codebase's disposition — recording the divergence in the CR reply. Getting the guard's SHAPE
   right while inverting its BEHAVIOUR still reads as "matches existing pattern" in a plan.
