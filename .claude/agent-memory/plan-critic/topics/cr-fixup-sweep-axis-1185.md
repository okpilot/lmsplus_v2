# CR-fixup plan gaps — PR #1185 (per-row guard on an `rpc<T[]>` payload)

Reviewed 2026-08-11. Plan: apply CodeRabbit findings to `quiz-question-counts.ts` +
`import-vfr-rt-content.ts` on `feat/vfr-rt-part1-content-import`.

## 1. Sibling sweep scoped to the wrong axis

CLAUDE.md's defensive-pattern rule says sweep **sibling files with the same code
structure**. A CR-fixup plan naturally sweeps by the *identifier in the finding*
(here: the RPC name `get_question_counts`) and reports "no sweep required". That
answer is right on the narrow axis and wrong on the rule's axis.

- Narrow axis (verified TRUE): `admin/syllabus/queries.ts:19` and
  `admin/exam-config/queries.ts:27` call `supabase.rpc('get_question_counts')` with
  generated types (`packages/db/src/types.ts:1429` `Returns: {...}[]`), no
  `as unknown as T` — code-style §5's cast-guard rule genuinely does not reach them.
- Real axis: the pattern applied is *a per-row predicate on an `rpc<XRow[]>` cast
  payload*. Same-structure siblings with only an `Array.isArray()` array guard and no
  per-row predicate: `lib/queries/dashboard-stats.ts:34,58`, `progress.ts:77`,
  `dashboard.ts:77`, `profile.ts:101`, `quiz-report-questions.ts:106,130,140,163`,
  `app/app/internal-exam/queries.ts:108,143`.
- The repo already establishes the per-row-guard answer in three places, each with the
  comment "Per-row guard required by code-style.md §5":
  `lib/queries/quiz-session-queries.ts:44`, `lib/queries/study-queries.ts:82`,
  `app/app/quiz/actions/lookup.ts:139`.

**Check to run next time:** when a plan adds a runtime guard, grep the *shape* of the
call (`rpc<`, `as unknown as`, `Array.isArray(data) ? data :`) across the sibling
directory — not the symbol named in the finding.

## 2. `(err as Error).message` in a new try/catch

Repo-wide in `apps/web/**`: 100 `instanceof Error` narrowings vs exactly one
`(x as Error).` (`e2e/redteam/helpers/force-token-refresh.ts:88`). The closest sibling
— the other importer, `scripts/import-questions.ts:512` — uses
`err instanceof Error ? err.message : String(err)`. A thrown non-Error renders the
message as `undefined`, defeating the diagnostic the wrap exists for.

## 3. Skip reasons that are weaker than the available evidence

Plan skipped CR's "new `.rpc()` site needs an integration test" on
relocation + §7-scopes-to-NEW + backlog #926. All true, but it missed that
`lib/queries/quiz-subject-queries.integration.test.ts` **already exercises the RPC
against real Postgres** (L170-227, incl. cross-org RLS scoping at L214) — so the site
is not an uncovered #926 site at all. When triaging a "missing test" finding, grep for
an existing `*.integration.test.ts` on the *caller* before arguing scope.

## 4. `tsc` on a CLI-listed file ignores tsconfig

Plan's mitigation for the tsconfig-excluded `scripts/` dir was
`npx tsc --noEmit apps/web/scripts/<file>.ts`. Passing files positionally makes tsc
ignore `tsconfig.json` entirely — no `strict`, no `@/*` paths, no shared target/lib.
Both `apps/web/tsconfig.json` and `tsconfig.integration.json` exclude `"scripts"`, so
the only honest gates for a `scripts/` change are a `-p` run against a config that
includes it, or executing the script.

## 7. `typeof x` as the diagnostic payload of a not-an-array log

Rev 2 added `console.error('… payload is not an array:', typeof data)`. The branch fires
on exactly two realistic payloads — `null` and a plain object — and `typeof null` is
`'object'`, so the log emits the identical string for both and the two existing degrade
tests updated to assert it become indistinguishable. The two cases are the ones an
operator most needs told apart (nothing returned vs. return-shape drift). Generalize:
when a plan logs a *type* to characterize a rejected payload, check whether the branch's
reachable inputs actually differ under `typeof` — `null`, arrays and objects all collapse
to `'object'`. Use `data === null ? 'null' : typeof data` or
`Object.prototype.toString.call(data)`.

## 8. Split-branch strictness asymmetry inside one predicate

A union-typed field guarded on two representations can end up with two different
strictnesses for the same wire value. Here `n: number | string` got
`Number.isFinite(n)` (admits `0`, `-1`, `1.5`) on the number branch but `/^\d+$/` on the
string branch — so `-1` passes and `'-1'` fails, while the plan's risk register claimed
the predicate "matches the contract exactly" (`COUNT(*)::bigint >= 1`). True of one
branch only. The near-twin `lookup.ts:152` dissolves the asymmetry with a single
`Number.isFinite(Number(r.n))`, which treats `42` and `'42'` identically — the coercion
every consumer applies anyway (`Number(row.n)` at `quiz-subject-queries.ts:38,79,113,163`).
**Check:** when a predicate accepts N serializations of one field, diff the branches
against each other, not just each against the contract.

## 9. `findIndex` whose index is never asserted

A guard that computes an index purely to name it in a message needs a test pinning the
INDEX value (`[valid, invalid]` → "row 1"), or `findIndex` is interchangeable with
`some()` + a hardcoded `row 0` and no test notices.

## 5. Rev 2 — sweep enumerated, then the DISPOSITION diverged from it

