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
- Read the source for every finding before triaging — CR's labels are LLM-generated, not authoritative.
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

These are the patterns CR local caught that our internal agents missed (#1–5 first surfaced on PR #108, 2026-05-07). Update this list as new ones surface.

1. **Service-role cleanup discarding `.select('id')` result.** code-style.md §5 explicitly requires logging on `data?.length > 0` even for cleanup-context where zero rows is valid. Internal agents read `.select('id')` is present and stop there.
2. **Cast `as unknown as T` without runtime guard.** code-style.md §5 requires pairing the cast with `Array.isArray`/`typeof` checks. Internal agents accept the cast as type assertion.
3. **Silent failure paths on cleanup.** `await admin.from(...).update(...).eq(...)` without `{ error }` destructure in afterEach blocks. Same pattern as the §5 mutation rule but in test infrastructure.
4. **`.clear()` of in-memory ID set unreachable on cleanup throw.** Need try/finally so state resets on both success and error paths, otherwise next afterEach masks its own state.
5. **Helper functions defined inside `for`-loop iteration.** Closures over loop-scoped vars + harder to scan. Move out, accept as parameter.
6. **CR-local flags a Postgres guard/branch as "missing" without tracing the `CREATE OR REPLACE FUNCTION` chain.** CR reads one migration in isolation and never traces forward to where the guard was added or last redefined. Before accepting any such finding, trace the chain to the LATEST definition (the same "Pre-Flag Verification" rule our internal agents follow in `agent-critic.md` / `semantic-reviewer.md` / `implementation-critic.md` / `plan-critic.md` — but CR-local is external and does not apply it, so the orchestrator must). Also: the old two-dir migration mirror (`packages/db/NNN_*` ≡ `supabase/timestamp_*`) is **DEAD — `packages/db/migrations/` was frozen 2026-07-11** (it stopped mirroring, and some files were edited post-deploy, showing false history; see its README). `supabase/migrations/` is the sole source of truth, and docs use the supabase timestamp convention. When CR cites a `packages/db/migrations/` path, answer by re-checking the claim against `supabase/migrations/` — never against the frozen dir. Both validated as false positives on PR #750 (`start_exam_session` guard claimed missing; the AJ red-team-vector migration ref claimed "should be 044").
7. **CR-local — or cloud CR — proposes a fix that CONTRADICTS a documented project rule/decision — verify the rule before applying.** This is the inverse of #1–5: not a real gap CR caught, but a wrong suggestion to REJECT (skip-with-reason). The recurring instances: CR suggested adding `correct_count` at question-level (contradicts the row-level-only scoring decision) ×2; CR suggested switching a dependent cleanup step from a gated `if (errors.length === 0)` to "always attempt both teardowns" (contradicts `code-style.md §7` — the dependent-step gate prevents a failed prerequisite from running a later step that deletes an FK parent of the earlier step's rows, masking the real error or triggering a 23503 cascade). KEEP the `errors.length === 0` gate when the later step is FK-dependent; add only sentinel-presence guards (`if (refs)`) for the mid-`beforeAll`-failure case. Before applying ANY CR suggestion that removes a guard or relocates a value, check it against `code-style.md` / `security.md` / the relevant `agent-*.md` decision. (Promoted count=3, 2026-06-24 — VFR RT Phase 4 §7 cleanup-gate instance + 2 prior `correct_count`-placement instances. Broadened to cloud CR at count=5, 2026-07-03 (the learner tracker's authoritative count — a 4th instance, a test-assertion-contradiction, landed after the 2026-06-24 promotion; this cloud-CR case is the 5th): the discipline applies equally to cloud-CodeRabbit findings triaged via `/replycoderabbit`, not only CR-local CLI rounds — the first CLOUD-CR instance was a suggested array-index React `key` that violates Biome `noArrayIndexKey`, correctly skipped [#1061].)
8. **CodeRabbit can fabricate a finding describing a code construct that does not exist in the source** — a duplicate declaration, a phantom import, a non-existent call site — at ANY severity label and from EITHER delivery mechanism (CR-local CLI or cloud CR). Before acting on any finding that asserts a **syntax or type error**, grep for the construct and check whether the type-checker and the RELEVANT tests are already green on that exact head: a green `tsc` disproves a claimed redeclaration or type error, which is a faster and more certain disproof than reasoning about the code — but only for a project configuration that actually INCLUDES the reported file. The same scoping caveat applies to test evidence, and more weakly: a green suite is only supporting evidence, and only if some test actually imports or exercises the reported file. A suite that never loads the file is green no matter what the file contains, so "the tests pass" alone disproves nothing — `tsc` under a config that includes the file is the load-bearing check. This repo splits them: `apps/web/tsconfig.json` excludes the integration tests that `apps/web/tsconfig.integration.json` covers — and NEITHER config covers `apps/web/e2e/**` or `apps/web/scripts/**`, so for a file under those a green `tsc` from either config proves nothing at all, so confirm the file is in scope of the config you ran before treating green as a disproof. Promoted at count=2, different commits AND different mechanisms:
   - 2026-07-13 — CR-**local** CLI on `bcaf1c0e`: hallucinated a duplicate declaration.
   - 2026-08-07 — **cloud** CR on PR #1124: claimed `let resolveFlags` was declared twice in one scope in `use-session-bootstrap.test.ts`. Only 3 references exist in the file, all inside one `it()` block, one declaration. It was labelled 🔴 Critical — the PR's ONLY Critical — while `tsc` and the full suite were green on that exact head, which a real block-scoped redeclaration cannot be.

   Sharp lesson from PR #1124: severity was **not predictive** of correctness — the single Critical was fabricated while both Majors and the one Minor were real and worth applying. This extends #1–7's "read source, don't trust labels" guidance with a distinct and cheaper disproof: the described construct may be entirely absent.

9. **A CR suggestion that sets a DISPOSITION is the highest-risk class to adopt verbatim — diff it against 2–3 existing implementations of the same operation before applying.** A *disposition* is the behavioural policy a fix encodes: return-on-error strategy (reject the whole payload vs skip the bad element), fallback value, validation posture, retry-vs-fail. CR sees only the diff, never the surrounding convention, so it proposes a locally-plausible policy that can invert the codebase's. This is distinct from #7 (suggestion contradicts a documented *rule*) — here there is often no written rule at all, only an established pattern in sibling code, so a rules grep comes back clean and the divergence passes review.

   Procedure: find the 2–3 nearest implementations of the same operation (same data shape, same consumer kind — not merely the same file), read what they DO on the bad-input path, and if the suggestion differs, apply the codebase's disposition and record the divergence in the CR reply. Getting the guard's *shape* right while inverting its *behaviour* still reads as "matches existing pattern" in a plan, which is how it survives validation.

   Promoted at count=3 (2026-08-11, PR #1185, learner tracker). Latest instance: CR proposed "return `[]` if any row is invalid" for a per-row guard on `get_question_counts`. All three existing per-row guards — `app/app/quiz/actions/lookup.ts:150-151`, `lib/queries/study-queries.ts:91-96`, `lib/queries/quiz-session-queries.ts:48-51` — skip the bad row and keep the rest. Adopting CR's version would have blanked the entire subject/topic/subtopic picker on one drifted row, because every consumer ends in `.filter(s => s.questionCount > 0)`. Two plan-critic rounds passed before a critic caught it; the plan had already cited those three siblings as its prior art while implementing the opposite behaviour.

---

*Last updated: 2026-08-11 (added Common Pitfall #9 — a CR suggestion that sets a DISPOSITION must be diffed against 2-3 existing implementations before adopting; count=3, PR #1185. Prior: 2026-08-08 Pitfall #8 — fabricated syntax/type-error findings, count=2, #1124.)*
