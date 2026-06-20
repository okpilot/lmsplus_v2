# Learner Agent — Memory

> Cross-agent pattern synthesis + false-positive frequency tracking.
> Governed by `.claude/rules/agent-memory.md`. **Update rows IN PLACE — never append a dated session log.** History lives in git (`git log -p -- .claude/agent-memory/learner/`).
> Migrated 2026-05-29 from the 6606-line append-only `patterns.md` journal. The pre-migration body is recoverable via git.

## Issue Frequency Tracker (live — count≥2)

Full record in `topics/tracker-archive.md`; journal in git at `2e87c3e6`. Schema: `Issue Type | Count | Last Seen | Status`. Terminal-state rows archived; active rows are terse stubs. Curations: 2026-06-07 (30 rows), 2026-06-10 (budget pass), 2026-06-10 (count=1 rows moved to archive-only per header spec).

| Issue Type | Count | Last Seen | Status |
|-----------|-------|-----------|--------|
| Test fixture shape mismatch (wrong/missing field in fixture object) | 2 | 2026-03-13 | RULE CANDIDATE — both caught pre-commit by type-check; … [full → topics/tracker-archive.md] |
| Bare `catch {}` without error-type narrowing | 2 | 2026-04-08 | RULE CANDIDATE → code-style.md §6 — swallowed redirect() from requireAdmin → 500; … [full → topics/tracker-archive.md] |
| Inconsistent guard between related RPCs (sibling missing guard) | 3 | 2026-06-14 | PROMOTED → security.md rule 12 + docs/security.md §11c (#859). (1)(2) 2026-03-14 auth.uid() + NULL-correct-option guards each added to one RPC, missed sibling; (3) PR #856 check_quiz_answer shipped as a verbatim copy of its weaker older body, missing 3 guards submit_quiz_answer had. Sweep found 4 legacy read-RPCs missing the active-user gate → #883. [full → topics/tracker-archive.md] |
| Partial fix applied to sibling file group (cross-cutting concern) | 11 | 2026-06-19 | RULE CANDIDATE (count 11, active) — fix applied to the instance seen, not all instances in file + siblings; … [full → topics/tracker-archive.md] |
| useTransition + manual loading state hybrid fragility | 2 | 2026-03-13 | RULE CANDIDATE — isPending + manual isLoading can both be false mid-fetch, flashing idle button; … [full → topics/tracker-archive.md] |
| Silent numeric fallback without observability logging | 2 | 2026-03-13 | RULE CANDIDATE — fallback to 0/min on empty/malformed data with no server signal; … [full → topics/tracker-archive.md] |
| Query missing student_id scope (returns wrong student's data) | 2 | 2026-03-15 | RULE CANDIDATE → security.md (propose on 3rd) — auth check ≠ ownership scoping; … [full → topics/tracker-archive.md] |
| UI event handler missing re-entry guard (double-fire) | 3 | 2026-06-20 | RULE CANDIDATE (count 3) — timer+click race on VFR RT Finish: isPending is async, submittedRef one-shot gate required. Propose §6/§3 note: async submit handlers with multiple triggers need synchronous useRef gate. [full → topics/tracker-archive.md] |
| UPDATE returning zero rows treated as success (silent no-op) | 2 | 2026-03-20 | RULE CANDIDATE → code-style.md §5 — ownership-scoped DELETE/UPDATE must `.select('id')` + check row count; … [full → topics/tracker-archive.md] |
| Error path in existing function untested (count-error branch) | 5 | 2026-06-10 | RULE CANDIDATE (count 5) — new edge/error branches added to existing tested files lack test updates in the same commit; … [full → topics/tracker-archive.md] |
| Derived value correct by coincidence (index used as count proxy) | 2 | 2026-03-13 | RULE CANDIDATE — value co-varies with metric but diverges on edge cases; … [full → topics/tracker-archive.md] |
| Auth callback guard ordering error (guards in wrong order → bypass) | 2 | 2026-03-17 | RULE CANDIDATE — session actions must precede existence/registration checks; … [full → topics/tracker-archive.md] |
| Supabase SELECT error swallowed in auth helper (distinct from mutation) | 3 | 2026-06-04 | RULE CANDIDATE → code-style.md §5 (extension) — auth-path + seed SELECTs must destructure `{ data, error }`. … [full → topics/tracker-archive.md] |
| Zod error message pinned to exact internal text | 2 | 2026-03-16 | RULE CANDIDATE — Zod internal messages aren't public API; … [full → topics/tracker-archive.md] |
| Missing `setSubmitting(true)` before async call in form/button handler | 2 | 2026-04-27 | RULE CANDIDATE → code-style.md (on 3rd) — set loading state before awaiting, not after; … [full → topics/tracker-archive.md] |
| Idempotent RPC returns hardcoded values instead of reading DB state | 2 | 2026-04-27 | RULE CANDIDATE — replay paths returned hardcoded pass/100% instead of querying config; … [full → topics/tracker-archive.md] |
| Code-reviewer flags file outside the commit diff scope | 2 | 2026-04-08 | RULE CANDIDATE → agent-code-reviewer.md (false positive) — agent scans full file; … [full → topics/tracker-archive.md] |
| Pre-existing file-size violation surfaced when commit adds lines to over-limit file | 4 | 2026-06-14 | RULE CANDIDATE — file at/over limit must be split in the same additive commit, not deferred; … [full → topics/tracker-archive.md] |
| Function exceeding 30-line limit in Server Action file | 3 | 2026-04-10 | RULE CANDIDATE (count 3) → code-style.md §3 — extract row-transform/business logic as named `mapXxxRow()` helper; … [full → topics/tracker-archive.md] |
| ZodError escaping Server Action via parse() without try/catch or safeParse | 2 | 2026-03-26 | RULE CANDIDATE → code-style.md — use `Schema.safeParse()` (or wrap `.parse()` in try/catch); … [full → topics/tracker-archive.md] |
| Hardcoded constant values in tests instead of importing source constants | 3 | 2026-05-29 | RULE CANDIDATE → test-writer/MEMORY.md — import production constants, never duplicate literal values that drift on rename; … [full → topics/tracker-archive.md] |
| CodeRabbit false-positive rate elevated on exam-mode PRs | 2 | 2026-04-14 | RULE CANDIDATE → .coderabbit.yaml — CR lacks project context (hard-delete exceptions, DB-level constraints); … [full → topics/tracker-archive.md] |
| Manual-eval bug invisible to unit tests (dual-source UI only in full app) | 2 | 2026-04-28 | RULE CANDIDATE → code-style.md §7 (extends Refresh/Reload) — dual server+client surfaces need an integration/E2E test; … [full → topics/tracker-archive.md] |
| Stale `why` annotations on test payloads after guard mechanism change | 2 | 2026-05-07 | RULE CANDIDATE (promotion deferred — same file/migration) — payloads.ts notes drift after guard change; … [full → topics/tracker-archive.md] |
| Server Action ERROR_MESSAGES not synced with new RPC `RAISE EXCEPTION` literals | 3 | 2026-06-19 | RULE CANDIDATE (count 3 — VFR RT Phase B cycle: semantic-reviewer caught incomplete token map on start/submit actions vs RPC RAISE set, different family from prior void-code occurrences); … [full → topics/tracker-archive.md] |
| Red-team spec-count prose drift across multiple doc surfaces (tech.md ×N + decisions.md) | 4 | 2026-06-14 | RULE CANDIDATE — numeric red-team spec counts go stale on every spec-addition batch; … [full → topics/tracker-archive.md] |
| Spec-doc literal counts drifting from distinct-count implementations | 2 | 2026-05-31 | RULE CANDIDATE — #673 fixtures return distinct-question count, yet spec claimed fixed literals; … [full → topics/tracker-archive.md] |
| Red-team RLS error-code assertions pinned to 42501 (instead of generic error non-null) | 2 | 2026-06-04 | RULE CANDIDATE (count 2) — orchestrator DEFERRED hard-rule promotion 2026-06-04. … [full → topics/tracker-archive.md] |
| CR-local false positives on Postgres CREATE OR REPLACE migration chain | 2 | 2026-06-05 | RULE CANDIDATE → agent-coderabbit-local.md — CR reads one mig in isolation, misses forward chain. … [full → topics/tracker-archive.md] |
| Doc residual-vector claims missing DB-level constraint that exists (symmetric drift) | 2 | 2026-06-05 | RULE CANDIDATE — grep migrations for unique constraints before asserting absence in known-gap vector doc. … [full → topics/tracker-archive.md] |
| Migration added to packages/db/migrations but not supabase/migrations (or vice versa) | 2 | 2026-06-05 | RULE CANDIDATE — mig 084 shipped to packages/db only; already in supabase/migrations same cycle. … [full → topics/tracker-archive.md] |
| ON CONFLICT clause with no supporting UNIQUE constraint (dead code or 42P10 at execution) | 2 | 2026-06-06 | RULE CANDIDATE — (1) student_responses a09c6be: ON CONFLICT silently ignored (non-unique index); … [full → topics/tracker-archive.md] |
| plpgsql function body contains deferred-validation SQL (clean migration apply ≠ execution correctness) | 2 | 2026-06-10 | RULE CANDIDATE — (1) mig 085 ON CONFLICT non-unique → 42P10; (2) mig 101 POSIX regex bracket-class → 2201B. … [full → topics/tracker-archive.md] |
| Semantic reviewer stale-baseline false positive (compared wrong predecessor migration/definition) | 2 | 2026-06-06 | RULE CANDIDATE — reviewer compared against wrong migration; … [full → topics/tracker-archive.md] |
| Stale local Supabase volume / in-place migration edit causing local e2e failures | 2 | 2026-06-10 | RULE CANDIDATE — `supabase db reset` fixes both — but wipes E2E seed; re-run `seed-e2e.ts` after. … [full → topics/tracker-archive.md] |
| Haiku code-reviewer false positives on Playwright E2E spec complexity (#611 cycle) | 2 | 2026-06-05 | RULE CANDIDATE (elevated FP rate on E2E scope); … [full → topics/tracker-archive.md] |
| Query helper promoted to throw on error, but SA caller missing catch boundary | 2 | 2026-06-01 | RULE CANDIDATE — #627 (c26ef61f + b7cf6852): throw-posture sweep missed SA callers. … [full → topics/tracker-archive.md] |
| Red-team spec field-type assertion without nullability check across RPC modes | 2 | 2026-06-06 | RULE CANDIDATE — agent assumes RPC field type/shape without reading the migration; … [full → topics/tracker-archive.md] |
| Red-team RPC output-contract assertions under-asserted (positive paths assert existence but not field values) | 4 | 2026-06-13 | RULE CANDIDATE (count 4 — codified via PR-G/#742 §7 "RPC Output Contract") — #736, #557, PR-A #256/#257, #818. POSITIVE SIGNAL #869 (2026-06-19): two-fixture design applied on first pass, zero rework — rule is being followed proactively. … [full → topics/tracker-archive.md] |
| Shared test-infra helpers (setup.ts, helpers/*.ts) exceed 200-line utility cap (wrongly under .test.ts exemption) | 2 | 2026-06-06 | RULE CANDIDATE — setup.ts/helpers/*.ts are utility files (200-line cap), not test files (500-line exemption). … [full → topics/tracker-archive.md] |
| Red-team spec self-labels vector mnemonic colliding with existing matrix ID | 3 | 2026-06-09 | RULE CANDIDATE (count 3) — ID collision ×3: #793, #802, #326. Root: not reading WORKING-TREE master before allocating. … [full → topics/tracker-archive.md] |
| Test cleanup: throw inside finally block / multi-block afterAll without error accumulator (noUnsafeFinally) | 3 | 2026-06-14 | PROMOTED → code-style.md §7 "Multi-Step Cleanup Needs a Per-Step Error Accumulator" (#794). The accumulator half is now a hard rule; the throw-in-finally half stays Biome-enforced (noUnsafeFinally), not duplicated. Sweep done: 4 e2e offenders fixed (consent/exam-recovery/settings/exam-config-reactivation-guard); 3 already compliant. (1) 64339b28; (2) 4f918ded; (3) 13fa0249. … [full → topics/tracker-archive.md] |
| Integration-test count in plan.md goes stale on each test-adding commit | 4 | 2026-06-11 | RULE CANDIDATE (count 4) — (1) 115→121; (2) 121→125; (3) 125→127; (4) 127→136 (#833/#840 cycle): impl-critic used static `grep 'it('` count (121) as baseline instead of vitest runtime count (144 after +8), generating a false ISSUE. Root: static grep is not the count convention; vitest runtime is authoritative. False-positive logged to archive. Update plan.md count in the same commit as the test files. … [full → topics/tracker-archive.md] |
| Identical type union declared in N Server Action files instead of extracted to lib/ | 2 | 2026-06-07 | WATCHING (count 2) — QuestionFilter + ActionResult both required retroactive sweeps. On 3rd: propose code-style.md §4 rule. … [full → topics/tracker-archive.md] |
| CR local suggests wrong fix rejected on a documented architectural decision | 2 | 2026-06-10 | RULE CANDIDATE — (1) VFR RT Phase A: CR suggested question-level correct_count, contradicts row-level decision; (2) #838 cycle: same suggestion re-raised. On 3rd: propose .coderabbit.yaml path-scope context note. … [full → topics/tracker-archive.md] |
| Test-writer agent generates cleanup/restore mutation without `{ error }` destructure | 2 | 2026-06-10 | RULE CANDIDATE — (1) 13fa0249; (2) 50c81b94 (#838). Finally-block cleanup path not covered by §5 in agent-generated code. Propose note to test-writer/MEMORY.md. … [full → topics/tracker-archive.md] |
| `as unknown as T` cast without runtime guard in test helper / integration test (§5) | 2 | 2026-06-13 | RULE CANDIDATE — (1) #818 `expectWithinTimeSubmitContract` helper (impl-critic); (2) #845 `AnswerRow[]` cast in integration test (semantic-reviewer). §5 rule already mandates guard pairing but test files treated as exempt. Propose note to code-style.md §5: "§5 cast-guard applies equally to test helpers and integration test assertions — test files are not exempt." … [full → topics/tracker-archive.md] |
| Vitest passes / tsc fails on test file (esbuild strips types, tsc strict-mode catches) | 2 | 2026-06-14 | RULE CANDIDATE — (1) archive row 353: subagent ran `pnpm test` but not `pnpm check-types`; type error merged (#789, 60047c2c). (2) #533 cycle: test-writer added a prop (`isExam`) absent from the test helper's `Required<>` type; vitest passed at runtime (esbuild transpiles, strips types), pre-commit tsc caught the failure. Root: Vitest/esbuild transpiles and runs without type-checking; tsc in strict mode is the only gate that catches shape mismatches in test files. Propose addition to agent-workflow.md delegation template DONE WHEN: "BOTH `pnpm test` (vitest green) AND `pnpm check-types` (tsc clean) must pass — they are distinct gates." … [full → topics/tracker-archive.md] |
| Doc-updater agent fabricates plausible-but-wrong claims without reading source (hallucination) | 2 | 2026-06-14 | RULE CANDIDATE — (1) archive row 333: migration docs written from task summary without reading SQL body — 3 inaccuracies (fabricated trigger exemption, inverted guard order, wrong error string); (2) #863 batch: agent claimed a non-existent integration test file path + asserted a plan.md feature that wasn't implemented. Root: agent writes from context summary, not from verified filesystem/file contents. Propose note to agent-doc-updater.md DO: "Before asserting that a file exists or that a feature appears in plan.md, verify against the filesystem (`ls` or Read) — do not rely on chat context or task description." [full → topics/tracker-archive.md] |
| Test comment restating/paraphrasing the it() title (§7 enforcement gap) | 2 | 2026-06-14 | RULE CANDIDATE — (1) 85d5de06 (2026-05-25): progress.test.ts 7 paraphrase-comments; CR caught post-merge; (2) #890 (2026-06-14): answer-options.test.tsx + quiz-key-actions.test.ts; CR-local + cloud CR caught. Rule already in code-style.md §7; this is an authoring-time enforcement gap. Action: propose note to test-writer/MEMORY.md — "omit any comment above an it() that paraphrases the title." No code-style.md change needed. [full → topics/tracker-archive.md] |
| DB/caller-supplied value interpolated into HTML/SVG/XML template string without escaping | 2 | 2026-06-19 | RULE CANDIDATE → code-style.md §5 — (1) #890: eval seed SVG template, unescaped params, `escapeSvgAttr()` fix; (2) #901: email HTML template, DB values unescaped, `esc()` fix. Rule: escape all caller-supplied params at interpolation site. [full → topics/tracker-archive.md] |
| Raw internal/third-party error.message exposed through exported result type | 2 | 2026-06-19 | RULE CANDIDATE → code-style.md §5 extension — (1) 2026-03-12 Supabase error.message to student UI; (2) #901 Resend SDK error.message via `SendEmailResult.error: string` → fixed (log raw, return `'send_failed'`). Extend §5 "Sanitize Error Messages" to cover all SDK/third-party sources, not just Postgres. [full → topics/tracker-archive.md] |
| Single-concern sequential test-infra helpers exceeding 30-line function cap | 3 | 2026-06-19 | RULE CANDIDATE (count 3) — (1) #844: seed helpers 33–35L; (2) #869: `submitAndReplay` 46L; (3) #902: `seedCode` 38L. All WARNING; all linear-flow, no branching. Proposed §3 exception: test-infra helpers (linear flow, no branching) exempt from 30-line cap; JSDoc `// Test infra: sequential DB seed` required. PROPOSED ONLY — apply alongside #903. [full → topics/tracker-archive.md] |

## Count=1 WATCHING rows

All count=1 WATCHING rows live in `topics/tracker-archive.md` only. Recent additions by cycle (detail in archive):
- #851: LLM-parse fail-open; CLAUDE.md pre-commit claim stale; RPC STABLE/VOLATILE clone annotation; pnpm audit advisory mid-run; stale in-file spec test-count.
- #860–#865: Shared-component a11y contract change broke un-mocked consumers; full-suite required to surface downstream regressions (targeted run misses cross-component breaks).
- #890: RPC change missed 3 co-update surfaces (database.md+COMMENT+types.ts); CR-local MAJOR safety catch all agents missed (NULL→LIMIT NULL); CR fix conflicts with Biome rule.
- #890 final: Doc-comment expansion at line cap; SVG-template escaping (PROMOTED to count=2 in this cycle).
- #842: Race test `data?.[0]` without toHaveLength; attack-surface.md gap-row stale.
- #825: Sub-vector 2-letter prefix collision (DR vs DB).
- #849: Plan citing superseded RLS policy; asymmetric afterAll var init.
- #902: admin_not_found (soft-deleted-admin) guard untested across all internal-exam RPC families (issue/void/start/record) — pre-existing gap filed as follow-up issue.
- #856 rebase: Rebased CREATE-OR-REPLACE migration header claims "VERBATIM, ONLY change is X" but body incorporates extra fixes (stale comment) — two occurrences on same PR/rebase = 1 distinct mechanism; count=1 WATCHING.
- #885/#886/#887: Code-reviewer WARNs on pre-existing over-limit files untouched by diff (FP — already suppressed in agent-code-reviewer.md); verbose inline comment at cap.
- #533: Loading-flag scope mismatch; full-suite vs targeted run; LoadingButton+icon during loading.
- #901: SA result `error: string` not a literal union (new — see count=1 table below).
- VFR RT Phase C (cb924697–1eb557c1): dead prop on dialog renderer; static inputId collision (useId); auth gate in auth-agnostic query helper; vacuous Array.every([]) bug (semantic-reviewer real bug); production query helper >60L structural exemption applied.

| Issue Type | Count | Last Seen | Status |
|-----------|-------|-----------|--------|
| Doc migration-range footer literal stale | 1 | 2026-06-10 | WATCHING [full → topics/tracker-archive.md] |
| SA result `error` typed `string` not closed literal union | 1 | 2026-06-19 | WATCHING [full → topics/tracker-archive.md] |
| Mode/role whitelist checked for rejection but not for admitted-value output sensitivity | 1 | 2026-06-10 | WATCHING [full → topics/tracker-archive.md] |
| Mechanism-pin suggestion applied then reversed next cycle (premature pin churn) | 1 | 2026-06-10 | WATCHING [full → topics/tracker-archive.md] |
| Stale in-file spec `// N tests` header after adding a test case | 1 | 2026-06-13 | WATCHING [full → topics/tracker-archive.md] |
| Plan cites superseded RLS policy (chain not traced forward) | 1 | 2026-06-13 | WATCHING [full → topics/tracker-archive.md] |
| Asymmetric afterAll guard-var initialization (victim lacks `''` init) | 1 | 2026-06-13 | WATCHING [full → topics/tracker-archive.md] |
| Code-reviewer flags pre-existing over-limit file with zero diff lines | 1 | 2026-06-14 | WATCHING [full → topics/tracker-archive.md] |
| Verbose inline comment pushes file over line cap | 1 | 2026-06-14 | WATCHING [full → topics/tracker-archive.md] |
| Rebased CREATE-OR-REPLACE migration header VERBATIM claim stale | 1 | 2026-06-19 | WATCHING [full → topics/tracker-archive.md] |
| Mode/enum widening misses hard-coded consumers (pre-plan miss, plan-critic catch) | 1 | 2026-06-19 | WATCHING [full → topics/tracker-archive.md] |
| Vacuous `Array.every([])` on empty answer list renders false correctness | 1 | 2026-06-20 | WATCHING — VFR RT Phase C 1eb557c1; guard with `length > 0`. [full → topics/tracker-archive.md] |
| Dead prop passed to renderer component (never consumed) | 1 | 2026-06-20 | WATCHING — VFR RT Phase C cb924697; impl-critic pre-commit. [full → topics/tracker-archive.md] |
| Static `inputId` string in reusable component (useId required) | 1 | 2026-06-20 | WATCHING — VFR RT Phase C cb924697; semantic-reviewer. [full → topics/tracker-archive.md] |
| Auth gate inside auth-agnostic query helper | 1 | 2026-06-20 | WATCHING — VFR RT Phase C 0f8bdb72; belongs at page/action level. [full → topics/tracker-archive.md] |
| Production query helper >60L with single-concern exemption (extraction deferred) | 1 | 2026-06-20 | WATCHING — getVfrRtResults 75L; warning non-blocking. [full → topics/tracker-archive.md] |

## Durable knowledge (cross-agent)

- This agent does cross-agent synthesis + owns **false-positive frequency tracking** — see `topics/cross-agent-lessons.md` for the FP catalog and the full rule-promotion record.
- A count reaches promotion threshold at **2 distinct mechanisms** across different commits; same-file/same-migration repeats are NOT distinct (several count=2 rows above are held below promotion for this reason — noted inline).
- On any rule promotion, schedule the **Sweep-On-Rule-Promotion** (`agent-learner.md`): fix or file issues for ALL existing offenders, not just the triggering sites (lesson from issue #573).
- The biggest recurring defect class is **partial fix to a sibling-file group** (tracker count 11) — always grep all instances of a pattern in the file AND sibling files before committing.
- *(Other bullets relocated to `topics/cross-agent-lessons.md` § Durable knowledge relocated 2026-06-07.)*

## Topic pointers

- [cross-agent-lessons](topics/cross-agent-lessons.md) — durable rule-promotion record, false-positive catalog, recurring meta-lessons.
- [tracker-archive](topics/tracker-archive.md) — full tracker record; original journal at git `2e87c3e6`. **Before adding a NEW row, grep this file first — if it exists, increment it and lift to live table.**
- [query-helper-throw-boundary](topics/query-helper-throw-boundary.md) — Server Actions must catch now-throwing query helpers at the client boundary; throw-posture safe for Server Components but crosses unsafe RPC boundary when SA returns output to client.
- [paginated-fetch-page-error-testing](topics/paginated-fetch-page-error-testing.md) — two valid test forms (real helper + mocked queries, vs. helper as dependency mock) for caller-level page-error recovery; promoted to code-style.md §7 (PR #699).
- [postgres-security-invoker-rls-pattern](topics/postgres-security-invoker-rls-pattern.md) — SECURITY INVOKER functions on RLS-protected tables return `error: null + data: []` on unauth calls (RLS gatekeeper, not GRANT denial); impl-critic false-positive suppression pattern.
