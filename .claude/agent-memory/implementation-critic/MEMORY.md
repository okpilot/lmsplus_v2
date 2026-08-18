# Agent Memory — implementation-critic

> Reviews staged changes against the approved plan before commit.
> Durable recurring-deviation knowledge only. Per-commit narrative lives in `git log` and
> `topics/commit-notes.md`. **†** = full row detail there (§ row detail, by date).

## Recurring-deviation tracker

| Pattern | First | N | Last | Status (→ rule loc) |
|---|---|---|---|---|
| *(13 older RESOLVED / FALSE-POSITIVE / single-instance rows)* | — | — | ≤2026-07-23 | ARCHIVED → topics/tracker-archive.md § archived tracker rows 2026-08-18 |
| *(11 more single-instance rows — Part 3 `--replace` pipeline, comment-accuracy, argv refactor)* | 2026-08-18 | 1 ea | 2026-08-18 | ARCHIVED → topics/tracker-archive.md § archived tracker rows 2026-08-18 (b) |
| Gate keyed on a PARTIAL identity — `topic_code` alone where pool identity is `subject_code`+`topic_code` | 2026-08-18 | 2 | 2026-08-18 | RULE CANDIDATE. 2nd: 3 P3_MC files share one bank+topic+question_type scope, so one file's `--replace` soft-deleted the other two (16 rows, exit 0). **When a new query defines a set to DELETE, enumerate the shipped content files landing in it.** † |
| Docstring rationale contradicted by an inline comment 10 lines below it, both written in the SAME commit | 2026-08-18 | 3 | 2026-08-18 | RULE CANDIDATE → §10. Read the whole block after retargeting a caller. **3rd: a call-shape change left TWO docblocks naming the old call, both still substantively TRUE — a correctness read misses them. Grep the IDENTIFIER, not the enclosing function.** † |
| Zero-row no-op: UPDATE/DELETE missing `.select('id')` + `data?.length` check | 2026-04-10 | 6 | 2026-06-06 | PROMOTED → code-style §5. Prod AND test helpers. † |
| Memory delta written to the stray `apps/web/.claude/agent-memory/` (cwd was `apps/web`) | 2026-08-17 | 1 | 2026-08-17 | WATCHING. Same loss class as a stashed delta. † |
| Zero-row no-op, DISTINCT: `.select('id')` present but count logged only when `> 0` | 2026-08-11 | 1 | 2026-08-11 | WATCHING. If a prior SELECT proved N match, compare to N and THROW. † |
| *(12 more count=1 WATCHING rows, 2026-04→2026-07 — error-msg/test-regex, payload loop, conditional redirect, hard DELETE cleanup, red-team predicate mirror, file-size worsening, numeric rounding, memory stub pointer, migration prefix collision, fixture retype, restore `.select('id')`, `deleted_by: null`)* | 2026-04-14 | 1 ea | 2026-07-13 | ARCHIVED → topics/tracker-archive.md § archived tracker rows 2026-08-18 (c) |
| Dead helper in test file → Biome `noUnusedVariables`/`noThenProperty` pre-commit fail | 2026-04-11 | 2 | 2026-05-27 | RULE CANDIDATE. Grep call sites of any large test helper. † |
| New test line copied from a sibling exceeds `lineWidth: 100` → format gate fails | 2026-08-17 | 1 | 2026-08-17 | WATCHING. `npx biome check <staged>` BEFORE commit — amend is forbidden after a hook failure. † |
| Too-lenient INSERT rejection assertion (OR-branch allows vacuous pass) | 2026-05-31 | 2 | 2026-06-10 | RULE CANDIDATE. Assert `error?.code` directly. † |
| New _hooks/ util extracted without a co-located test | 2026-06-01 | 2 | 2026-06-20 | RULE CANDIDATE. ISSUE per code-style §7. † |
| Behavior-change fix to a tested util ships with no regression test for the NEW behavior | 2026-08-07 | 3 | 2026-08-18 | RULE CANDIDATE (count=3). Needs a case that FAILS pre-fix. † |
| Doc **or code comment** describes behavior the authority (migration body, RLS POLICY, CHECK constraint, or CONTENT CORPUS) contradicts | 2026-06-06 | 10 | 2026-08-18 | PROMOTED → code-style §10. **A "why this exists" docblock is a claim like any other — trace it.** 9th: a comment named a status value that does not exist. **10th: a comment asserted a consequence the SCHEMA already prevents, and blamed RLS on a BYPASSRLS client. Name the failure a guard prevents, then check no OTHER mechanism already prevents it.** † |
| Same-commit self-contradiction: a comment restates the exact claim ANOTHER file in the SAME staged diff retracts | 2026-08-18 | 2 | 2026-08-18 | RULE CANDIDATE. Grep the diff for the OLD wording, not just the file being corrected. 2nd: one memory file asserted "#1219 CLOSED" while another added in the SAME commit stated the rule that proves otherwise. **"Closes #N" in a local commit ≠ closed.** † |
| Error/status-posture change leaves a sibling spec asserting the OLD value | 2026-06-26 | 2 | 2026-08-09 | RULE CANDIDATE. Grep the WHOLE repo for the old literal. † |
| Rule retired in one surface, a sibling left enumerating the old set | 2026-07-23 | 4 | 2026-08-18 | RULE CANDIDATE. Grep every surface that ENUMERATES the set. 3rd: a docblock retracted a field's PURPOSE while its own co-located TEST TITLE still asserted it. A test title is a claim. **4th: R7's exclusion bar was de-claimed in the code docblock AND decisions.md, but the CONTENT FILE's `authoring_notes` ("It asserts FIVE rules … R7 … declares `unanchored` naming the competing phrase and what excludes it") still attributes it to the validator. A JSON string field is a surface — grep content/*.json, not just .ts/.md.** † |
| Rules edit bumps one file's `Last updated` footer but not a sibling's | 2026-08-08 | 1 | 2026-08-08 | WATCHING. Distinct from prose divergence (that is rule TEXT drifting). † |
| Playwright `getByRole('dialog')` on a Base UI **AlertDialog** (role=`alertdialog`) | 2026-08-09 | 1 | 2026-08-09 | WATCHING. Strict role equality — no superclass matching. † |
| Redirect target copied from a sibling without checking the route EXISTS | 2026-08-09 | 1 | 2026-08-09 | WATCHING. `find app -path '*<seg>/page.tsx'` first. † |
| Pre-existing UNTRACKED files swept in by a broad `git add <dir>` | 2026-08-15 | 1 | 2026-08-15 | WATCHING. Diff the staged FILE LIST against the commit's stated scope. † |
| Claim-correction commit introduces a NEW wrong count/label/ENUMERATION | 2026-08-15 | 6 | 2026-08-18 | RULE CANDIDATE. Re-derive the SET; **de-quantify** rather than patch the numeral. 6th: a rewritten agent-memory WATCH list silently NARROWED — dropped `diagram-content.ts` (255L, over the 200L cap) and `mc-content.test.ts` (489/500L) while keeping a smaller offender. **A rewritten enumeration must be re-derived by `wc -l`, not edited down.** † |
| New app-layer integration test reuses a REAL seeded reference code | 2026-08-09 | 1 | 2026-08-09 | WATCHING. `seedReferenceData` upserts `onConflict: 'code'` — use a unique suffix. † |
| A new authoring guard justified by a RUNTIME/UI mechanism the component contradicts | 2026-08-17 | 1 | 2026-08-17 | WATCHING. §10 beyond SQL. Read the renderer before writing why a content rule exists. † |
| New gate module exports something with ZERO non-test call sites while its comment claims importer/seed parity | 2026-08-17 | 2 | 2026-08-18 | RULE CANDIDATE. `assertMcKeyBalance`; `deriveZoneId`/`deriveLabelId`. Grep call sites before accepting a parity claim. † |
| Content-file `authoring_notes` asserts a corpus invariant the corpus violates | 2026-08-17 | 1 | 2026-08-17 | WATCHING. Measure every countable claim against the JSON. † |
| Comment asserts a BUNDLER DCE outcome against a build that PREDATES the commit | 2026-08-18 | 2 | 2026-08-18 | RULE CANDIDATE. §10. `stat .next/BUILD_ID` vs the commit date; rebuild before restating "verified". †