Rev 2 fixed the sweep axis (§1) and correctly listed the three done sites. It then chose
**all-or-nothing rejection** (one bad row → `return []`) while all three enumerated
siblings **skip the bad row**: `quiz-session-queries.ts:48-51` `.filter((id): id is string)`,
`study-queries.ts:90-96` `.filter((r): r is StudyQuestionRow)`, `lookup.ts:145-157`
`for (...) { if (...) continue }`. `lookup.ts` is the near-twin — same
`{topic_id, subtopic_id, n: number|string}` counts shape from the sibling RPC
`get_filtered_question_counts`, same count-map consumer — and it guards `n` with
`Number.isFinite(Number(r.n))`, not the plan's `/^\d+$/`.

Cost of the divergence is user-visible: every consumer filters `questionCount > 0`, so
rejecting the payload blanks the WHOLE picker instead of dropping one subject's count.
The plan's own Risk 2 concedes this is "the maximal case of that same harm" — i.e. it
knew, but justified only against the RPC-error path, never against the three siblings it
had just enumerated.

**Check to run next time:** when a plan enumerates prior art, diff the plan's *disposition*
against that prior art, not just its *shape*. Getting the guard shape right while inverting
what the guard DOES is the failure mode a shape-only pattern-scan passes.

## 6. Deferred-issue acceptance scope narrower than the enumeration

Sweep enumerated `app/app/internal-exam/queries.ts:108,143`; the planned issue's
acceptance read "every `rpc<T[]>` read in `lib/queries/`" — dropping those two on a path
prefix. Separately the enumeration missed `lib/queries/load-session-questions.ts:91`
(`rpc<QuizQuestionRow[]>`, per-row consumed at L104-120, no `Array.isArray` at all — only
`!data?.length`) and did not adjudicate `lib/consent/check-consent.ts:11` (genuinely
exempt: `Array.isArray` + truthy-only reads).

Also: Apply-vs-Defer condition 3 was argued as "no design decision this PR establishes" —
backwards. This PR *does* establish the predicate shape/disposition; the defer survives
only on the OR-branch ("systems the orchestrator hasn't loaded context for").

**Check to run next time:** re-read a deferral's acceptance sentence against the
enumeration that produced it — a path prefix silently narrows a cross-directory list.

## 10. Rev 4 — "Mirrors <file>:<line>" cross-ref both mis-numbered AND behaviourally false

Rev 4 replaced §8's asymmetric `n` guard with a coerce-then-`Number.isFinite` form and
commented it `Mirrors lookup.ts:152`. Both halves fail: `lookup.ts:152` is `count += n`
(the accumulator); the guard is L150-151. And lookup.ts has **no `typeof` gate** —
`const n = Number(r.n); if (… || !Number.isFinite(n)) continue` — so it ACCEPTS `n: null`
(`Number(null)` is 0, finite). The plan's predicate adds
`(typeof row.n === 'number' || typeof row.n === 'string')` and REJECTS it. The comment's
own next clause ("the typeof gate is what excludes null/undefined, `Number(null)` is 0,
which would otherwise pass") *describes the addition* and then calls the result a mirror —
self-contradictory in one comment block. Validation → Patterns recorded only that the
guard *shape* matches; the strictness divergence from the named near-twin went unrecorded.

**Check to run next time:** a plan that cites `<file>:<line>` as its pattern source — open
that exact line. Fixing an asymmetry by adopting a sibling's form (§8) is the moment the
"mirrors X" claim gets written, and it is written from the shape, not from a re-read.

## 11. Post-fix §3 line budget re-counted from the OLD body

Plan carried "~26 lines (§3 cap 30)" from rev 2 while revs 3-4 added a 3-line comment
block, a 2-line rationale comment and expanded one `console.error` from 1 line to 4
(biome `lineWidth: 100` forces the break: the single-line call is 110 chars). Formatted
body is **exactly 30** — compliant (§3 flags "longer than 30"), zero headroom, and the
plan asserts 4 lines of margin that do not exist. Code-only (comments excluded) is ~25,
which is where the stale number came from.

**Check to run next time:** when a plan revises a body across rounds, re-count the final
body at the project's formatter width — don't carry an earlier round's number forward,
and state whether the count includes comments.

## Verified-correct claims (do not re-flag)

- All 12 counts fixtures in `quiz-subject-queries.test.ts` pass the proposed predicate
  (all four keys present; `subtopic_id` string-or-null; `n` number-or-digit-string).
  L66 also sets a `{ data: [], error: null }` default, so unset-mockRpc tests stay silent.
- `quiz-subject-queries.test.ts:386` genuinely lacks the `console.error` spy the other
  four degrade tests (L370/L400/L419/L439) have — the plan caught this.
- The four planned new test cases trip none of the 7 regexes in
  `.claude/hooks/check-test-title-leakage.mjs` L36-87.

Added rev-2 round (2026-08-11), all re-verified against source:
- The two-branch guard type-checks clean under `tsc --strict`: `Array.isArray` narrows
  `QuestionCountRow[] | null` to the array in the true branch, so `return data` matches
  `Promise<QuestionCountRow[]>` with no cast. Same for the importer's
  `let raw: unknown` + try/catch (`unknown` includes `undefined`, so TS2454 does not fire).
- `main()` (`import-vfr-rt-content.ts:322`) parses at L343 and makes its first DB call at
  L447; module scope only reads env + `createClient` (no I/O). Verification step 5 cannot
  write rows. `main().catch` at L489 does `console.error(err)`, so the message surfaces.
- `apps/web/tsconfig.json:9-16` excludes `scripts`; biome DOES lint it
  (`npx biome check apps/web/scripts/import-vfr-rt-content.ts` → clean, not gitignored) —
  but biome does no type analysis, so it is a lint gate, never a type gate.
- `vitest.setup.ts` is one jest-dom import — no console trap, so new `console.error` calls
  cannot fail an unrelated test.
