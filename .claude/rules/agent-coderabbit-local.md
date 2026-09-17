# Agent Rules — coderabbit-local (external CLI)

> External LLM reviewer (`coderabbit review --committed --base origin/master -c .coderabbit.yaml`) | Trigger: ROUND 1 of the pre-push review gate, once per branch | Non-blocking

## Purpose
CodeRabbit local CLI runs the same review engine as the PR bot, against the branch diff before push. Catches: observability gaps on `.select('id')` chains, runtime guard omissions on RPC casts, cleanup ordering, helper hoisting, error-path consistency.

Runtime: `/crlocal`. This file is binding.

## Trigger Conditions
- **In the gate:** CR-local is a member of ROUND 1 ONLY (Decision 74), on the same branch diff as the other reviewers. Rounds 2+ are code-reviewer + semantic-reviewer. It has no loop of its own: its findings enter the round's ONE pooled triage table and are fixed in the round's ONE pooled fixup commit.
- **Mid-development (escape hatch, OUTSIDE the gate):** run `/crlocal` alone for early signal — a single commit added 200+ LOC, or you want a read before continuing. Nothing in the gate depends on it; the gate still runs every round in full.
- **Skip if:** `which coderabbit` returns nothing — install via `https://docs.coderabbit.ai/cli/`. **Version-gate too:** `--committed`/default-plain flags need CLI **≥ 0.7.0** (0.6.x used `--type committed`/`--plain`); confirm `coderabbit --version` before running, or use the 0.6.x flag spelling.

Do NOT run it after every commit — a commit triggers nothing.

## Apply-vs-Defer

The triage table below decides class; verdict is bound by `agent-workflow.md § Apply-vs-Defer Discipline`. **Default to APPLY.** DEFER needs ALL three: ≥30 LOC, separate concern, a design decision the PR doesn't establish. Two budgets bind, both checked before push:
- **VOLUME** — 0-2 deferrals per PR; 3+ means re-triaging every survivor and naming them in the push summary.
- **RATIO** — `filed > 0 AND filed >= closed` (every issue the branch author created after the merge-base, whatever its origin) → re-triage, or claim first-illumination or a `red-team-gap` justification (each naming the vector ID or spec path it covers) in the PR's `## Deferred` section. A PR whose filings are ALL red-team gaps passes; mixed with ordinary deferrals, judged on the ordinary ones alone.

## Verify Before Acting — MANDATORY GATE

A CodeRabbit finding is a HYPOTHESIS, never an observation. CR sees only a diff — it does not trace
a `CREATE OR REPLACE` chain, does not know which directories are frozen, and often reasons from a
superseded definition. Confirm the factual premise against source before ANY edit, including
"obviously right" ones (same defect class as an unverified comment, `code-style.md` §10 — worse,
since the finding arrives pre-argued and reads as already-checked).

### Which claims REQUIRE source verification (not optional, not "if unsure")

| Claim shape | Required check |
|---|---|
| "function X does / does not do Y" | Trace to the LATEST definition — EVERY supersession form (an OPEN set, enumerated in `agent-workflow.md`), sorted by timestamp prefix, and for the MATCHING SIGNATURE — an overloaded function has a different body per argument list. Never the first match. |
| "file X writes / reads column Y" | `grep` the column in that file. Absence is proof; do not infer from the filename. |
| "constraint / index / policy Z enforces W" | Read the constraint body. Which constraint carries a rule is frequently NOT the one its name suggests. |
| "this is a type error" / "this is a syntax error" | Run a **scoped** type-check that actually INCLUDES the file (see `agent-workflow.md § Plan Validation`). A green `tsc` from a config that excludes the path proves nothing. |
| "cite X instead" | Verify X exists AND is current. CR has proposed citing `packages/db/migrations/`, which is FROZEN and carries false history. |
| A count, total, line number, or an EXTENT quantifier (`most`, `every`, `neither`) | Recompute the count; establish the extent against a case that could falsify it (`code-style.md` §10 cl.7). Line numbers drift; prefer citing a grep-able predicate. |

### Which may be applied on the strength of a green test

Purely mechanical edits where a wrong value fails immediately — literal-to-constant, a rename, a
comment relocation. The test IS the check. **A behaviour change is never in this class:** pair it
with a mutation test (break the mechanism, confirm exactly the intended test goes red) before
committing.

## Finding Classification (read source, do not trust labels)

Severity labels (`trivial`, `minor`, `major`, `critical`, `nitpick`, `potential_issue`) are advisory — verify against the actual code.

| Class | What it looks like | Verdict |
|---|---|---|
| **Real safety** | Missing error path, missing runtime guard on `as unknown as T` cast, unhandled rejection, race condition, leak, silent zero-row no-op | **APPLY** |
| **Project rule alignment** | Violates a rule in `code-style.md` or `security.md` (e.g. §5 mutation `{ error }` destructure, §5 cast guard pairing, §10 audit-event subquery soft-delete filter) | **APPLY** |
| **Readability that aids a future reader** | Helper hoisted out of a loop, name clarifies a non-obvious branch, comment explains a hidden invariant | **APPLY if < 10 lines** |
| **Aesthetic preference** | Pure style choice with no observable behaviour change; prefers a different but equivalent shape | **SKIP with reason** |
| **Contradicts the codebase pattern** | Suggestion would diverge from how 5+ similar files do the same thing (codebase consistency wins) | **SKIP with reason** |
| **Scope expansion** | "While you're here, also rewrite X" — outside the PR's purpose | **DEFER to GitHub Issue** |