## Durable knowledge

- **`apps/web/scripts/**` is type-checked by `tsconfig.scripts.json` as of #1219** — chained into `check-types`, gating lefthook pre-commit AND the CI **`type-check`** job (NOT the lint job). Inherits `strict` + `noUncheckedIndexedAccess`; all 30 script `.ts` files, no overlap with the other two configs. Caveat: 13 of 17 script `createClient(...)` sites are UNTYPED → `Database` = `any`, so the schema-contract half of the gate is vacuous there.
- **`ReturnType<typeof createClient>` is a broken idiom for supabase-js.** An uncalled `ReturnType` on a generic instantiates from the type parameters' CONSTRAINTS, not defaults → `PostgrestClient<unknown, …, never, never>` and `.from()` resolves to `never`. Use `SupabaseClient<Database>` (house pattern, 18+ sites) and `createClient<Database>(...)`.
- **Verify a staged commit in isolation when the tree carries unrelated WIP:** `T=$(git write-tree); C=$(git commit-tree $T -p HEAD -m tmp); git worktree add --detach <scratch> $C`, symlink root/`apps/web`/`packages/*` `node_modules` in, run the gate there, `git worktree remove --force`. A working-tree run does NOT prove the committed tree is green.
- **`scripts/import-questions.ts` cannot be imported from a test — but not for the reason its docblock gives.** It has ZERO exports and calls `main()` at module scope (last line); `main()` runs `parseArgs()` FIRST, which `process.exit(1)`s without `--file`, so `createAdminClient()` is never reached and no Supabase client is ever built. (`createClient` is lazy anyway — it opens no connection.) The extraction is still justified; the stated mechanism is not.
- **VFR RT importer `base` ↔ `updateReplacedRow` is an UNGUARDED coupling.** `base` = 6 keys; `updateReplacedRow` strips 5 BY NAME, keeping `explanation_text` (content). Nothing enforces the pair — a 7th `base` key is silently written as content by `--replace`. Stripping `bank_id` is safe (a `.eq()` filter never reads the SET payload); omitting a column from an UPDATE leaves the stored value, so no NOT NULL risk. †
- **dialog_fill R7 enforces TWO mechanical things only** (`scripts/dialog-fill-content.ts` `assertRecallAnchored`): the `[atc]`-above anchor scan, and that `unanchored` is a non-empty **trimmed** string (L486 early-returns on it, exempting EVERY recall blank in the item, not just the unpinned one). The "name the competing phrase and show what excludes it" bar is UNCHECKED authoring policy. Sole enforcement site — the importer (`import-vfr-rt-content.ts:1797`) and the corpus sweep test both call the same function, adding nothing. Never accept "the gate passed" as evidence an `unanchored` blank was justified.
- **`questions.status` has exactly two values, `'active'` and `'draft'`** (initial_schema CHECK; admin UI union matches). There is NO `retired` status — repo prose using "retired" means SOFT-DELETED. Reject any comment enumerating a third.
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
- **VFR RT content ids are DERIVED, never authored** (`scripts/content-ids.ts`) — `normalizeForId` + slice width are a STABILITY CONTRACT; changing either orphans stored rows unless `ID_VERSION` is bumped. `assertNoDerivedIdCollisions` guards ORDERING ids ONLY. Full spec: [vfr-rt-and-mc-facts](topics/vfr-rt-and-mc-facts.md)

