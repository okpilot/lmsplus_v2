# VFR RT content + MC answer-key facts (impl-critic durable reference)

> Split out of `MEMORY.md` 2026-08-18 for budget. Verified facts — re-verify before citing
> if the referenced file has changed since.

## Derived content ids

**VFR RT content ids are DERIVED, never authored** (`scripts/content-ids.ts`):
`<kind><ID_VERSION><8 hex of sha256(normalized parts)>` — `o` ordering item, `l` diagram label
(own text), `z` diagram zone (`image_ref` + canonical index). `rwy-2709-layout.ts` holds them as
LITERALS (it reaches the client bundle; `node:crypto` is absent there); `scripts/diagram-content.test.ts`
is the pin. `normalizeForId` + slice width are a STABILITY CONTRACT — changing either orphans
stored rows unless `ID_VERSION` is bumped.

**`assertNoDerivedIdCollisions` guards ORDERING ids ONLY** (sole non-test caller
`ordering-content.ts:91`). Zone/label ids never reach it — a diagram id defect surfaces from
`assertDerivedZoneIds` / `assertDerivedLabelIds` instead. Reject any comment predicting the
wrong throw.

## MC option letters vs stored ids — the surfaces, verified 2026-08-18

`answer-options.tsx` (`LETTERS[index]`) and `report/_components/options-list.tsx`
(`String.fromCodePoint(65 + i)`) both letter by POSITION and mark correctness by
`option.id === correctOptionId`, so they cannot disagree.

**`admin/questions/_components/option-editor.tsx` CAN**: it renders a fixed
`OPTION_IDS = a,b,c,d` row grid, indexes the stored array positionally (`options[idx]?.text`),
and checks the radio with `correctOptionId === letter` (the SLOT letter). On a gapped run
(ids a,b,d / key 'd') the real answer shows under "C" unmarked while the empty "D" row reads
Correct — and saving writes `correct_option_id: s.correctOptionId` beside `options: s.options`
(`question-form-dialog.tsx`), so the key can be written to an id no option carries.
**Never accept "no surface can contradict".**

## Where key skew is visible

Not only study mode + admin — the STUDENT report too.
`lib/queries/quiz-report-questions.ts` SELECTs `options` straight off `questions`
(stored = authored order) and takes the key from `get_report_correct_options`;
`admin-quiz-report.ts` mirrors it. Only `get_quiz_questions` (mig `20260702000300`) and
`get_vfr_rt_exam_questions` (mig `20260623000600`) shuffle MC options (`ORDER BY random()`);
`get_study_questions` (mig `20260629000700`) delivers `ORDER BY ord`. Diagram ZONES ship in
stored order (`ORDER BY z.ord`); labels and ordering items shuffle.

## RWY 2709 client-bundle DCE is ASYMMETRIC

Do not let a comment say "both arrays are tree-shaken". Measured 2026-08-18: all 9 ZONE ids
survive in a client chunk as retained `rt("<zone id>",…)` calls; zero LABEL ids/texts anywhere
in `.next/static`. Cite the minified CALL FORM, never the content-hashed chunk filename.
The answer key is not client-readable (LABELS carries the pairing) — do NOT raise the index
alignment as a leak. Mechanism + the pre-fix-chunk misfire: see `commit-notes.md`.

## Part 3 MC scope + key-balance union (moved from MEMORY.md 2026-08-19)

- **VFR RT Part 3 MC is THREE files in ONE DB scope** — `vfr-rt-part3-mc-{numbers,emergency,posrep}.json`, all `topic_code=P3_MC` / `multiple_choice`, 20+11+5 = 36 numbers, disjoint prefixes (`VRT-P3-MC-` / `-EMC-` / `-PMC-`). Any importer set keyed on bank+topic+question_type spans all three. `planScope` (`replace-planning.ts`) is the union point; `--prune` is the opt-in that lets it soft-delete. **The key-balance union is scoped DIFFERENTLY in the two gates:** `mc-content.test.ts` static-imports all three (`MC_CORPORA`, hand-maintained), so its union is always 36; the importer buckets only `process.argv` files, so a single-file run unions 11 or 5 and `assertMcKeyBalance` early-returns under `MIN_CORPUS_FOR_KEY_BALANCE = 12` (`mc-content.ts:209` — CALLED, but checks nothing). Same per-invocation scoping as `--replace`'s `unaccounted`.
