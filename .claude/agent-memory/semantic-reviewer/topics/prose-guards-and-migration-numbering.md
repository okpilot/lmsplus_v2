# Detail for three tracker rows opened 2026-08-15 (`chore/proportionate-review-gates` PR sweep)

Referenced from `MEMORY.md`. Keep rows terse there; detail lives here.

## 1. Machine guard keyed on a PREFIX of free-text prose

`apps/web/scripts/import-vfr-rt-content.ts` gated the production content import with
`FORCE_REMOTE && typeof file.status === 'string' && file.status.startsWith('PILOT')`.

`status` is a human-authored paragraph in the content JSON. Commit `6abd4456` rewrote it to start
with `"51 questions across the guide's …"`, so the guard became permanently false. The same string
still ends with *"the importer refuses --force-remote while this string starts with PILOT"* — a
self-referential and now-false claim. Two further surfaces kept asserting the guard was live: the
code comment directly above it, and `docs/plan.md` ("status still `PILOT` … so prod is untouched").

**Review rule:** for any `startsWith` / `includes` / regex guard, read the CURRENT value of the
field it tests — never the comment or the doc. A guard predicate belongs on a STRUCTURED field
(`lifecycle: 'pilot' | 'released'`), fail-closed when absent or non-string, with a unit test.
The importer had no test file at all, which is why an unrelated content edit could disable it.

Related: the same field also carried a stale count ("51 questions", "all 52") against an actual
pool of 50 — free-text prose accumulates drift in every direction.

## 2. Migration-number collision in the header comment

`supabase/migrations/20260815000100_answer_typo_tolerance.sql` opens `-- Migration 142`. The
sequence is at 157 (`20260809000100` = "Migration 157"), and 142 is already
`20260629000700_get_study_questions_whitelist_discovery.sql`. `docs/database.md:817` cites the real
mig 142 for the Discovery answer-oracle guard, so the same doc now gives "mig 142" two meanings.

The wrong number propagated to: the migration header + `COMMENT`, `docs/database.md` (new
`answer_matches` section), `docs/decisions.md` Decision 56 (×3), `docs/plan.md` (×2), and
`apps/web/lib/grading/normalize-answer.ts`.

**Review rule:** derive the next number with `grep -h '^-- Migration' supabase/migrations/*.sql`
and take max+1 — never from the branch's own recent files or from the plan text. Note there is a
pre-existing duplicate at 143 (`questions_ordering_type` and
`get_filtered_question_counts_question_type`), so max-by-count is not a substitute for max-by-grep.

## 3. New-guard test that a coarser pre-existing rule already satisfies

Sibling mechanism of the PROMOTED fallback-coincidence row (`code-style.md` §7).

`answer_matches` (mig `20260815000100`) enforces Decision D56: *any token containing a digit must
match exactly*. All four committed `it.each` cases used digit tokens of ≤4 characters
(`1014`/`1015`, `32`/`33`, `6502`/`6503`, `1180`/`1185`). The function's *separate* length floor
(`length(wb) < 5 → lim 0`) rejects every one of them regardless, so all four pass with the digit
guard deleted. The invariant the feature "must never" violate had zero real coverage.

**Disproof technique:** re-evaluate each fixture with the new guard mentally removed. If the
expected result is unchanged, the test is vacuous with respect to that guard. Pick a fixture only
the NEW guard rejects — here `answer_matches('12551', '125.50')` (a real pool frequency: 125.50 vs
125.51 MHz, both normalise to 5-char digit tokens 1 edit apart, so the length floor admits them and
only the digit rule rejects them).

> Rows 1–3 above were all FIXED in `365730e2` (structured `lifecycle` field; renumber to 158/159/160;
> the `12551`/`125.50` fixture). Kept as the mechanism record. The PR-level sweep then found rows
> 4–5 below, which per-commit review structurally could not see.

## 4. Comment names a rule or file location a LATER commit on the same branch retired or moved

Three instances on one branch, three different commits, all invisible per-commit because the
comment and the change that falsified it landed separately:

- `apps/web/scripts/dialog-fill-content.ts:279` — `assertRecallBlank`'s docblock opens *"R2 + R3 for
  one recall blank. R2 constrains the CANONICAL only…"*. Written in `35e4ee25`; `6c07472f` retired
  R2 and R4. The same FILE contradicts it twice (module docblock "R1/R3/R5/R6/R7", rule list "R2 …
  and R4 … were REMOVED"), so the contradiction is intra-file — a grep for "R2" finds it.
- `apps/web/app/globals.css` header — *"dialog_fill blank inputs (dialog-line.tsx). The inline
  `width` there is a character-count estimate"*. Written in `79cc72a7`; `9e651aaf` extracted
  `DialogBlank` and moved the estimate there, publishing it as the custom property `--blank-w`
  *specifically so it is not an inline `width`*. `9e651aaf` edited LATER paragraphs of the same
  comment for the extraction and left the header.
- `.claude/run-log.md:37` — *"D56, mig 142 `answer_matches`"*, missed by `365730e2`'s own
  "renumbered per-citation across 11 surfaces" sweep. `mig 142` is the Discovery whitelist.

**Review rule:** when a commit RETIRES a named rule, RELOCATES a symbol, or RENUMBERS an identifier,
grep the retired/old token across the whole tree, not just the files the commit touches — and when
a commit edits *part* of a multi-paragraph comment, re-read that comment end-to-end. A partial
comment update is the tell.

## 5. ~~A doc asserts a prod-verification result a later commit's rationale contradicts~~ — FALSE POSITIVE

**Withdrawn 2026-08-15 (final pre-push sweep). The chronology was inverted; do not re-raise.**

The original finding read: `.claude/run-log.md:35` (`864936ca`) records the Part 1 prod import as
*"verified them by read-back (40/40 status=active, **canonical matches file**…)"*, and `a58e4d49`
*then* changed CAVOK's canonical — so prod must be stale, as `365730e2`'s `--sync-content` blurb
("**which the insert-only importer cannot reach**") asserted.

`a58e4d49` is `2026-08-11 16:10:27 +0200`; `864936ca` is `16:22:42`. The edit came FIRST, and
run-log row 35 is that same run: it records the CAVOK swap *and* the import *and* the read-back in
one entry. So "canonical matches file" was true when written and is still true — confirmed by the
read-only prod probe in `070dca8f`, which found canonical, synonyms and explanation all matching.

The genuine defect was the OTHER half: `365730e2` asserted prod staleness nobody had checked and
scoped a production-WRITE path around it. That is already captured — learner tracker "Reviewer/CR
finding's premise accepted w/o verification, later disproven" (count 3, PROMOTED →
`agent-workflow.md § Finding Validation`, "*production is in state X* → probe production
read-only"), and the importer header was rewritten in `070dca8f` to say so explicitly.

**Lesson kept:** when two surfaces appear to contradict, order the COMMITS by timestamp before
concluding which falsifies which — a same-run edit-then-verify reads exactly like a
verify-then-invalidate in a flat file listing.
