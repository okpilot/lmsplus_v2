# Agent Memory — implementation-critic

> Reviews staged changes against the approved plan before commit.
> Durable recurring-deviation knowledge only. Per-commit narrative lives in `git log` and
> `topics/commit-notes.md`. **†** = full row detail there (§ row detail, by date).

## Recurring-deviation tracker

| Pattern | First | N | Last | Status (→ rule loc) |
|---|---|---|---|---|
| *(13 older RESOLVED / FALSE-POSITIVE / single-instance rows)* | — | — | ≤2026-07-23 | ARCHIVED → topics/tracker-archive.md § archived tracker rows 2026-08-18 |
| *(11 more single-instance rows — Part 3 `--replace` pipeline, comment-accuracy, argv refactor)* | 2026-08-18 | 1 ea | 2026-08-18 | ARCHIVED → topics/tracker-archive.md § archived tracker rows 2026-08-18 (b) |
| Gate keyed on a PARTIAL identity — `topic_code` alone where pool identity is `subject_code`+`topic_code` | 2026-08-18 | 2 | 2026-08-18 | RULE CANDIDATE. **When a query defines a set to DELETE, enumerate the content files landing in it.** † |
| Docstring rationale contradicted by an inline comment 10 lines below it, both written in the SAME commit | 2026-08-18 | 3 | 2026-08-18 | RULE CANDIDATE → §10. **Grep the IDENTIFIER, not the function.** † |
| A test's "outside oracle" is co-modifiable with the value it checks | 2026-09-08 | 1 | 2026-09-08 | WATCHING. `pipeline.test.mjs` `tracked`-vs-`full`: co-narrowing both keeps them equal, 92/92 green. **Oracle is only outside if a DIFFERENT mechanism produces it.** † |
| Commit message claims a feature ("run jobs in parallel") the diff does not implement | 2026-09-21 | 1 | 2026-09-21 | FALSE POSITIVE. Round-2 review shows `3162464a` title is "grade the index and scope grading to staged paths" and explicitly disclaims `--jobs N`. Pre-fixup state no longer exists. Count frozen at 1. |
| Zero-row no-op: UPDATE/DELETE missing `.select('id')` + `data?.length` check | 2026-04-10 | 6 | 2026-06-06 | PROMOTED → code-style §5. † |
| *(10 more count=1 WATCHING rows, 2026-08)* | 2026-08-08 | 1 ea | 2026-08-18 | ARCHIVED → topics/tracker-archive.md § archived tracker rows 2026-08-19 (d) |
| *(12 more count=1 WATCHING rows, 2026-04→2026-07)* | 2026-04-14 | 1 ea | 2026-07-13 | ARCHIVED → topics/tracker-archive.md § archived tracker rows 2026-08-18 (c) |
| Dead helper in test file → Biome `noUnusedVariables`/`noThenProperty` pre-commit fail | 2026-04-11 | 2 | 2026-05-27 | RULE CANDIDATE. Grep call sites of any large test helper. † |
| Too-lenient INSERT rejection assertion (OR-branch allows vacuous pass) | 2026-05-31 | 2 | 2026-06-10 | RULE CANDIDATE. Assert `error?.code` directly. † |
| New _hooks/ util extracted without a co-located test | 2026-06-01 | 2 | 2026-06-20 | RULE CANDIDATE. ISSUE per code-style §7. † |
| Behavior-change fix to a tested util ships with no regression test for the NEW behavior | 2026-08-07 | 3 | 2026-08-18 | RULE CANDIDATE (count=3). Needs a case that FAILS pre-fix. † |
| Doc **or code comment** describes behavior the authority contradicts | 2026-06-06 | 25 | 2026-09-19 | PROMOTED → code-style §10. **A comment JUSTIFYING a gap is the highest-value claim to falsify. 25th: Decision 76 stated `50.8%` when `measure-quantifier-swap.mjs --commits 120` returns `60 (50.0%)` — figure authored before the commit's own 2 non-merge commits shifted the window.** Instance detail 15-25 → tracker-archive. †
| Same-commit self-contradiction: a file restates the exact claim ANOTHER file in the SAME staged diff retracts | 2026-08-18 | 11 | 2026-09-14 | RULE CANDIDATE. **Grep the diff for the OLD wording, not just the file being corrected. Grep for every restatement, INCLUDING within the same file.** Instances 4–11 → tracker-archive. † |
| Doc asserts an issue is CLOSED/resolved while `gh issue view` reports OPEN | 2026-08-18 | 2 | 2026-08-19 | RULE CANDIDATE. **Run `gh issue view <N> --json state` before any closed/resolved/fixed claim.** † |
| Error/status-posture change leaves a sibling spec asserting the OLD value | 2026-06-26 | 2 | 2026-08-09 | RULE CANDIDATE. Grep the WHOLE repo for the old literal. † |
| Rule REDEFINED in one surface, siblings left restating the old definition | 2026-07-23 | 10 | 2026-09-20 | RULE CANDIDATE. **Sharpest tell: one clause edited, adjacent clause left stating the old rule. 10th: code-style.md §7 widened from "a red-team test" to "ANY test" but `.coderabbit.yaml` path instruction not extended to `packages/db/src/__integration__/**`.** Scope a mirror grep by CLAIM, never by extension. Instances 6-10 → tracker-archive. †
| RELATIVE commit reference ("the previous commit", "THIS commit", "this PR") in a DURABLE rules file | 2026-08-19 | 3 | 2026-09-07 | RULE CANDIDATE. **Name the SHA or issue #; a rules file has no "now".** † |
| A GUARD/CEILING added to protect a claim makes that claim unreachable or unrunnable | 2026-08-19 | 3 | 2026-08-20 | RULE CANDIDATE. **`mode: 'serial'` skips every test after the first failure — use `mode: 'default'`.** Instances 1–2 → tracker-archive. † |
| Claim-correction commit introduces a NEW wrong count/label/ENUMERATION | 2026-08-15 | 16 | 2026-09-18 | RULE CANDIDATE. **Re-derive the SET; de-quantify rather than patch the numeral. 16th: Decision 75 stated "48 markers across 4 of 15 suites" — `grep -c '^\s*// GROUP:' .claude/hooks/*.test.mjs` gives 52 across 5 suites, counted before the same commit's markers were written.** Instances 6–15 → tracker-archive. †
| New gate module exports something with ZERO non-test call sites while its comment claims importer/seed parity | 2026-08-17 | 2 | 2026-08-18 | RULE CANDIDATE. Grep call sites before accepting a parity claim. † |
| Comment asserts a BUNDLER DCE outcome against a build that PREDATES the commit | 2026-08-18 | 2 | 2026-08-18 | RULE CANDIDATE. §10. `stat .next/BUILD_ID` vs the commit date; rebuild before restating "verified". †
| Index MUTATES mid-review — the artifact I was handed is not the artifact I report on | 2026-08-19 | 5 | 2026-08-20 | RULE CANDIDATE. **Pin each blob `sha1sum` at both ends.** Detail → tracker-archive. |
| Fingerprint/serialisation built from a PRE-ORDER walk with no close-delimiter — not injective | 2026-08-19 | 1 | 2026-08-19 | WATCHING. `programFingerprint`: `acc.push(')')` after child walk fixes all 4,689 collisions. |
| New deferred-validation error code cited in example/tips text but NOT added to code-style.md §5's canonical list | 2026-08-24 | 1 | 2026-08-24 | WATCHING. `42804` cited alongside `42702` in agent-critic.md + agent-workflow.md but not §5. |
| `git show --stat <sha> -- <path>` absolute claim is false for MERGE commits | 2026-09-06 | 1 | 2026-09-06 | RESOLVED. Applied in `2b8adecf`: rule now prescribes `--diff-merges=first-parent` for merges. |
| Hook-addition commit updates ALL named registration surfaces EXCEPT `.spec-workflow/steering/tech.md` | 2026-09-14 | 1 | 2026-09-14 | RESOLVED. Real deferral landed after two-step fix. Rule-Mirror Sync table: `.spec-workflow/steering/**` is ALWAYS live. |
| A commit that reformats a line targeted by a `*.mutations.json` anchor breaks every anchor containing that line | 2026-09-14 | 1 | 2026-09-14 | WATCHING. Fix: when editing a line any data file targets, grep all `*.mutations.json` for the find string and update anchors in the same commit. |
| A test file's per-test MUTATION comment claims a mechanism the SAME file's preamble lists as NOT PINNABLE | 2026-09-14 | 1 | 2026-09-14 | RESOLVED. Write tracker rows about the COMMITTED state, or transition them when the finding is fixed. |
| Block comment written to explain WHY a case is tested only via one mechanism, then a second test proving otherwise is added in the SAME commit without updating the comment | 2026-09-14 | 1 | 2026-09-14 | WATCHING. §10 cl.3: a block edited (test added below it) without re-reading the claim it started with. |
| Mutation `note` in `*.mutations.json` not updated when its `replace` value is changed in the same commit | 2026-09-21 | 1 | 2026-09-21 | WATCHING. `positional-allowed` in `run-mutations.mutations.json`: `replace` changed to `return { i }` (silent accept) but `note` still says "swaps the message rather than the behaviour". A note describes the SPECIFIC mutation; updating `replace` without updating `note` is the §10 cl.8 shape. |

