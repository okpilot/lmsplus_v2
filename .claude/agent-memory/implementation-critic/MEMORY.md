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
| *(10 more count=1 WATCHING rows, 2026-08)* | 2026-08-08 | 1 ea | 2026-08-18 | ARCHIVED → topics/tracker-archive.md § archived tracker rows 2026-08-19 (d) |
| *(12 more count=1 WATCHING rows, 2026-04→2026-07)* | 2026-04-14 | 1 ea | 2026-07-13 | ARCHIVED → topics/tracker-archive.md § archived tracker rows 2026-08-18 (c) |
| Dead helper in test file → Biome `noUnusedVariables`/`noThenProperty` pre-commit fail | 2026-04-11 | 2 | 2026-05-27 | RULE CANDIDATE. Grep call sites of any large test helper. † |
| Too-lenient INSERT rejection assertion (OR-branch allows vacuous pass) | 2026-05-31 | 2 | 2026-06-10 | RULE CANDIDATE. Assert `error?.code` directly. † |
| New _hooks/ util extracted without a co-located test | 2026-06-01 | 2 | 2026-06-20 | RULE CANDIDATE. ISSUE per code-style §7. † |
| Behavior-change fix to a tested util ships with no regression test for the NEW behavior | 2026-08-07 | 3 | 2026-08-18 | RULE CANDIDATE (count=3). Needs a case that FAILS pre-fix. † |
| Doc **or code comment** describes behavior the authority (migration body, RLS POLICY, CHECK constraint, or CONTENT CORPUS) contradicts | 2026-06-06 | 17 | 2026-08-20 | PROMOTED → code-style §10. **A "why this exists" docblock is a claim like any other — trace it; a comment that JUSTIFIES a gap is the highest-value claim to falsify.** **17th: `docs/database.md:839`, a BINDING PATTERN whose ADVICE was right (use `adminClient`) but whose stated MECHANISM was invented — a "planner is unreliable" quirk, where the policy had simply been dropped for recursion. Correct advice is what lets a false rationale survive review; verify the WHY even when the WHAT checks out.** 16th: a `docs/security.md` template warning named three tables an org-wide policy "would" expose; two carry no `organization_id`, so it 42703s at CREATE. Detail → tracker-archive. †
| Same-commit self-contradiction: a file restates the exact claim ANOTHER file in the SAME staged diff retracts | 2026-08-18 | 7 | 2026-08-20 | RULE CANDIDATE. Grep the diff for the OLD wording, not just the file being corrected. **7th: a fix retracted a phrase in one place and left it LITERALLY intact 78 lines above in the SAME file. Grep the target file for the retracted phrase BEFORE calling the mirror swept.** Retracting a guarantee obliges a grep for every restatement of it, INCLUDING within the same file. Instances 4–6 → tracker-archive. † |
| Doc asserts an issue is CLOSED/resolved while `gh issue view` reports OPEN — closure pending an UNMERGED local `Closes #N` | 2026-08-18 | 2 | 2026-08-19 | RULE CANDIDATE. **Run `gh issue view <N> --json state` before any closed/resolved/fixed claim.** Hazard: a squash drops the trailer and the claim is false permanently. Prefer "closed by this branch". Authority is GitHub, not a sibling file. † |
| Error/status-posture change leaves a sibling spec asserting the OLD value | 2026-06-26 | 2 | 2026-08-09 | RULE CANDIDATE. Grep the WHOLE repo for the old literal. † |
| Rule REDEFINED in one surface, siblings left restating the old definition | 2026-07-23 | 6 | 2026-08-20 | RULE CANDIDATE. Grep every surface that RESTATES the set (test titles, JSON `authoring_notes`, command files). **Sharpest tell: the commit EDITED one clause of a sentence and left the adjacent clause stating the old rule.** **6th: a NEW mechanism — the sweep's FILE-TYPE scope, not its phrase. A `.md`/`.yaml`-only mirror sweep left three production `.ts` comments stale. Scope a mirror grep by CLAIM across ALL tracked files, never by the extension the rule doc uses.** Detail → tracker-archive. †
| RELATIVE commit reference ("the previous commit", "THIS commit") in a DURABLE rules file — true at authoring, FALSE one commit later | 2026-08-19 | 2 | 2026-08-19 | RULE CANDIDATE. **Name the SHA; a rules file has no "now".** 2nd: the FIX kept "the previous commit on this branch" — committing re-points it at the corrector, not the culprit. †
| A GUARD/CEILING added to protect a claim makes that claim unreachable or unrunnable | 2026-08-19 | 3 | 2026-08-20 | RULE CANDIDATE. **Construct the case and RUN the check.** **3rd: `test.describe.configure({ mode: 'serial' })` added to pin load-bearing declaration order ALSO skips every test after the first failure (Playwright types L3638) — falsifying the "15 denial arms red / 5 controls green" mutation-check split recorded in the SAME diff. `mode: 'default'` pins declaration order with no skip cascade — prefer it whenever arms must report independently.** Instances 1–2 → tracker-archive. †
| Claim-correction commit introduces a NEW wrong count/label/ENUMERATION | 2026-08-15 | 14 | 2026-08-20 | RULE CANDIDATE. Re-derive the SET; **de-quantify** rather than patch the numeral. **14th: a fix cited `docs/security.md` §11 for the multiple-permissive rule — that is §3. The quick-summary's OWN numbering leaked into a `docs/security.md §N` citation. Cite the rule TITLE, never a number carried across files.** **Enumerate a table's POLICY SET, not "its policy".** **A DERIVED figure needs the DERIVATION re-run, not just its base.** **A measurement DATE on an unre-derived figure converts a false claim into an apparently-verified one — re-run the count BEFORE adding provenance.** Instances 6–13 → tracker-archive. †
| New gate module exports something with ZERO non-test call sites while its comment claims importer/seed parity | 2026-08-17 | 2 | 2026-08-18 | RULE CANDIDATE. `assertMcKeyBalance`; `deriveZoneId`/`deriveLabelId`. Grep call sites before accepting a parity claim. † |
| Comment asserts a BUNDLER DCE outcome against a build that PREDATES the commit | 2026-08-18 | 2 | 2026-08-18 | RULE CANDIDATE. §10. `stat .next/BUILD_ID` vs the commit date; rebuild before restating "verified". †
| Index MUTATES mid-review — the artifact I was handed is not the artifact I report on | 2026-08-19 | 5 | 2026-08-20 | RULE CANDIDATE. **`stat -c %y .git/index` at BOTH ends, pin each blob `sha1sum`, re-read every staged file before the verdict — and compare SHAs, NOT mtimes: a `git status` stat-refresh moves the mtime with no content change.** **5th: a file was re-staged BETWEEN `git diff --staged` and `git show :<path>`, 3 min apart — read every finding's line from `git show :<path>`, never from the diff hunk.** Pinning has prevented FALSE findings, not merely stale ones. Detail → tracker-archive. |
| Fingerprint/serialisation built from a PRE-ORDER walk with no close-delimiter — not injective | 2026-08-19 | 1 | 2026-08-19 | WATCHING. Oracle `programFingerprint`: `[[a],b]` ≡ `[[a,b]]`, `f(g(a),b)` ≡ `f(g(a,b))`, `if(a){f()}\ng()` ≡ `if(a){f()\ng()}` — 4,689 collisions in a 33k brute force. **Any tree→string equivalence check must emit an arity or close marker; `acc.push(')')` after the child walk fixes all of them.** |
| New deferred-validation error code cited in example/tips text but NOT added to code-style.md §5's canonical list | 2026-08-24 | 1 | 2026-08-24 | WATCHING. agent-critic.md + agent-workflow.md cited `42804` (datatype_mismatch) alongside `42702` (explicitly in §5(c)) as "invisible to a clean `supabase db reset`". `42702` is canonically documented; `42804` is not. If confirmed, add to §5. |