## Where the Loop Stops

CodeRabbit does not converge; cloud CodeRabbit on the pushed PR is the authoritative gate (never
merge on `CHANGES_REQUESTED`). CR-local catches the cheap stuff pre-push.

The gate's round discipline is the only one that applies — stop on the first round with no
APPLY-worthy finding, ceiling 3 rounds (`agent-critic.md § Loop Round Discipline`). CR-local's own
findings are APPLY-worthy on the same terms as any other reviewer's: 0 findings, or stylistic-only
`Aesthetic preference` / `Contradicts codebase pattern` with zero APPLY verdicts, leaves the round
clean from CR-local's side. Round 1 runs with `-c .coderabbit.yaml`; cloud CR on the push stays
authoritative regardless of round count.

## Handling Results

### DO
- Run via `/crlocal` — never call `coderabbit review` ad hoc.
- Always pass `-c .coderabbit.yaml` (belt-and-suspenders; omit only if the file is absent).
- Verify the factual premise of every finding against source before triaging (§ Verify Before Acting).
- Pool CR-local's APPLY-verdict findings with every other reviewer's into the round's ONE fixup commit (`agent-workflow.md § PR Batching`) — never a CR-local-only commit, never per-finding commits.
- Report a per-round CR-local triage table (file:line / severity / class / verdict / why) into the round's pooled triage.
- Keep round 1's triage table until the branch's learner run — that run is the ONLY place a CR-local finding is counted toward rule promotion (`agent-learner.md`).
- For DEFER, file a GitHub Issue with the CR comment context.
- Treat `nitpick`/`trivial` findings with the same source-reading rigour as `potential_issue`/`major`.
- When SKIPPING, give a concrete reason.

### NEVER
- Trust CodeRabbit's severity label as a triage shortcut — read the code.
- Apply every finding to make CodeRabbit silent — refactor-induced bugs creep in.
- Skip a finding as "just a nit" — `nitpick`/`trivial` findings have been genuine rule violations.
- Run CR-local in any round but round 1 — escalate to the user instead.
- Bypass the skip-with-reason requirement — every skip needs a one-line rationale.
- Run CR local as a pre-push git hook (too slow, needs orchestrator judgment, invites `--no-verify`) — it runs inside the gate.
- Defer something < 10 lines and clearly in scope — DEFER needs all three: ≥30 LOC, separate concern, design decision (`agent-workflow.md § Apply-vs-Defer Discipline`).

## Common Pitfalls Observed

Patterns CR local caught that our internal agents missed — an open list; add as new ones surface.

1. **Service-role cleanup discarding `.select('id')` result.** §5 requires logging on
   `data?.length > 0` even where zero rows is valid.
2. **Cast `as unknown as T` without runtime guard.** §5 requires pairing with `Array.isArray`/`typeof`.
3. **Silent failure paths on cleanup.** `.update(...)` without `{ error }` destructure in afterEach.
4. **`.clear()` of an in-memory ID set unreachable on cleanup throw.** Needs try/finally.
5. **Helper functions defined inside a `for`-loop iteration.** Hoist out, pass as parameter.
6. **CR flags a Postgres guard "missing" without tracing the supersession chain** (EVERY form,
   `agent-workflow.md`). Trace to the LATEST definition for the MATCHING SIGNATURE.
   `packages/db/migrations/` is FROZEN with false history — recheck against `supabase/migrations/`.
7. **CR proposes a fix CONTRADICTING a documented rule/decision — verify first.** Check
   `code-style.md`/`security.md`/`agent-*.md` before applying any guard-removing or
   value-relocating suggestion (cloud CR too). The contradiction may live in a code comment, not a
   rules file. For CSS layout/sizing, MEASURE (localhost repro + `getBoundingClientRect`), don't
   reason about the cascade.
8. **CR can fabricate a construct that doesn't exist** — duplicate declaration, phantom import,
   non-existent call site, any severity. Before acting on a claimed SYNTAX/TYPE error, grep for the
   construct and check `tsc` is green under a config that INCLUDES the file (`apps/web/tsconfig.json`
   excludes integration tests; `apps/web/e2e/**` has no config; `apps/web/scripts/**` uses
   `tsconfig.scripts.json` but not every script passes `<Database>` — derive via
   `grep -rlE 'createClient<\s*Database' apps/web/scripts/`). A green suite proves nothing unless a
   test loads the file. Mirror risk: CR can also assert ABSENCE of a guard that exists — grep either way.
   **And a referent OUTSIDE repo-grep visibility** — an issue or PR number, a ticket, a dashboard.
   CR reads the repository, so it may call a live `#1026` "unsupported" or "stale". Watch the
   FRAMING, not just the word "exist", and resolve it in the right namespace: `gh issue view <N>`,
   `gh pr view <N>` — confirming the referent exists AND that its subject matches the citation.
9. **A CR DISPOSITION suggestion is highest-risk to adopt verbatim — diff against 2-3 existing
   implementations first.** Disposition = the behavioural policy a fix encodes (return-on-error,
   fallback value, validation posture, retry-vs-fail); CR sees only the diff, not the convention,
   and can invert the codebase's. Find 2-3 nearest same-operation implementations, match their
   disposition, record any divergence in the CR reply.