## Durable knowledge

- **`apps/web/scripts/**` is type-checked** by `tsconfig.scripts.json` (#1219), chained into `check-types`. Caveat: 13 of 17 script `createClient(...)` sites are UNTYPED. Detail → topics/tracker-archive.md
- **`ReturnType<typeof createClient>` is a broken idiom for supabase-js.** Use `SupabaseClient<Database>` (house pattern, 18+ sites).
- **Verify a staged commit in isolation when the tree carries WIP:** `T=$(git write-tree); C=$(git commit-tree $T -p HEAD -m tmp); git worktree add --detach <scratch> $C`.
- **`import-questions.ts` cannot be imported from a test.** ZERO exports + `main()` at module scope; `parseArgs()` runs first and `process.exit(1)`s without `--file`.
- **VFR RT specifics → [vfr-rt-and-mc-facts](topics/vfr-rt-and-mc-facts.md).** Read before any finding on VFR RT content or the importer.
- **`questions.status` has exactly two values, `'active'` / `'draft'`** (initial_schema CHECK). NO `retired`.
- **`asserts x is T` does not narrow a property access on a cast expression.** Bind to `const` first.
- **Never accept a tree→string equivalence check without a close-delimiter.** Detail: [ast-oracle-facts](topics/ast-oracle-facts.md)
- **CREATE OR REPLACE trace before flagging.** Trace to the LATEST migration, every supersession form.
- **Migration source of truth: `supabase/migrations/` ONLY.** `packages/db/migrations/` FROZEN 2026-07-11.
- **Every start RPC auto-clears the caller's active `discovery` row** — an orphan never strands a user. †
- **Security §11 (multi-permissive RLS) self-scope is load-bearing.** Never suggest removing the `auth.uid()` predicate. †
- **`rpc`/`authRpc` return `{ data, error }` and never throw** — `Promise.all([rpc(...)])` carries no rejection risk.
- **`process.exitCode = 1` after a RESOLVED `main()` is verified-safe and is the house pattern.** Do NOT flag as a missed `exit()`.
- **Key skew is visible on the STUDENT report too** → [vfr-rt-and-mc-facts](topics/vfr-rt-and-mc-facts.md)
- **Mutation-testing a test-local guard is cheap and decisive.** Copy, revert mechanism, run, delete.

### Cached-role pattern in SECURITY DEFINER RPCs

- **Cached role variable prevents a NOT NULL abort on delayed soft-delete.** †
- **NULL-org guard doubles as NULL-role guard** when both come off one SELECT.
- **ELP grader (`write_oral_section_grade`)** — its `RAISE` is defense-in-depth for a service-role-only caller. Do NOT flag. †

### Tooling/config

- **knip `ignoreDependencies` is workspace-scoped.** `apps/web` entries include `scripts/*.ts`.
- **`@repo/ui` is a dep of `apps/web` with no import** — intentional.
- **Broad grep on component names yields false positives** — verify the import PATH.
- **Test title impl-detail leakage (code-style §7).** Audit inline comments after a rename. †
- **`mode: 'serial'` ≠ "pin declaration order"** — also SKIPS after first failure. Use `mode: 'default'`.
- **RLS/policy facts → [rls-policy-facts](topics/rls-policy-facts.md). Read it BEFORE any policy finding.**
- **`get-active-practice-session.ts`'s Discovery soft-delete claim is VERIFIED** — do not re-flag.
- **localStorage read-then-delete in the discard handlers is cross-tab only** — do not re-raise as a race.

## Durable knowledge (guard-specific)

- **`check-prose-claims.mjs` exemptions (verified 2026-09-14):** `.coderabbit.yaml` exempt (YAML value strings not scanned); `limits.json` exempt (`.json` not in `COMMENT_EXT`).
- **EVIDENCE: lines required even on a clean APPROVED verdict.** An evidence-free clean verdict is not usable.

## False positives (do not re-raise)

- Full list → [false-positives](topics/false-positives.md). **Read it BEFORE raising any finding.**

## Topic pointers

- [commit-notes](topics/commit-notes.md) — per-PR approval narrative, positive-patterns log, and the dated `§ row detail` sections the † markers point at
- [tracker-archive](topics/tracker-archive.md) — archived rows + the older-instance detail trimmed from live rows
- [rls-policy-facts](topics/rls-policy-facts.md) — `users` policy chain, `tenant_isolation` set, multiple-permissive tables, NULL `qual`
- [false-positives](topics/false-positives.md) — validated non-findings; check before raising
- [vfr-rt-and-mc-facts](topics/vfr-rt-and-mc-facts.md) — derived content ids, MC letter-vs-id surfaces, key-skew visibility, RWY 2709 bundle DCE
- [ast-oracle-facts](topics/ast-oracle-facts.md) — TypeScript-parser oracle: pre-order non-injectivity, `forEachChild` enum-property surface, `NodeFlags` staleness, `parseDiagnostics` scope, parse cost
