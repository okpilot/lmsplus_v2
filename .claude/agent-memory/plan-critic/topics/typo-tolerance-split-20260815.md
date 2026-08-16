# Answer typo-tolerance migration split + importer prod-write (2026-08-15)

Plan under review: split `20260815000100_answer_typo_tolerance.sql` (879L, 5 fns) into migs 158/159/160,
change grading semantics for all four text graders, add a `--sync-content` prod-write path.

## 1. Denylist patching an over-broad threshold

`answer_matches` tiers the per-token Levenshtein budget: `len(wb)>=8 → 2 edits`, `>=5 → 1`, else 0,
whole-answer budget 2. The plan proposed a 10-pair semantic-opposite denylist to patch the 2-edit tier.

Simulated the algorithm in Python over both content JSON files:
- **Motivating eval case survives at a 1-edit cap.** `airfiled`/`airfield` is an adjacent transposition;
  the body's own swap-reduction already turns d=2 into d=1. The 2-edit tier is not what saves it.
- **Zero legitimate corpus variants are lost by dropping the 2-edit tier.** Every real accepted
  spelling variant in Part 1 + Part 2 (`Aerodome`/`Aerodrome`, `Meteorlogical`/`Meteorological`,
  `Organisation`/`Organization`, `Manoeuvering`/`Manoeuvring`, `Whiskey`/`Whisky`, `Juliet`/`Juliett`,
  `Maneuvering`/`Manuevering`) is within 1 edit after swap reduction.
- **The 2-edit tier admits an unbounded class the 10-pair list cannot enumerate** — every `un-`/`in-`/
  `de-`/`dis-` prefix negation at len≥8: `serviceable`/`unserviceable`, `available`/`unavailable`,
  `restricted`/`unrestricted`, `correct`/`incorrect`, `permitted`/`unpermitted`, `approved`/`unapproved`,
  `cleared`/`uncleared`, `advisable`/`inadvisable`, `activated`/`deactivated`,
  `pressurised`/`depressurised`. All accept at tier2, all reject at a 1-edit cap.
- **2 of the plan's 10 entries are dead** — `inbound`/`outbound` (d=3) and `climbing`/`descending`
  are already rejected by distance, inflating apparent coverage.

Lesson: when a tolerance plan proposes an enumerated exception list, simulate the algorithm over the
real corpus first. If no legitimate input needs the wide setting, the SETTING is the bug.

## 2. GRANT precedent claimed but not read

Plan: `GRANT EXECUTE ON FUNCTION public.answer_matches(text,text) TO anon, authenticated, service_role`
"matching `normalize_answer`'s precedent". Both `20260610001100` and `20260623000700` grant
**`authenticated` only**. The same migration file REVOKEs its two `_grade_record_*` helpers
`FROM PUBLIC, anon, authenticated` with the rationale "the dispatcher calls these as the postgres
owner" — `answer_matches` is called identically.

Also: Postgres grants function EXECUTE to PUBLIC by default, so a new `public.` function is already
anon-callable via PostgREST with no GRANT at all. "No GRANT line" is not "not exposed"; only REVOKE is.

No answer oracle: both args are caller-supplied and the body reads no table.

## 3. levenshtein's 255-char hard limit

Verified: `SELECT extensions.levenshtein(repeat('a',260),'airfield')` →
`ERROR: levenshtein argument exceeds maximum length of 255 characters`.
`answer_matches` has no length guard; `check-non-mc-answer-schema.ts` / `batch-submit.ts` cap
`responseText` at `.max(500)`. A 256–500-char single token with no digits therefore raises inside the
grader instead of returning false — aborting the whole `submit_vfr_rt_exam_answers` batch.
Execution-only: clean `supabase db reset`, clean `tsc`, invisible to structural grep.

## 4. Split verification and partial application

- "Verbatim copy verified by diffing extracted bodies" cannot see the REVOKE/GRANT/COMMENT statements
  BETWEEN bodies (source lines 138, 215, 569, 879). Use `cat 158 159 160 | diff - <original>`.
- The plan's Risk 1 (ordering) is mis-framed: plpgsql resolves at execution, and mig 101's own header
  documents mig 100 creating a caller before its helper. The real risk is PARTIAL application leaving
  some graders fuzzy and some exact — and `supabase db reset` is all-or-nothing, so it can never
  exhibit it. Direction matters: 160 unapplied leaves VFR RT stricter (safe); 159 unapplied splits
  practice-check from batch-submit for the same answer, which is exactly what D56 forbids.
