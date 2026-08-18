# Agent Memory — implementation-critic

> Reviews staged changes against the approved plan before commit.
> Durable recurring-deviation knowledge only. Per-commit narrative lives in `git log` and
> `topics/commit-notes.md`. **†** = full row detail there (§ row detail, by date).

## Recurring-deviation tracker

| Pattern | First | N | Last | Status (→ rule loc) |
|---|---|---|---|---|
| *(13 older RESOLVED / FALSE-POSITIVE / single-instance rows)* | — | — | ≤2026-07-23 | ARCHIVED → topics/tracker-archive.md § archived tracker rows 2026-08-18 |
| *(11 more single-instance rows — Part 3 `--replace` pipeline, comment-accuracy, argv refactor)* | 2026-08-18 | 1 ea | 2026-08-18 | ARCHIVED → topics/tracker-archive.md § archived tracker rows 2026-08-18 (b) |
| Gate keyed on a PARTIAL identity — `topic_code` alone where pool identity is `subject_code`+`topic_code` | 2026-08-18 | 2 | 2026-08-18 | RULE CANDIDATE. 2nd: 3 P3_MC files share one bank+topic+question_type scope, so one file's `--replace` soft-deleted the other two (16 rows, exit 0). **When a query defines a set to DELETE, enumerate the content files landing in it.** † |
| Docstring rationale contradicted by an inline comment 10 lines below it, both written in the SAME commit | 2026-08-18 | 3 | 2026-08-18 | RULE CANDIDATE → §10. Read the whole block after retargeting a caller. **3rd: two docblocks named the old call, both still substantively TRUE — a correctness read misses them. Grep the IDENTIFIER, not the function.** † |
| Zero-row no-op: UPDATE/DELETE missing `.select('id')` + `data?.length` check | 2026-04-10 | 6 | 2026-06-06 | PROMOTED → code-style §5. Prod AND test helpers. † |
| *(10 more count=1 WATCHING rows, 2026-08→2026-08 — stray `apps/web/.claude/agent-memory/` delta, `.select('id')` count logged only when >0, `lineWidth: 100` format gate, `Last updated` footer skew, Base UI `alertdialog` role, redirect target route missing, untracked files swept in by `git add <dir>`, seeded reference-code reuse, authoring guard vs renderer, `authoring_notes` corpus invariant)* | 2026-08-08 | 1 ea | 2026-08-18 | ARCHIVED → topics/tracker-archive.md § archived tracker rows 2026-08-19 (d) |
| *(12 more count=1 WATCHING rows, 2026-04→2026-07 — error-msg/test-regex, payload loop, conditional redirect, hard DELETE cleanup, red-team predicate mirror, file-size worsening, numeric rounding, memory stub pointer, migration prefix collision, fixture retype, restore `.select('id')`, `deleted_by: null`)* | 2026-04-14 | 1 ea | 2026-07-13 | ARCHIVED → topics/tracker-archive.md § archived tracker rows 2026-08-18 (c) |
| Dead helper in test file → Biome `noUnusedVariables`/`noThenProperty` pre-commit fail | 2026-04-11 | 2 | 2026-05-27 | RULE CANDIDATE. Grep call sites of any large test helper. † |
| Too-lenient INSERT rejection assertion (OR-branch allows vacuous pass) | 2026-05-31 | 2 | 2026-06-10 | RULE CANDIDATE. Assert `error?.code` directly. † |
| New _hooks/ util extracted without a co-located test | 2026-06-01 | 2 | 2026-06-20 | RULE CANDIDATE. ISSUE per code-style §7. † |
| Behavior-change fix to a tested util ships with no regression test for the NEW behavior | 2026-08-07 | 3 | 2026-08-18 | RULE CANDIDATE (count=3). Needs a case that FAILS pre-fix. † |
| Doc **or code comment** describes behavior the authority (migration body, RLS POLICY, CHECK constraint, or CONTENT CORPUS) contradicts | 2026-06-06 | 12 | 2026-08-19 | PROMOTED → code-style §10. **A "why this exists" docblock is a claim like any other — trace it.** 10th: blamed RLS on a BYPASSRLS client — check no OTHER mechanism already prevents the failure. **11th/12th: an ISSUE NUMBER cited as exemplar of a class it is not, PROPAGATED into a new comment from an old one; and a doc PATH naming a directory holding no such file. `gh issue view <N>` and `ls` are each one command.** † |
| Same-commit self-contradiction: a comment restates the exact claim ANOTHER file in the SAME staged diff retracts | 2026-08-18 | 2 | 2026-08-18 | RULE CANDIDATE. Grep the diff for the OLD wording, not just the file being corrected. 2nd: one memory file asserted "#1219 CLOSED" while another added in the SAME commit stated the rule that proves otherwise. **"Closes #N" in a local commit ≠ closed.** † |
| Doc asserts an issue is CLOSED/resolved while `gh issue view` reports OPEN — closure only pending an UNMERGED local `Closes #N` | 2026-08-18 | 2 | 2026-08-19 | RULE CANDIDATE. **Run `gh issue view <N> --json state` before writing any closed/resolved/fixed claim.** 2nd: plan.md said "#1194 is CLOSED" on an unpushed branch whose `Closes #1194` is a LOCAL commit; #1194 was OPEN. Hazard is a squash dropping the trailer — then the claim is false permanently. Prefer "closed by this branch". Authority is GitHub, not a sibling file. † |
| Error/status-posture change leaves a sibling spec asserting the OLD value | 2026-06-26 | 2 | 2026-08-09 | RULE CANDIDATE. Grep the WHOLE repo for the old literal. † |
| Rule retired in one surface, a sibling left enumerating the old set | 2026-07-23 | 4 | 2026-08-18 | RULE CANDIDATE. Grep every surface that ENUMERATES the set. 3rd: a docblock retracted a field's PURPOSE while its co-located TEST TITLE still asserted it — a test title is a claim. **4th: a de-claimed validator rule survived in a content file's `authoring_notes`. A JSON string field is a surface — grep content/*.json, not just .ts/.md.** † |
| Claim-correction commit introduces a NEW wrong count/label/ENUMERATION | 2026-08-15 | 7 | 2026-08-19 | RULE CANDIDATE. Re-derive the SET; **de-quantify** rather than patch the numeral. 6th: a rewritten WATCH list silently NARROWED — re-derive by `wc -l`, never edit down. **7th: "the two causes the dedup-read check names" — it names THREE, 175 lines up in the SAME file. Open the cited comment; don't recall it.** † |
| New gate module exports something with ZERO non-test call sites while its comment claims importer/seed parity | 2026-08-17 | 2 | 2026-08-18 | RULE CANDIDATE. `assertMcKeyBalance`; `deriveZoneId`/`deriveLabelId`. Grep call sites before accepting a parity claim. † |
| Comment asserts a BUNDLER DCE outcome against a build that PREDATES the commit | 2026-08-18 | 2 | 2026-08-18 | RULE CANDIDATE. §10. `stat .next/BUILD_ID` vs the commit date; rebuild before restating "verified". †

## Durable knowledge

- **`apps/web/scripts/**` is type-checked by `tsconfig.scripts.json` (#1219)** — chained into `check-types`, gating lefthook pre-commit AND the CI **`type-check`** job (NOT lint). `strict` + `noUncheckedIndexedAccess`, all 30 script files. Caveat: 13 of 17 script `createClient(...)` sites are UNTYPED → `Database` = `any`, so the schema-contract half is vacuous there.
- **`ReturnType<typeof createClient>` is a broken idiom for supabase-js.** An uncalled `ReturnType` on a generic instantiates from the parameters' CONSTRAINTS, not defaults → `.from()` resolves to `never`. Use `SupabaseClient<Database>` (house pattern, 18+ sites).
- **Verify a staged commit in isolation when the tree carries WIP:** `T=$(git write-tree); C=$(git commit-tree $T -p HEAD -m tmp); git worktree add --detach <scratch> $C`, symlink `node_modules` in, run the gate, `git worktree remove --force`. A working-tree run does NOT prove the committed tree is green.
- **`import-questions.ts` cannot be imported from a test — but not for the docblock's reason.** ZERO exports + `main()` at module scope; `parseArgs()` runs first and `process.exit(1)`s without `--file`, so no client is built (`createClient` is lazy anyway). Extraction justified; stated mechanism is not.
- **VFR RT importer `base` ↔ `updateReplacedRow` is an UNGUARDED coupling.** `base` = 6 keys; `updateReplacedRow` strips 5 BY NAME, keeping `explanation_text` (content). Nothing enforces the pair — a 7th `base` key is silently written as content by `--replace`. Stripping `bank_id` is safe (`.eq()` never reads the SET payload); an omitted column keeps its stored value, so no NOT NULL risk. †
- **dialog_fill R7 enforces TWO mechanical things only** (`dialog-fill-content.ts` `assertRecallAnchored`): the `[atc]`-above anchor scan, and a non-empty **trimmed** `unanchored` — whose early-return is the FUNCTION'S FIRST STATEMENT, so it exempts the WHOLE ITEM, not just the unpinned blank. Nothing REJECTS an empty `unanchored`; it merely conditions the opt-out (safe direction). The "name the competing phrase" bar is UNCHECKED authoring policy. Importer and corpus sweep both call this one function — never accept "the gate passed" as evidence.
- **`questions.status` has exactly two values, `'active'` / `'draft'`** (initial_schema CHECK). NO `retired` — repo prose using "retired" means SOFT-DELETED. Reject any comment enumerating a third.
- **`asserts x is T` does not narrow a property access on a cast expression.** Bind `(q as DiagramItem).diagram` to a `const` first, or the second use stays `unknown`.

- **CREATE OR REPLACE trace before flagging.** Trace to the LATEST migration definition. Grep BOTH `CREATE OR REPLACE FUNCTION <fn>` AND bare `CREATE FUNCTION <fn>` (DROP+recreate) — a CREATE-OR-REPLACE-only grep returns a superseded file as "latest".
- **Migration source of truth: `supabase/migrations/` ONLY.** `packages/db/migrations/` was FROZEN 2026-07-11. Never flag a missing counterpart there; never cite it for current SQL.
- **Every start RPC auto-clears the caller's active `discovery` row** (migs 137/141/138/139/140, before the single-active guard) — an orphan never strands a user. Reject any comment claiming it "blocks the retry". †
- **Security §11 (multi-permissive RLS) self-scope is load-bearing.** Per-caller RPCs keep the explicit `<owner> = auth.uid()` predicate — RLS ORs the broader policy. Never suggest removing it. †
- **types.ts:** RPC entries may type nullable columns non-nullable (production query files carry their own Row type) — SUGGESTION at most; a stale column after a DROP+CREATE migration is ISSUE class when not in the staged diff. †
- **`rpc`/`authRpc` return `{ data, error }` and never throw** on query errors, so `Promise.all([rpc(...), ...])` carries no unhandled-rejection risk. `fetchAllRows` guarantees `data: T[]` — a following `?? []` is redundant.
- **Bounded-await helpers never reject.** `Promise.race([...]).finally(clearTimeout)` (§6) cannot reject or leak its timer — `.finally` attaches at CREATION. Abandoning such a promise is safe.
- **Pagination:** count and page queries need byte-identical WHERE filters (`.order(...)` affects only the page query, so an id tiebreaker never breaks symmetry); the offset id tiebreaker `.order('<ts>',{ascending:false}).order('id',{ascending:false})` is the house pattern (canonical `internal-exams/queries.ts`), unneeded for `.limit(N)` reads with no `.range()`.
- **Dead mock branches in test helpers — ISSUE class, not cosmetic.** Remove `if (table === 'X')` branches for tables the SUT no longer reads so the `Unexpected table` throw fires. †
- **`process.exitCode = 1` after a RESOLVED `main()` is verified-safe and is the house pattern** (both importers). Confirmed empirically 2026-08-19: 20,001 buffered lines survive to a pipe AND a file with exit=1, where `exit()` truncates; success path still exits 0; `main().catch` does not fire. Do NOT flag it as a missed `exit()`.
- **VFR RT content corpus = exactly 7 files / 140 items** (`scripts/content/vfr-rt-part*.json` = the whole dir): 40 / 50 / 2 / 20 / 11 / 5 / 12. All 140 author a non-empty `explanation` (verified 2026-08-19), so `buildRow`'s `?? base.explanation_text` fallback is unreachable today — but ALL FIVE branches carry it, and `short_answer` falls back to `` `${acronym}: ${canonical}` `` BEFORE base, so "resolves it from base" is over-general.
- **`supabase/config.toml:18 max_rows = 1000`. UNVERIFIED: whether PostgREST applies it to a MUTATION's returning representation** as well as to reads. `softDeleteForReplace`'s matched-vs-removed reconciliation balances only if it does; if not, the check throws AFTER the soft-delete (fails closed, rollback list complete). Unreachable at 36/scope — hedge such comments, don't assert either outcome.
- **VFR RT content ids are DERIVED, never authored** (`scripts/content-ids.ts`) — `normalizeForId` + slice width are a STABILITY CONTRACT; changing either orphans stored rows unless `ID_VERSION` is bumped. `assertNoDerivedIdCollisions` guards ORDERING ids ONLY. Full spec: [vfr-rt-and-mc-facts](topics/vfr-rt-and-mc-facts.md)

- **MC option letters vs stored ids — never accept "no surface can contradict".** `answer-options.tsx` + `report/.../options-list.tsx` letter by POSITION and mark by id (agree); `admin/.../option-editor.tsx` letters by SLOT and CAN skew on a gapped id run. Detail: [vfr-rt-and-mc-facts](topics/vfr-rt-and-mc-facts.md)
- **Key skew is visible on the STUDENT report too**, not only study mode + admin — only `get_quiz_questions` and `get_vfr_rt_exam_questions` shuffle MC options. Per-surface list: [vfr-rt-and-mc-facts](topics/vfr-rt-and-mc-facts.md)
- **VFR RT Part 3 MC is THREE files in ONE DB scope** — `vfr-rt-part3-mc-{numbers,emergency,posrep}.json`, all `topic_code=P3_MC`/`multiple_choice`, 20+11+5 = 36. Any importer set keyed on bank+topic+question_type spans all three; `planScope` is the union point, `--prune` the opt-in that soft-deletes. **The key-balance union is scoped DIFFERENTLY in the two gates** (test = always 36; importer = only `process.argv` files, so a single-file run early-returns under `MIN_CORPUS_FOR_KEY_BALANCE = 12`). Detail: [vfr-rt-and-mc-facts](topics/vfr-rt-and-mc-facts.md)
- **Mutation-testing a test-local guard is cheap and decisive.** Copy the test file to a `*.mutant.test.ts` sibling, revert the mechanism, run, delete. On `mc-content.test.ts` a bold-only regex failed exactly 1 of 50 — proving both the new fixture's discrimination AND the corpus sweep's vacuity in one run.

### Cached-role pattern in SECURITY DEFINER RPCs

- **Cached role variable prevents a NOT NULL abort on delayed soft-delete.** Fetch the actor's role once at authz time — an inline audit-INSERT subquery returns NULL on mid-txn soft-delete. §10 filter still required on the capturing SELECT. †
- **NULL-org guard doubles as NULL-role guard** when both come off one `SELECT u.organization_id, u.role INTO ...`.
- **ELP grader (`write_oral_section_grade`)** — section→session lock order with no inverse (no deadlock); its `auth.uid() IS NOT NULL → RAISE` is defense-in-depth for a service-role-only caller. Do NOT flag. †

### Tooling/config

- **knip `ignoreDependencies` is workspace-scoped** (`ignoreBinaries`/`ignore` are top level). `apps/web` entries include `scripts/*.ts` — hence the "keep this file flat in scripts/" headers; a `scripts/lib/` subdir would read as unused. †
- **`@repo/ui` is a dep of `apps/web` with no import** — `packages/ui/src/index.ts` exports `{}`. Ignoring it in knip is intentional.
- **Broad grep on component names yields false positives** when siblings use same-named `@base-ui/react` primitives. Verify the import path, not the symbol. Also: **Tailwind v4 `@plugin` goes after all `@import`, before `@custom-variant`/`@theme`.**
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
