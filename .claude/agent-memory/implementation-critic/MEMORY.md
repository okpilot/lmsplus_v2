# Agent Memory — implementation-critic

> Reviews staged changes against the approved plan before commit.
> Durable recurring-deviation knowledge only. Per-commit narrative lives in `git log` and
> `topics/commit-notes.md`. **†** = full row detail there (§ row detail, by date).

## Recurring-deviation tracker

| Pattern | First | N | Last | Status (→ rule loc) |
|---|---|---|---|---|
| *(13 older RESOLVED / FALSE-POSITIVE / single-instance rows)* | — | — | ≤2026-07-23 | ARCHIVED → topics/tracker-archive.md § archived tracker rows 2026-08-18 |
| A fix moves a guard EARLIER but leaves the file's own contract/checklist comment asserting the old site | 2026-08-18 | 1 | 2026-08-18 | RESOLVED same commit — `import-vfr-rt-content.ts` pre-flight checklist. † |
| Gate keyed on a PARTIAL identity — `topic_code` alone where pool identity is `subject_code`+`topic_code` | 2026-08-18 | 1 | 2026-08-18 | RESOLVED same commit. No runtime effect today (single subject `RT`) — which is why it would rot. |
| Deriving `expected` through the SAME filter as the value under test — both go 0, so `expect(0).toBe(0)` passes and the corpus gate early-returns | 2026-08-18 | 1 | 2026-08-18 | RESOLVED — explicit `toBeGreaterThan(0)` anchor. |
| Zero-row no-op: UPDATE/DELETE missing `.select('id')` + `data?.length` check | 2026-04-10 | 6 | 2026-06-06 | PROMOTED → code-style §5. Prod AND test helpers. † |
| Memory delta written to the stray `apps/web/.claude/agent-memory/` (cwd was `apps/web`) | 2026-08-17 | 1 | 2026-08-17 | WATCHING. Same loss class as a stashed delta. † |
| Zero-row no-op, DISTINCT: `.select('id')` present but count logged only when `> 0` | 2026-08-11 | 1 | 2026-08-11 | WATCHING. If a prior SELECT proved N match, compare to N and THROW. † |
| Dead helper in test file → Biome `noUnusedVariables`/`noThenProperty` pre-commit fail | 2026-04-11 | 2 | 2026-05-27 | RULE CANDIDATE. Grep call sites of any large test helper. † |
| New test line copied from a sibling exceeds `lineWidth: 100` → format gate fails | 2026-08-17 | 1 | 2026-08-17 | WATCHING. `npx biome check <staged>` BEFORE commit — amend is forbidden after a hook failure. † |
| Error message refactor breaks paired test assertion regex | 2026-05-06 | 1 | 2026-05-06 | WATCHING. Grep tests for the old substring. † |
| Payload-group loop applied to fewer RPCs than the plan states | 2026-05-07 | 1 | 2026-05-07 | WATCHING. Count loops per describe block. † |
| Conditional redirect regression when a helper's return value is discarded | 2026-04-14 | 1 | 2026-04-14 | WATCHING. Check callers when a side-effect becomes conditional. † |
| Too-lenient INSERT rejection assertion (OR-branch allows vacuous pass) | 2026-05-31 | 2 | 2026-06-10 | RULE CANDIDATE. Assert `error?.code` directly. † |
| Hard DELETE on quiz_sessions in red-team cleanup | 2026-06-05 | 1 | 2026-06-05 | WATCHING. Soft-delete only — hard `.delete()` = ISSUE. † |
| New _hooks/ util extracted without a co-located test | 2026-06-01 | 2 | 2026-06-20 | RULE CANDIDATE. ISSUE per code-style §7. † |
| Behavior-change fix to a tested util ships with no regression test for the NEW behavior | 2026-08-07 | 3 | 2026-08-18 | RULE CANDIDATE (count=3). Needs a case that FAILS pre-fix. † |
| Doc **or code comment** describes behavior the authority (migration body, RLS POLICY, or CONTENT CORPUS) contradicts | 2026-06-06 | 7 | 2026-08-18 | PROMOTED → code-style §10. 7th widened the class beyond SQL — the contradicting authority was a content corpus. † |
| Same-commit self-contradiction: a comment restates the exact claim ANOTHER file in the SAME staged diff retracts | 2026-08-18 | 1 | 2026-08-18 | RESOLVED-WATCH. Grep the diff for the OLD wording, not just the file being corrected. † |
| Red-team non-vacuity read omits a filter the RPC itself uses | 2026-06-14 | 1 | 2026-06-14 | WATCHING. Mirror ALL of the RPC's predicates. † |
| Pre-existing file-size violation worsened by a bug-fix commit | 2026-06-21 | 1 | 2026-06-21 | WATCHING. SUGGESTION class; the split is a separate refactor. † |
| Fractional partial-credit SUM funneled through an `int` plpgsql var → rounded early | 2026-06-21 | 1 | 2026-06-21 | WATCHING. Var stays `numeric` until the percentage is derived. † |
| Agent-memory stub rows with an archive pointer the archive does not hold | 2026-06-22 | 1 | 2026-06-22 | WATCHING. Fuzzy-grep the archive + other suffix forms first. † |
| packages/db migration NNN prefix collides with a parallel UNMERGED branch | 2026-06-26 | 1 | 2026-06-26 | WATCHING. Merge-sequencing hazard, not a staged-diff defect. † |
| Integration fixture retyped to satisfy a new trigger, leaving the original CHECK active | 2026-06-24 | 1 | 2026-06-24 | WATCHING. Retarget to a trigger-allowed type. † |
| Error/status-posture change leaves a sibling spec asserting the OLD value | 2026-06-26 | 2 | 2026-08-09 | RULE CANDIDATE. Grep the WHOLE repo for the old literal. † |
| Restore UPDATE on a just-fetched row omits the `.select('id')` zero-row chain | 2026-07-13 | 1 | 2026-07-13 | WATCHING. SUGGESTION only — zero-row impossible for an id from a committed same-request query. |
| Soft-delete restore clears `deleted_at` but omits a sibling nullable column | 2026-07-13 | 1 | 2026-07-13 | WATCHING. 8 seed scripts missed `deleted_by: null`. Check the types.ts Update shape. |
| Rule retired in one surface, a sibling left enumerating the old set | 2026-07-23 | 2 | 2026-08-15 | RULE CANDIDATE. Grep every surface that ENUMERATES the set. † |
| Rules edit bumps one file's `Last updated` footer but not a sibling's | 2026-08-08 | 1 | 2026-08-08 | WATCHING. Distinct from prose divergence (that is rule TEXT drifting). † |
| Playwright `getByRole('dialog')` on a Base UI **AlertDialog** (role=`alertdialog`) | 2026-08-09 | 1 | 2026-08-09 | WATCHING. Strict role equality — no superclass matching. † |
| Redirect target copied from a sibling without checking the route EXISTS | 2026-08-09 | 1 | 2026-08-09 | WATCHING. `find app -path '*<seg>/page.tsx'` first. † |
| Pre-existing UNTRACKED files swept in by a broad `git add <dir>` | 2026-08-15 | 1 | 2026-08-15 | WATCHING. Diff the staged FILE LIST against the commit's stated scope. † |
| Claim-correction commit introduces a NEW wrong count/label/ENUMERATION | 2026-08-15 | 5 | 2026-08-18 | RULE CANDIDATE. Re-derive the SET; don't patch the sentence. 4th+**5th are rounds 1 and 2 of the SAME `mc-content.ts` docblock** — the round-2 recount ("the three surfaces that render options in AUTHORED order") is ALSO wrong: four, missing `admin-quiz-report.ts`. A recount that silently changes the unit (components=3 vs query surfaces=4) lands on a new wrong number — **de-quantify** ("the surfaces … — A, B, C, D") instead. † |
| New app-layer integration test reuses a REAL seeded reference code | 2026-08-09 | 1 | 2026-08-09 | WATCHING. `seedReferenceData` upserts `onConflict: 'code'` — use a unique suffix. † |
| A new authoring guard justified by a RUNTIME/UI mechanism the component contradicts | 2026-08-17 | 1 | 2026-08-17 | WATCHING. §10 beyond SQL. Read the renderer before writing why a content rule exists. † |
| New gate module exports something with ZERO non-test call sites while its comment claims importer/seed parity | 2026-08-17 | 2 | 2026-08-18 | RULE CANDIDATE. `assertMcKeyBalance`; `deriveZoneId`/`deriveLabelId`. Grep call sites before accepting a parity claim. † |
| Answer key converted from commented literals to an index-zip over two sibling arrays, with no alignment pin | 2026-08-18 | 1 | 2026-08-18 | WATCHING. Order-insensitive `toContain` lets a reorder silently rewrite the key. Demand `toEqual` on BOTH arrays. † |
| Comment in future tense about a file that lands in the SAME staged commit | 2026-08-18 | 1 | 2026-08-18 | WATCHING. §10. Grep the staged list for every path a "when X lands" comment names. † |
| Content-file `authoring_notes` asserts a corpus invariant the corpus violates | 2026-08-17 | 1 | 2026-08-17 | WATCHING. Measure every countable claim against the JSON. † |
| Comment asserts a BUNDLER DCE outcome ("tree-shaken out, verified absent") against a build that predates the commit | 2026-08-18 | 2 | 2026-08-18 | RULE CANDIDATE. §10. `stat .next/BUILD_ID` vs the commit date; rebuild before restating "verified". 2nd instance wrote the stale-build justification into AGENT MEMORY ("postdates the commit because it contains `z1a077e7d6`" — build 05:50Z, commit 13:43Z), where future agents inherit it unverified. †
| Comment-accuracy FIX replaces a false claim with a false UNIVERSAL NEGATIVE, and the counterexample sits in the same docblock | 2026-08-18 | 1 | 2026-08-18 | RESOLVED (round 2) — fixed by SCOPING the negative to the student paths and naming both renderers, with the admin editor stated as the exception (#1223); the replacement scoped positive re-verified true. **A universal negative needs an enumeration, not an example.** |

## Durable knowledge

- **Both `apps/web/tsconfig.json` AND `tsconfig.integration.json` exclude `scripts`**, so neither proves anything about `apps/web/scripts/**`. Type-check with an ad-hoc config that `include`s them. (#1219)
- **`asserts x is T` does not narrow a property access on a cast expression.** Bind `(q as DiagramItem).diagram` to a `const` first, or the second use stays `unknown`.

- **CREATE OR REPLACE trace before flagging.** Trace to the LATEST migration definition. Grep BOTH `CREATE OR REPLACE FUNCTION <fn>` AND bare `CREATE FUNCTION <fn>` (DROP+recreate) — a CREATE-OR-REPLACE-only grep returns a superseded file as "latest".
- **Migration source of truth: `supabase/migrations/` ONLY.** `packages/db/migrations/` was FROZEN 2026-07-11. Never flag a missing counterpart there; never cite it for current SQL.
- **Every start RPC auto-clears the caller's active `discovery` row** (migs 137/141/138/139/140, before the single-active guard), so an orphan can never strand a user. Reject any comment claiming it "blocks the retry". †
- **Security §11 (multi-permissive RLS) self-scope is load-bearing.** Per-caller RPCs must keep the explicit `<owner> = auth.uid()` predicate — RLS ORs the broader policy. Never suggest removing it. †
- **types.ts nullable-SQL-column convention.** RPC entries may type nullable columns non-nullable; production query files carry their own Row type. SUGGESTION at most. †
- **types.ts stale column after a DROP+CREATE migration: ISSUE class when not in the staged diff.** †
- **`rpc`/`authRpc` return `{ data, error }` and never throw** on query errors, so `Promise.all([rpc(...), ...])` carries no unhandled-rejection risk. `fetchAllRows` guarantees `data: T[]` — a following `?? []` is redundant.
- **Bounded-await helpers never reject.** `Promise.race([...]).finally(clearTimeout)` (code-style §6) cannot reject or leak its timer — `.finally` attaches at CREATION. Abandoning such a promise is safe; do NOT flag it.
- **Doc-only commits: mig comment vs guard line range.** When a citation spans comment+code, the code-only sub-range is more precise. †
- **Count/page filter symmetry (pagination).** Count and page queries need byte-identical WHERE filters; `.order(...)` affects only the page query, so an id tiebreaker never breaks symmetry.
- **Offset-pagination id tiebreaker is the house pattern** (`.order('<ts>',{ascending:false}).order('id',{ascending:false})`, canonical `internal-exams/queries.ts`). `.limit(N)` reads with no `.range()` do not need it.
- **Test title impl-detail leakage (code-style §7).** Titles must not name internal helpers/types/validator branches; public props/SDK methods/Server-Action + RPC names ARE permitted. Audit inline comments after a rename. †
- **Dead mock branches in test helpers — ISSUE class, not cosmetic.** Remove `if (table === 'X')` branches for tables the SUT no longer reads so the `Unexpected table` throw fires. †
- **VFR RT content ids are DERIVED, never authored** (`scripts/content-ids.ts`): `<kind><ID_VERSION><8 hex of sha256(normalized parts)>` — `o` ordering item, `l` diagram label (own text), `z` diagram zone (`image_ref` + canonical index). `rwy-2709-layout.ts` holds them as LITERALS (it reaches the client bundle; `node:crypto` is absent there); `scripts/diagram-content.test.ts` is the pin. `normalizeForId` + slice width are a STABILITY CONTRACT — changing either orphans stored rows unless `ID_VERSION` is bumped. †

- **MC option letters vs stored ids — the three surfaces, verified 2026-08-18.** `answer-options.tsx` (`LETTERS[index]`) and `report/_components/options-list.tsx` (`String.fromCodePoint(65 + i)`) both letter by POSITION and mark correctness by `option.id === correctOptionId`, so they cannot disagree. **`admin/questions/_components/option-editor.tsx` CAN**: it renders a fixed `OPTION_IDS = a,b,c,d` row grid, indexes the stored array positionally (`options[idx]?.text`), and checks the radio with `correctOptionId === letter` (the SLOT letter). On a gapped run (ids a,b,d / key 'd') the real answer shows under "C" unmarked while the empty "D" row reads Correct — and saving writes `correct_option_id: s.correctOptionId` beside `options: s.options` (`question-form-dialog.tsx`), so the key can be written to an id no option carries. Never accept "no surface can contradict".
- **Key skew is visible on the STUDENT report, not only study mode + admin.** `lib/queries/quiz-report-questions.ts` SELECTs `options` straight off `questions` (stored = authored order) and takes the key from `get_report_correct_options`; `admin-quiz-report.ts` mirrors it. Only `get_quiz_questions` (mig 20260702000300) and `get_vfr_rt_exam_questions` (mig 20260623000600) shuffle MC options (`ORDER BY random()`); `get_study_questions` (mig 20260629000700) delivers `ORDER BY ord`. Diagram ZONES ship in stored order (`ORDER BY z.ord`), labels and ordering items shuffle.
- **`assertNoDerivedIdCollisions` guards ORDERING ids ONLY** (sole non-test caller `ordering-content.ts:91`). Zone/label ids never reach it — a diagram id defect surfaces from `assertDerivedZoneIds` / `assertDerivedLabelIds` instead. Reject any comment predicting the wrong throw.
- **Mutation-testing a test-local guard is cheap and decisive.** Copy the test file to a `*.mutant.test.ts` sibling, revert the mechanism, run, delete. On `mc-content.test.ts` a bold-only regex failed exactly 1 of 50 — proving both the new fixture's discrimination AND the corpus sweep's vacuity in one run.

### Cached-role pattern in SECURITY DEFINER RPCs

- **Cached role variable prevents a NOT NULL abort on delayed soft-delete.** Fetch the actor's role once at authz time — an inline audit-INSERT subquery returns NULL on mid-txn soft-delete. §10 filter still required on the capturing SELECT. †
- **NULL-org guard doubles as NULL-role guard** when both come off one `SELECT u.organization_id, u.role INTO ...`.
- **ELP grader (`write_oral_section_grade`)** — section→session lock order with no inverse, so no deadlock; its `auth.uid() IS NOT NULL → RAISE` is defense-in-depth for a service-role-only caller. Do NOT flag it. †

### Tooling/config

- **knip `ignoreDependencies` is workspace-scoped** (`ignoreBinaries`/`ignore` are top level). `apps/web` entries include `scripts/*.ts` — hence the "keep this file flat in scripts/" headers; a `scripts/lib/` subdir would read as unused. †
- **`@repo/ui` is a dep of `apps/web` with no import** — `packages/ui/src/index.ts` exports `{}`. Ignoring it in knip is intentional.
- **Broad grep on component names yields false positives** when siblings use same-named `@base-ui/react` primitives. Verify the import path, not the symbol.
- **Tailwind v4 `@plugin` placement** — after all `@import`, before `@custom-variant`/`@theme`.
- **Test title impl-detail leakage (code-style §7).** Titles must not name internal helpers/types/validator branches; public props/SDK methods/Server-Action + RPC names ARE permitted. Audit inline comments after a rename. †
- **Playwright project ordering = dependency-depth PHASES, not config order.** One `dependencies:` edge re-partitions every project's phase; projects inside a phase interleave even at `workers: 1`. †
- **`apps/web/tsconfig.json` EXCLUDES `scripts/`** and the dir is NOT type-clean at baseline (~95 errors, mostly `import-questions.ts`), so "tsc is green" proves nothing. Check a scripts module with a temp tsconfig (`include:["next-env.d.ts","scripts/**/*.ts"]`, `types:["node","vitest/globals"]`) and read PER-FILE counts. †
- **`get-active-practice-session.ts`'s Discovery soft-delete claim is VERIFIED** (do not re-flag): `start_discovery_session`, mig `20260629000200`, soft-deletes the caller's active discovery rows before inserting.
- **localStorage read-then-delete in the discard handlers is cross-tab only** (#1205/#1207): two adjacent synchronous calls, strictly safer than the prior unconditional clear. Do not re-raise as a race.

## False positives (do not re-raise)

- **`clearActiveSessions({ admin, studentIds: [studentId] })` in `beforeEach` is correctly studentId-scoped, NOT org-wide** — do not suggest `orgId`. †
- **Probe-gate keyed on allRows (pre-filter) is correct** — `rows.length === 0 → totalCount: 0` is not a missing probe. †
- **`count(*) OVER()` with a `p_limit:1` probe** returns the correct `total_count` — the window is evaluated before LIMIT/OFFSET. †
- **Probe fires on page=2 empty** — `toHaveBeenCalledWith` asserts the FIRST call; the probe's second call is unmocked and the test never asserts its value.
- **`getSessionReports` ~39-line body after extraction** — the auth/RPC/filter preamble cannot split without artificial helpers. Orchestrator-pattern exception.
- **`avg_score`/mastery RPCs return NULL (no COALESCE)** for students with no sessions — intentional; app type `number | null`, UI guards `!== null`.
- **Hard DELETE on `exam_config_distributions` inside `upsert_exam_config`** — intentional, documented in mig 043 + database.md (ephemeral config table).
- **Adjacent conditional JSX guard blocks (`{canDismiss && (`)** are not duplicate buttons — a state-driven trigger and a prop-guarded confirm button are distinct.
- **`_userId`/dropped param on caller-scoped RPCs** — scoped via RLS + `auth.uid()`; dead but harmless (SUGGESTION at most).
- **Red-team seed `selected_option_id: 'a'` with `is_correct: true`** — intentional; `get_student_mastery_stats` reads `sr.is_correct` directly.
- **Red-team spec with no `afterEach` is hermetic** when each test seeds NEW unique rows and does not mutate shared beforeAll state. †
- **try/finally hermiticity hardening for org-transfer tests is correct**; `finally` must use `console.error`, not `expect()`. †
- **`blanks.every(...)` vacuous-true on `[]` is unreachable in the dialog-fill a11y path** — dialog_fill requires ≥1 `{{n}}` blank (mig 131 trigger). †
- **RWY 2709 client-bundle DCE is ASYMMETRIC — do not let a comment say "both arrays are tree-shaken".** Measured 2026-08-18: all 9 ZONE ids survive in a client chunk as retained `rt("<zone id>",…)` calls; zero LABEL ids/texts anywhere in `.next/static`. Cite the minified CALL FORM, never the content-hashed chunk filename. The answer key is not client-readable (LABELS carries the pairing) — do NOT raise the index alignment as a leak. Mechanism + the pre-fix-chunk misfire: †

## Topic pointers

- [commit-notes](topics/commit-notes.md) — per-PR approval narrative, positive-patterns log, and the dated `§ row detail` sections the † markers point at
- [tracker-archive](topics/tracker-archive.md) — older impl-critic findings, pre-2026-06-07