- Credit: putting the extension assertion in the FIRST file (158) means a failed assertion blocks
  159/160 too, so the assertion itself cannot create a partial state.

## 5. `--sync-content` keying

Plan matches rows by `(topic, question_number)`. The DB's guarantee is
`idx_questions_bank_number UNIQUE (bank_id, question_number) WHERE deleted_at IS NULL AND
question_number IS NOT NULL`, and the sibling `insertIfMissing` keys on `bank_id + question_number +
deleted_at IS NULL`. `topic` is not the uniqueness scope. Also cited column `explanation`; the real
column is `explanation_text` (`packages/db/src/types.ts` `public.Tables.questions.Row`). And
dialog_fill canonicals live in `blanks_config`, not `canonical_answer`, so the mode silently no-ops
on Part 2 content while reporting success.

## 6. Verified-correct parts of the plan (don't re-flag)

- A3's probe: `to_regprocedure('nosuchschema.levenshtein(text,text)') IS NULL` → soft-NULL confirmed,
  no throw on a missing schema. `RAISE EXCEPTION` in a `DO` block matches mig 101's locale-guard
  precedent.
- `PARALLEL SAFE` on `answer_matches` is legitimate: `extensions.levenshtein` and
  `public.normalize_answer` are both `proparallel = 's'`.
- D1's vacuity analysis is correct — the digit rule sits BEFORE the length floor, and every existing
  fixture token is ≤4 chars so `lim=0` rejects them with the digit rule deleted. The replacement
  fixture `answer_matches('12551','125.50')` is non-vacuous (`normalize_answer` strips the dot →
  two 5-char digit tokens, 1 edit apart, `lim=1`).
- v2: `key={question.id}` IS on `DialogFillInput` (`answer-input-controls.tsx:45`) and the hook
  documents the remount contract (`use-dialog-fill-input.ts:69-70`) → the useState-vs-derived SKIP
  holds on the merits. No Stream-B file collision (B1→`content-assertions.ts`,
  B6→`dialog-fill-content.ts`). Stream D has no Stream-C dependency. All of C1/C2/I1-I14/2 BLOCKING/
  2 WARNING/doc-count map to a concrete v2 item.

## 7. v2 findings — the disposition TABLE is where deferral hides

A "zero deferrals" plan pushes the unfinished work into one-line rows of a SUGGESTION table. Each row
reads terminal; none carries a stream, a file, or a test. Simulate every APPLY row the same way you'd
simulate a code change:

- **A mechanical refactor sold as a bug's mechanism.** "scope `unanchored` per-blank (this is the
  #1192 mechanism)". Enumerated the corpus: 5 items declare `unanchored`; 4 hold exactly ONE recall
  blank; the 5th (DLG-35) holds two and its declaration argues BOTH by name. So the "exempts sibling
  blanks" hazard is realised NOWHERE, and per-blank scoping leaves DLG-35 passing on the blank-0
  claim the plan itself says the eval falsified. Count the affected rows before believing a
  mechanism claim.
- **A new gate with no corpus cleanup self-blocks.** "add a corpus-gate assertion rejecting
  normalisation-identical synonyms" — 15 such pairs verified present, and
  `dialog-fill-content.test.ts:428` runs the validator over all 50 items. The gate fails on first run.
  Ask: does the artifact the new assertion guards currently PASS it?
- **A tolerance/parity APPLY that contradicts an in-repo prohibition the same branch wrote.**
  "R3 must use the same tolerance as `answer_matches`" vs `normalize-answer.ts:2-5`: "so do NOT
  reimplement matching here. This copy exists for the authoring corpus gate (R3)."
- **A SKIP argued on a distinction the normaliser erases.** `125,5` skipped because "`125,5` ≠
  `125.50` is a real distinction" — `normalize_answer` strips BOTH `.` and `,`, and the corpus
  already carries `125,50` and `125.50` as the same normalised string. The real merits reason is
  digits-exactness, not the separator. Also a scope argument ("content authoring") is a DEFER, not a
  SKIP.
- **A doc-count literal fixed in one stream and invalidated by another.** E1 sets `plan.md:5` to 378
  from the branch's current 8 added integration tests; Stream D then adds more to the same file.
  Order the count fix AFTER the stream that changes the count.
- **A partially-specified SQL edit is inert.** A4b adds `a := coalesce(normalize_answer(...))` but the
  body reads `p_norm_response` three more times (`:44/:45/:47`) and `a` is not in the DECLARE list
  (`:39`). Also invalidates the function's own `COMMENT` (`:80-81`, "Left arg is already normalised").