## Durable knowledge

- **`apps/web/scripts/**` is type-checked** by `tsconfig.scripts.json` (#1219), chained into `check-types` (pre-commit + CI **type-check**, NOT lint). Caveat: 13 of 17 script `createClient(...)` sites are UNTYPED → `Database` = `any`, so the schema-contract half is vacuous there. Detail → topics/tracker-archive.md
- **`ReturnType<typeof createClient>` is a broken idiom for supabase-js.** An uncalled `ReturnType` on a generic instantiates from the parameters' CONSTRAINTS, not defaults → `.from()` resolves to `never`. Use `SupabaseClient<Database>` (house pattern, 18+ sites).
- **Verify a staged commit in isolation when the tree carries WIP:** `T=$(git write-tree); C=$(git commit-tree $T -p HEAD -m tmp); git worktree add --detach <scratch> $C`, symlink `node_modules`, run the gate, `git worktree remove --force`. A working-tree run does NOT prove the committed tree is green.
- **`import-questions.ts` cannot be imported from a test — but not for the docblock's reason.** ZERO exports + `main()` at module scope; `parseArgs()` runs first and `process.exit(1)`s without `--file`. Extraction justified; stated mechanism is not.
- **VFR RT specifics — importer `base`/`updateReplacedRow` coupling, the 3-files-one-scope Part 3 MC pool, the 7-file/140-item corpus, `max_rows` on mutation representations, dialog_fill R7's two mechanical checks, MC letter-vs-id surfaces, and DERIVED inner content ids: [vfr-rt-and-mc-facts](topics/vfr-rt-and-mc-facts.md).** Read it before any finding on VFR RT content or the importer.
- **`questions.status` has exactly two values, `'active'` / `'draft'`** (initial_schema CHECK). NO `retired` — repo prose using "retired" means SOFT-DELETED. Reject any comment enumerating a third.
- **`asserts x is T` does not narrow a property access on a cast expression.** Bind `(q as DiagramItem).diagram` to a `const` first, or the second use stays `unknown`.
- **Never accept a tree→string equivalence check without a close-delimiter, a `NodeFlags` mask without re-reading the enum, or "`parseDiagnostics` is empty" as proof.** All three bit the oracle rebuild. Detail: [ast-oracle-facts](topics/ast-oracle-facts.md)

- **CREATE OR REPLACE trace before flagging.** Trace to the LATEST migration definition. Grep every supersession form (an OPEN set — see `agent-workflow.md`), not just `CREATE OR REPLACE FUNCTION <fn>` — a CREATE-OR-REPLACE-only grep returns a superseded file as "latest".
- **Migration source of truth: `supabase/migrations/` ONLY.** `packages/db/migrations/` was FROZEN 2026-07-11. Never flag a missing counterpart there; never cite it for current SQL.
- **Every start RPC auto-clears the caller's active `discovery` row** (migs 137/141/138/139/140, before the single-active guard) — an orphan never strands a user. Reject any comment claiming it "blocks the retry". †
- **Security §11 (multi-permissive RLS) self-scope is load-bearing.** Per-caller RPCs keep the explicit `<owner> = auth.uid()` predicate — RLS ORs the broader policy. Never suggest removing it. †
- **types.ts:** RPC entries may type nullable columns non-nullable (production query files carry their own Row type) — SUGGESTION at most; a stale column after a DROP+CREATE migration is ISSUE class when not in the staged diff. †
- **`rpc`/`authRpc` return `{ data, error }` and never throw** on query errors, so `Promise.all([rpc(...), ...])` carries no unhandled-rejection risk. `fetchAllRows` guarantees `data: T[]` — a following `?? []` is redundant.
- **Bounded-await helpers never reject.** `Promise.race([...]).finally(clearTimeout)` (§6) cannot reject or leak its timer — `.finally` attaches at CREATION. Abandoning such a promise is safe.
- **Pagination:** count and page queries need byte-identical WHERE filters (`.order(...)` affects only the page query, so an id tiebreaker never breaks symmetry); the offset id tiebreaker `.order('<ts>',{ascending:false}).order('id',{ascending:false})` is the house pattern (canonical `internal-exams/queries.ts`), unneeded for `.limit(N)` reads with no `.range()`.
- **Dead mock branches in test helpers — ISSUE class, not cosmetic.** Remove `if (table === 'X')` branches for tables the SUT no longer reads so the `Unexpected table` throw fires. †
- **`process.exitCode = 1` after a RESOLVED `main()` is verified-safe and is the house pattern** (both importers). 20,001 buffered lines survive to a pipe AND a file, where `exit()` truncates. Do NOT flag as a missed `exit()`.

- **Key skew is visible on the STUDENT report too**, not only study mode + admin — only `get_quiz_questions` and `get_vfr_rt_exam_questions` shuffle MC options. Per-surface list: [vfr-rt-and-mc-facts](topics/vfr-rt-and-mc-facts.md)
- **Mutation-testing a test-local guard is cheap and decisive.** Copy the test to a `*.mutant.test.ts` sibling, revert the mechanism, run, delete — it proves fixture discrimination and sweep vacuity in one run.

### Cached-role pattern in SECURITY DEFINER RPCs

- **Cached role variable prevents a NOT NULL abort on delayed soft-delete.** Fetch the actor's role once at authz time — an inline audit-INSERT subquery returns NULL on mid-txn soft-delete. §10 filter still required on the capturing SELECT. †
- **NULL-org guard doubles as NULL-role guard** when both come off one `SELECT u.organization_id, u.role INTO ...`.
- **ELP grader (`write_oral_section_grade`)** — section→session lock order with no inverse (no deadlock); its `auth.uid() IS NOT NULL → RAISE` is defense-in-depth for a service-role-only caller. Do NOT flag. †

### Tooling/config

- **knip `ignoreDependencies` is workspace-scoped** (`ignoreBinaries`/`ignore` are top level). `apps/web` entries include `scripts/*.ts` — hence the "keep flat in scripts/" headers; a `scripts/lib/` subdir reads as unused. †
- **`@repo/ui` is a dep of `apps/web` with no import** — `packages/ui/src/index.ts` exports `{}`. Ignoring it in knip is intentional.
- **Broad grep on component names yields false positives** when siblings use same-named `@base-ui/react` primitives — verify the import PATH, not the symbol. **Tailwind v4 `@plugin` goes after all `@import`, before `@custom-variant`/`@theme`.**
- **Test title impl-detail leakage (code-style §7).** No internal helpers/types/validator branches; public props/SDK methods/Server-Action + RPC names ARE permitted. Audit inline comments after a rename. †
- **Playwright project ordering = dependency-depth PHASES, not config order.** One `dependencies:` edge re-partitions every phase; projects inside a phase interleave even at `workers: 1`. †
- **`mode: 'serial'` ≠ "pin declaration order"** — it also SKIPS every test after the first failure (types L3638/L4218). Use `mode: 'default'`: same order, no skip cascade. Mandatory wherever arms must report independently.
- **RLS/policy facts (users chain, `tenant_isolation` set, multiple-permissive tables, NULL `qual`) → [rls-policy-facts](topics/rls-policy-facts.md). Read it BEFORE any policy finding.** `users` has NO `tenant_isolation` (dropped for recursion, migs `20260311000004`/`20260312000012`); live set is `users_select` + `users_update_own`, both `id = auth.uid()`.
- **`get-active-practice-session.ts`'s Discovery soft-delete claim is VERIFIED** (do not re-flag): `start_discovery_session`, mig `20260629000200`, soft-deletes the caller's active discovery rows before inserting.
- **localStorage read-then-delete in the discard handlers is cross-tab only** (#1205/#1207): two adjacent synchronous calls, strictly safer than the prior unconditional clear. Do not re-raise as a race.

## False positives (do not re-raise)

- Full list → [false-positives](topics/false-positives.md). **Read it BEFORE raising any finding** — it is the enumeration; do not restate it here.

## Topic pointers

- [commit-notes](topics/commit-notes.md) — per-PR approval narrative, positive-patterns log, and the dated `§ row detail` sections the † markers point at
- [tracker-archive](topics/tracker-archive.md) — archived rows + the older-instance detail trimmed from live rows
- [rls-policy-facts](topics/rls-policy-facts.md) — `users` policy chain, `tenant_isolation` set, multiple-permissive tables, NULL `qual`
- [false-positives](topics/false-positives.md) — validated non-findings; check before raising
- [vfr-rt-and-mc-facts](topics/vfr-rt-and-mc-facts.md) — derived content ids, MC letter-vs-id surfaces, key-skew visibility, RWY 2709 bundle DCE
- [ast-oracle-facts](topics/ast-oracle-facts.md) — TypeScript-parser oracle: pre-order non-injectivity, `forEachChild` enum-property surface, `NodeFlags` staleness, `parseDiagnostics` scope, parse cost
