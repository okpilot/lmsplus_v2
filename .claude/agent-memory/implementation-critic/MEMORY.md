# Agent Memory — implementation-critic

> Reviews staged changes against the approved plan before commit.
> Durable recurring-deviation knowledge only. Per-commit narrative lives in `git log` and
> `topics/commit-notes.md`. **†** = full row detail there (§ row detail, by date).

## Recurring-deviation tracker

| Pattern | First | N | Last | Status (→ rule loc) |
|---|---|---|---|---|
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
| Thin-wrapper page-error tests using the mock-dependency form | 2026-06-01 | 2 | 2026-06-25 | FALSE POSITIVE. Valid when the mocked helper is the ONLY fetch path (§7). † |
| New _hooks/ util extracted without a co-located test | 2026-06-01 | 2 | 2026-06-20 | RULE CANDIDATE. ISSUE per code-style §7. † |
| Behavior-change fix to a tested util ships with no regression test for the NEW behavior | 2026-08-07 | 2 | 2026-08-07 | WATCHING (both on #1124 — do not promote). Needs a case that FAILS pre-fix. † |
| Readonly<Props> sweep: plan said "5 exist", reconciled to 3 | 2026-06-01 | 1 | 2026-06-01 | WATCHING. Track whether inline `Readonly<{...}>` also needs it. † |
| Security.md bullet claims an RPC capability it does not have | 2026-06-05 | 1 | 2026-06-05 | RESOLVED. Read the latest CREATE OR REPLACE first. † |
| Doc **or code comment** describes DB guard behavior the migration body contradicts | 2026-06-06 | 5 | 2026-08-17 | PROMOTED → code-style §10. Covers code comments and RLS POLICY migrations. † |
| Cross-org red-team Attack uses a sentinel UUID (target org has no seeded rows) | 2026-06-06 | 1 | 2026-06-06 | WATCHING. Throw, or flip attacker/victim. † |
| DB CHECK violation from a too-long `document_version` in a test seed | 2026-06-06 | 1 | 2026-06-06 | WATCHING. Count chars against the 20-char CHECK. † |
| Doc new-section insertion duplicates an existing heading/entry | 2026-06-10 | 1 | 2026-06-10 | WATCHING. Grep the target for the existing section's first line. † |
| plan.md integration-test count: bad baseline propagated into a new "now N" claim | 2026-06-11 | 2 | 2026-06-11 | FALSE POSITIVE. It is the VITEST RUNTIME total, not an `it(` grep. † |
| Red-team spec uses wrong vector ID sub-labels | 2026-06-14 | 1 | 2026-06-14 | WATCHING. Sub-labels take the matrix vector ID as prefix. † |
| Red-team non-vacuity read omits a filter the RPC itself uses | 2026-06-14 | 1 | 2026-06-14 | WATCHING. Mirror ALL of the RPC's predicates. † |
| New localStorage namespace not threaded through to the persistence hook | 2026-06-20 | 1 | 2026-06-20 | WATCHING. † |
| Pre-existing file-size violation worsened by a bug-fix commit | 2026-06-21 | 1 | 2026-06-21 | WATCHING. SUGGESTION class; the split is a separate refactor. † |
| Fractional partial-credit SUM funneled through an `int` plpgsql var → rounded early | 2026-06-21 | 1 | 2026-06-21 | WATCHING. Var stays `numeric` until the percentage is derived. † |
| Agent-memory stub rows with an archive pointer the archive does not hold | 2026-06-22 | 1 | 2026-06-22 | WATCHING. Fuzzy-grep the archive + other suffix forms first. † |
| `if (orgId)` null-guard dropped when moving a describe block to a new file | 2026-06-23 | 1 | 2026-06-23 | RESOLVED → topics/tracker-archive.md |
| Header comment cross-references a block "above" that extraction removed | 2026-06-23 | 1 | 2026-06-23 | RESOLVED. Audit "above"/"below"/"see block N" on any move. † |
| packages/db migration NNN prefix collides with a parallel UNMERGED branch | 2026-06-26 | 1 | 2026-06-26 | WATCHING. Merge-sequencing hazard, not a staged-diff defect. † |
| Integration fixture retyped to satisfy a new trigger, leaving the original CHECK active | 2026-06-24 | 1 | 2026-06-24 | WATCHING. Retarget to a trigger-allowed type. † |
| Error/status-posture change leaves a sibling spec asserting the OLD value | 2026-06-26 | 2 | 2026-08-09 | RULE CANDIDATE. Grep the WHOLE repo for the old literal. † |
| No-insert seed scripts keep `.single()` where the plan specified `.maybeSingle()` | 2026-07-13 | 1 | 2026-07-13 | RESOLVED (#1121). |
| Restore UPDATE on a just-fetched row omits the `.select('id')` zero-row chain | 2026-07-13 | 1 | 2026-07-13 | WATCHING. SUGGESTION only — zero-row impossible for an id from a committed same-request query. |
| Soft-delete restore clears `deleted_at` but omits a sibling nullable column | 2026-07-13 | 1 | 2026-07-13 | WATCHING. 8 seed scripts missed `deleted_by: null`. Check the types.ts Update shape. |
| `\|\| exit 1` inside `$(...)` aborts only the subshell | 2026-07-23 | 1 | 2026-07-23 | RESOLVED. Resolve into a var, guard in the OUTER shell. |
| Rule retired in one surface, a sibling left enumerating the old set | 2026-07-23 | 2 | 2026-08-15 | RULE CANDIDATE. Grep every surface that ENUMERATES the set. † |
| Rules edit bumps one file's `Last updated` footer but not a sibling's | 2026-08-08 | 1 | 2026-08-08 | WATCHING. Distinct from prose divergence (that is rule TEXT drifting). † |
| Playwright `getByRole('dialog')` on a Base UI **AlertDialog** (role=`alertdialog`) | 2026-08-09 | 1 | 2026-08-09 | WATCHING. Strict role equality — no superclass matching. † |
| Redirect target copied from a sibling without checking the route EXISTS | 2026-08-09 | 1 | 2026-08-09 | WATCHING. `find app -path '*<seg>/page.tsx'` first. † |
| Pre-existing UNTRACKED files swept in by a broad `git add <dir>` | 2026-08-15 | 1 | 2026-08-15 | WATCHING. Diff the staged FILE LIST against the commit's stated scope. † |
| Claim-correction commit introduces a NEW wrong count/label/ENUMERATION | 2026-08-15 | 3 | 2026-08-18 | RULE CANDIDATE. Re-derive the SET; don't patch the sentence. 3rd: plan-critic archive pointer 30→48 by ADDING the delta to a baseline already stale by 9 (real: 57), + enumerated a "2026-08-17" relocation section that was never created — 18 rows appended under a heading bounding Last Seen ≤ 2026-06-21. † |
| New app-layer integration test reuses a REAL seeded reference code | 2026-08-09 | 1 | 2026-08-09 | WATCHING. `seedReferenceData` upserts `onConflict: 'code'` — use a unique suffix. † |
| A new authoring guard justified by a RUNTIME/UI mechanism the component contradicts | 2026-08-17 | 1 | 2026-08-17 | WATCHING. §10 beyond SQL. Read the renderer before writing why a content rule exists. † |
| New gate module exports something with ZERO non-test call sites while its comment claims importer/seed parity | 2026-08-17 | 2 | 2026-08-18 | RULE CANDIDATE. `assertMcKeyBalance`; `deriveZoneId`/`deriveLabelId`. Grep call sites before accepting a parity claim. † |
| Answer key converted from commented literals to an index-zip over two sibling arrays, with no alignment pin | 2026-08-18 | 1 | 2026-08-18 | WATCHING. Order-insensitive `toContain` lets a reorder silently rewrite the key. Demand `toEqual` on BOTH arrays. † |
| Comment in future tense about a file that lands in the SAME staged commit | 2026-08-18 | 1 | 2026-08-18 | WATCHING. §10. Grep the staged list for every path a "when X lands" comment names. † |
| Content-file `authoring_notes` asserts a corpus invariant the corpus violates | 2026-08-17 | 1 | 2026-08-17 | WATCHING. Measure every countable claim against the JSON. † |
| Comment asserts a BUNDLER DCE outcome ("tree-shaken out, verified absent") against a build that predates the commit | 2026-08-18 | 1 | 2026-08-18 | WATCHING. §10. `stat .next/BUILD_ID` vs the commit date; rebuild before restating "verified". † |

## Durable knowledge

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
- **VFR RT content ids are DERIVED, never authored** (`scripts/content-ids.ts`, 2026-08-18): `<kind><ID_VERSION><8 hex of sha256(normalized parts)>` — `o` ordering item, `l` diagram label (own text), `z` diagram zone (`image_ref` + canonical index). `rwy-2709-layout.ts` holds them as LITERALS (it reaches the client bundle; `node:crypto` is absent there) and `scripts/diagram-content.test.ts` is the pin. `normalizeForId` + slice width are a STABILITY CONTRACT — changing either orphans stored rows unless `ID_VERSION` is bumped. †

### Cached-role pattern in SECURITY DEFINER RPCs

- **Cached role variable prevents a NOT NULL abort on delayed soft-delete.** Fetch the actor's role once at authz time — an inline audit-INSERT subquery returns NULL on mid-txn soft-delete. §10 filter still required on the capturing SELECT. †
- **NULL-org guard doubles as NULL-role guard** when both come off one `SELECT u.organization_id, u.role INTO ...`.
- **ELP grader (`write_oral_section_grade`)** — section→session lock order with no inverse, so no deadlock; its `auth.uid() IS NOT NULL → RAISE` is defense-in-depth for a service-role-only caller. Do NOT flag it. †

### Tooling/config

- **knip `ignoreDependencies` is workspace-scoped** (`ignoreBinaries`/`ignore` are top level). `apps/web` entries are `app/**/page|layout|loading.tsx`, `app/**/actions/*.ts`, `app/**/route.ts`, `app/globals.css`, `scripts/*.ts` — hence the "keep this file flat in scripts/" headers; a `scripts/lib/` subdir would read as unused.
- **`@repo/ui` is a dep of `apps/web` with no import** — `packages/ui/src/index.ts` exports `{}`. Ignoring it in knip is intentional.
- **Broad grep on component names yields false positives** when siblings use same-named `@base-ui/react` primitives. Verify the import path, not the symbol.
- **Tailwind v4 `@plugin` placement** — after all `@import`, before `@custom-variant`/`@theme`.
- **`apps/web/tsconfig.json` EXCLUDES `scripts/`**, so `tsc` never covers the importer/seed/content modules and the dir is NOT type-clean at baseline (~95 errors, mostly `import-questions.ts`). To check a new scripts module, use a temp tsconfig with `include:["next-env.d.ts","scripts/**/*.ts"]` + `types:["node","vitest/globals"]` and read PER-FILE counts — never trust "tsc is green".
- **Playwright project ordering = dependency-depth PHASES, not config order.** One `dependencies:` edge re-partitions every project's phase; projects inside a phase interleave even at `workers: 1`. †
- **Comment-only diffs: scope the review to §10 + §7.** When every `+`/`-` line is a comment or an `it()` title, only comment accuracy and test naming are in scope. Pairs with the CLAUDE.md stop rule: on a review-follow-up commit act only on CRITICAL/ISSUE naming a *runtime* defect, never on wording the follow-up itself just rewrote.
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
- **RWY 2709 client-bundle DCE is ASYMMETRIC — do not let a comment say "both arrays are tree-shaken".** Measured on the 2026-08-18 build of the POST-fix source: all 9 ZONE ids present in a client chunk as retained calls (`rt("<zone id>",…)`), zero label ids/texts anywhere in `.next/static`. Cite the minified CALL FORM, never the chunk filename — it is content-hashed and dies every build, and the first version of this row cited a pre-fix chunk whose `rs("z9f2a1c",…)` ids this very commit deleted. Mechanism: `RWY_2709_ZONES` initializers are `box(...)` CALL expressions the bundler cannot prove pure, so the calls + their string args survive even though the array binding is dropped; `RWY_2709_LABELS` is a plain object-literal array and IS dropped. No client file imports either. So the answer key is not client-readable (LABELS carries the pairing) — do NOT raise the index alignment as a leak — but the real guard is "LABELS stays a DCE-droppable literal array", not "nothing imports it": a `chip(...)` constructor form would ship all 12 chips in canonical order with no import change. †

## Topic pointers

- [commit-notes](topics/commit-notes.md) — per-PR approval narrative, positive-patterns log, and the dated `§ row detail` sections the † markers point at
- [tracker-archive](topics/tracker-archive.md) — older impl-critic findings, pre-2026-06-07