- **A threshold change that fixes one header line and leaves its sibling false.** A5 retires the
  `depart/report` justification but leaves `airfiled/airfield = 2 at len 8 -> inside the budget`
  (`:22`), which becomes false — that pair passes only via the swap reduction (`:63-70`).
- **A "falls out of X" disposition that only half-closes.** `data-testid` as production selector:
  C3 removes the `dataset.testid` lookup but `querySelectorAll('input[data-testid^="blank-"]')`
  (`dialog-fill-input.tsx:63`) still drives production focus.
- **An "decide during execution" branch is not a terminal disposition.** A4 leaves the
  `authenticated` GRANT open while D1 adds more direct `answer_matches` callers into that branch.

## 8. v3 stability round — stream/file partition + renumber PRESERVE enumeration

**Stream partition is by TOPIC, file collision is by PATH.** v3 filed two new items
(dead `const shapes` :425; R7 untrimmed `[atc]` test :392/:397) under "STREAM C — runner UI"
because they are *behavioural nits*, while their file `apps/web/scripts/dialog-fill-content.ts`
is squarely STREAM B ("importer, `apps/web/scripts/`"), which already held two items in it
(R7 JSDoc :353-372; `assertMarkerBlankBijection` :146-177). Only constraint declared was
"C runs AFTER E4" — B and C were unsequenced, so parallel dispatch writes one file twice, and
B6's extraction at :146-177 shifts every C citation below it. The plan *did* check for
collisions ("No collision with B1: different file") — but only WITHIN its own stream.
Recipe: before approving a multi-stream plan, invert it into a file→{items} map and flag any
file whose items span 2+ streams with no stated ordering. Same plan hit it twice
(`docs/plan.md`: A2 :1455/:1467, B1 :1446, E1 :5 across three streams).

**Renumber PRESERVE sets get enumerated from the OBJECT, not the NUMBER.** v3's per-citation
renumber rule was correct, but its PRESERVE list was built by finding citations that name
`answer_matches`. `mig 142` is *also* the Discovery `get_study_questions` whitelist, so
`grep -rn "mig 142"` returns 4 in-tree correct citations the list never mentions
(`docs/decisions.md:863`, `:865`, `docs/database.md:2025`, `:2035` ×2) — two of them inside
`docs/database.md` *between* CHANGE anchors :1988 and :2822. Risk register still claimed
"CHANGE/PRESERVE sets enumerated". Recipe: grep the migration NUMBER first, then partition the
full hit list into CHANGE/PRESERVE; never enumerate from the object being moved.

## 9. Round-4 residue — the ownership TABLE has the same blind spot as the streams it fixes

The v3 fix for §8 was an "EXECUTION ORDER + FILE OWNERSHIP" table naming three contended
files. It was built from **stream globs**, so it reproduced the defect one level up: two items
edit a file that lies outside their OWN step's `Owns` row.

- `packages/db/src/__integration__/rpc-check-non-mc-answer.integration.test.ts` — A2 (`:464`
  renumber) and A4 (service-role move of the two `studentClient.rpc('answer_matches')` calls)
  are step 2, whose `Owns` row lists only migrations + docs + `normalize-answer.ts`. D1 edits
  the same file at step 5.
- `…/quiz/session/_components/quiz-main-panel.test.tsx` — literally inside step 4's
  `_components/**` glob, but its only item (D2) is step 5. Assigned to neither.

Serialised order means no concurrent write, so a "does any file appear in two parallel steps?"
check passes. The live failure is **dispatch scope**: an agent handed step 2's `Owns` row does
not touch `packages/db/**`, so the A2 renumber is silently dropped.
Recipe: invert to file→{item} and assert every item's file is inside ITS OWN step's `Owns`
row — not merely that no file spans two *concurrent* steps.

## 10. Contract-retirement items enumerate the CODE statements and miss the DOC prose

A4b retires `answer_matches`' asymmetric contract and, after round 3, rewrites both SQL-side
statements (`COMMENT` :80-81, in-body comment :41-42) — but `docs/database.md:2918-2920`
states the same retired contract in prose ("The left argument is **already normalized** by the
caller and the right is **raw**; this asymmetry exists so…") and is in no item. A6's
`docs/database.md` drift sweep names `:1168`, `:1989`, `:2901`, `:2916` — it stops one
paragraph short. Note the plan's own A5-docs item does this correctly for the tolerance tier
(four surfaces, all listed); the contract change did not get the same treatment.
Recipe: for any retired contract/claim, grep the CLAIM's distinctive phrase repo-wide
(`already normali[sz]ed`, `left arg`) — do not enumerate from the file being edited.
