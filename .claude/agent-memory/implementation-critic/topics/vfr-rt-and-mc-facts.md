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

## Moved from MEMORY.md 2026-08-19 (budget compaction — full text)

- **dialog_fill R7 enforces TWO mechanical things only** (`dialog-fill-content.ts` `assertRecallAnchored`): the `[atc]`-above anchor scan, and a non-empty **trimmed** `unanchored` — whose early-return is the FUNCTION'S FIRST STATEMENT, so it exempts the WHOLE ITEM, not just the unpinned blank. Nothing REJECTS an empty `unanchored`; it merely conditions the opt-out (safe direction). The "name the competing phrase" bar is UNCHECKED authoring policy. Importer and corpus sweep both call this one function — never accept "the gate passed" as evidence.
- **VFR RT INNER content ids are DERIVED, never authored** (`scripts/content-ids.ts`) — applies to `ordering_items[].id` and `diagram_config` zone/label ids INSIDE a question's JSONB; `questions.id` is a database-assigned UUID, unaffected by `ID_VERSION`. `ID_VERSION` is a PREFIX component in the return value (`${prefix}${ID_VERSION}${digest}`), NOT hashed input, so bumping it changes every derived id string while leaving the 8-hex digest unchanged. `quiz_sessions.config.question_ids` holds question ROW uuids → unaffected by a bump. But sessions that received question data with old inner ids and submit them after a re-import will get grading failures (zone_id/label_id/ordering p_item_id won't match re-derived ones). `assertNoDerivedIdCollisions` guards ORDERING ids ONLY.
- **VFR RT Part 3 MC is THREE files in ONE DB scope** — `vfr-rt-part3-mc-{numbers,emergency,posrep}.json`, all `topic_code=P3_MC`/`multiple_choice`, 20+11+5 = 36. Any importer set keyed on bank+topic+question_type spans all three; `planScope` is the union point, `--prune` the opt-in that soft-deletes. **The key-balance union is scoped DIFFERENTLY in the two gates** (test = always 36; importer = only `process.argv` files, so a single-file run early-returns under `MIN_CORPUS_FOR_KEY_BALANCE = 12`).


## Durable bullets relocated from MEMORY.md 2026-08-19 (index byte budget)

- **VFR RT importer `base` ↔ `updateReplacedRow` is an UNGUARDED coupling.** `base` = 6 keys; `updateReplacedRow` strips 5 BY NAME, keeping `explanation_text`. Nothing enforces the pair — a 7th `base` key is silently written as content by `--replace`. Stripping `bank_id` is safe; an omitted column keeps its stored value. †
- **VFR RT Part 3 MC is THREE files in ONE DB scope** — `vfr-rt-part3-mc-{numbers,emergency,posrep}.json`, all `topic_code=P3_MC`/`multiple_choice`, 20+11+5 = 36. The key-balance union is scoped DIFFERENTLY in the two gates (test = always 36; importer = argv files only). Detail: [vfr-rt-and-mc-facts](topics/vfr-rt-and-mc-facts.md)
- **VFR RT content corpus = exactly 7 files / 140 items** (`scripts/content/vfr-rt-part*.json` = the whole dir): 40/50/2/20/11/5/12. All 140 author a non-empty `explanation` (2026-08-19), so `buildRow`'s `?? base.explanation_text` fallback is unreachable today — but `short_answer` falls back to `` `${acronym}: ${canonical}` `` BEFORE base, so "resolves it from base" is over-general. Detail: [vfr-rt-and-mc-facts](topics/vfr-rt-and-mc-facts.md)
- **`supabase/config.toml:18 max_rows = 1000`. UNVERIFIED: whether PostgREST applies it to a MUTATION's returning representation** as well as to reads. `softDeleteForReplace`'s matched-vs-removed reconciliation balances only if it does; if not, the check throws AFTER the soft-delete (fails closed). Unreachable at 36/scope — hedge such comments.
- **dialog_fill R7 enforces TWO mechanical things only** (`assertRecallAnchored`): the `[atc]`-above anchor scan, and a non-empty **trimmed** `unanchored` — whose early-return is the FIRST statement, so it exempts the WHOLE ITEM. Nothing REJECTS an empty `unanchored`. Importer and corpus sweep call the SAME function — never accept "the gate passed" as evidence. Detail: [vfr-rt-and-mc-facts](topics/vfr-rt-and-mc-facts.md)
- **MC option letters vs stored ids — never accept "no surface can contradict".** `answer-options.tsx` + `report/.../options-list.tsx` letter by POSITION and mark by id (agree); `admin/.../option-editor.tsx` letters by SLOT and CAN skew on a gapped id run. Detail: [vfr-rt-and-mc-facts](topics/vfr-rt-and-mc-facts.md)
- **VFR RT INNER content ids are DERIVED, never authored** (`scripts/content-ids.ts`) — `ordering_items[].id` + `diagram_config` zone/label ids; `questions.id` is a DB uuid. `ID_VERSION` is a PREFIX, not hashed input. `assertNoDerivedIdCollisions` guards ORDERING ids ONLY. In-flight sessions break on a bump. Detail: [vfr-rt-and-mc-facts](topics/vfr-rt-and-mc-facts.md)
