# Derived-content-id redesign + #1207 CR-round plans (2026-08-17)

Detail behind the four `2026-08-17` tracker rows in `MEMORY.md`.

## 1. A DERIVED-value redesign specifies only ONE input domain

Plan rev 3 replaced author-supplied ids with `deriveContentId = prefix + sha256(normalize(text))`.
`normalizeForId(text)` is a STRING function (trim + collapse whitespace + lowercase). But diagram
ZONE ids were to derive from **coordinates** — four floats — and the plan never said what string is
hashed.

Why it bites here: the real values are computed, not authored. `rwy-2709-layout.ts` builds zones via
`midpoint()` then `center - ZONE_W/2`, yielding `y: 0.10999999999999999`, `x: 0.02500000000000001`,
`x: 0.8250000000000001`. So `JSON.stringify` vs a template literal vs `toFixed(n)` each produce a
different id, and `toFixed` would silently merge distinct zones.

It also undercuts the plan's own forward claim that "a later DB CHECK can recompute and compare":
that needs JS float→text and Postgres jsonb-numeric→text to agree exactly at 17 significant digits.
Nobody checked.

**Check to run:** for every input domain feeding a derivation, ask what STRING is hashed — then read
the ACTUAL values, don't assume they are the clean literals the source appears to show.

## 2. Deriving an id from a VISUAL constant

After the change, `ZONE_W`, `ZONE_H` and `RWY_2709_PATH_POINTS` stop being cosmetic: nudging any of
them rewrites all 9 zone ids and orphans every stored `diagram_config.answer`. The plan's Risk 4
covered only "changing `normalizeForId` later", never the INPUTS.

The guarding test makes it worse — `rwy-2709-layout.test.ts:36-45` and `:53-63` assert only bounds
and non-overlap, i.e. they explicitly PERMIT the geometry to move.

**Check to run:** when a plan derives a persisted value from a constant, list what else feeds the
hash and ask which of those is free to change today. That set is the real Risk row.

## 3. "Existing tests name specific values" — grep before believing it

Plan §5 said assertions in `rwy-2709-layout.test.ts` / `registry.test.ts` "naming specific ids must
move to deriving them". An exhaustive grep of all 21 id literals returned only `rwy-2709-layout.ts`
itself and `seed-vfr-rt-training-eval.ts:405-413`. Both test files already derive ids from the
exported arrays — the stated work did not exist.

And the real work was missed: `rwy-2709-layout.test.ts:110-130` ("no zone id textually matches its
own leg/turn name") becomes UNFALSIFIABLE under a hex id alphabet — no hex string can contain
`upwind` / `crosswind` / `downwind` / `base` / `final`, since each carries a non-hex letter. Delete
the mechanism and it still passes: the `code-style.md §7` vacuity defect, introduced by the plan.

**Check to run:** grep the literals. A plan's test-impact claim is a hypothesis, and when it is
wrong the correction is rarely "less work" — it is "different work you have not budgeted".

## 4. #1207 CR-round plans (same date, different work)

- An extract-for-line-budget item moved a `console.warn` and never grepped for the test asserting
  that exact STRING. Worse: the cited precedent helper uses a `[functionName]` prefix while the
  in-place string uses a `[component]` one, so "mirrors X's shape" silently rewrites the literal.
  (`quiz-recovery-banner.test.tsx:324` vs `quiz-session-handoff.ts:33`.) Grep the moved literal and
  pin the exact string in the plan.
- A root-guard rewrite copied from a sibling added an EXTRA `Array.isArray` clause the sibling
  lacks, which a later field check already rejects — the clause is dead AND the plan's own new test
  for it is vacuous, the same §7 defect that plan flags elsewhere. Diff the sibling clause-by-clause
  and simulate the added clause against the clauses BELOW it.