- **MC option letters vs stored ids — never accept "no surface can contradict".** `answer-options.tsx` and `report/_components/options-list.tsx` letter by POSITION and mark by id, so they agree; `admin/questions/_components/option-editor.tsx` letters by SLOT and CAN skew on a gapped id run. Detail: [vfr-rt-and-mc-facts](topics/vfr-rt-and-mc-facts.md)
- **Key skew is visible on the STUDENT report too**, not only study mode + admin — only `get_quiz_questions` and `get_vfr_rt_exam_questions` shuffle MC options. Per-surface list: [vfr-rt-and-mc-facts](topics/vfr-rt-and-mc-facts.md)
- **VFR RT Part 3 MC is THREE files in ONE DB scope** — `vfr-rt-part3-mc-{numbers,emergency,posrep}.json`, all `topic_code=P3_MC` / `multiple_choice`, 20+11+5 = 36 numbers, disjoint prefixes (`VRT-P3-MC-` / `-EMC-` / `-PMC-`). Any importer set keyed on bank+topic+question_type spans all three. `planScope` (`scripts/replace-planning.ts`) is the union point; `--prune` is the opt-in that lets it soft-delete.
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
- **`get-active-practice-session.ts`'s Discovery soft-delete claim is VERIFIED** (do not re-flag): `start_discovery_session`, mig `20260629000200`, soft-deletes the caller's active discovery rows before inserting.
- **localStorage read-then-delete in the discard handlers is cross-tab only** (#1205/#1207): two adjacent synchronous calls, strictly safer than the prior unconditional clear. Do not re-raise as a race.

## False positives (do not re-raise)

- Full list moved to [false-positives](topics/false-positives.md) — read it BEFORE raising a finding on: `clearActiveSessions` studentId scoping, probe-gate/`count(*) OVER()` pagination probes, `getSessionReports` body length, NULL `avg_score`, `exam_config_distributions` hard DELETE, adjacent conditional JSX guards, `_userId` on caller-scoped RPCs, red-team seed `is_correct`, hermetic specs with no `afterEach`, try/finally teardown, vacuous `blanks.every([])`, RWY 2709 DCE asymmetry.

## Topic pointers

- [commit-notes](topics/commit-notes.md) — per-PR approval narrative, positive-patterns log, and the dated `§ row detail` sections the † markers point at
- [tracker-archive](topics/tracker-archive.md) — older impl-critic findings, pre-2026-06-07
- [false-positives](topics/false-positives.md) — validated non-findings; check before raising
- [vfr-rt-and-mc-facts](topics/vfr-rt-and-mc-facts.md) — derived content ids, MC letter-vs-id surfaces, key-skew visibility, RWY 2709 bundle DCE
