# Tasks Document — VFR RT Training (Practice Drills)

> **Build slowly, eval continuously.** Each phase ends at a manual-eval checkpoint and leaves the app coherent. Each phase gets its own plan-validation + plan-critic + user approval before code; impl-critic + post-commit fleet after each commit.
> Reuse-first: NEW UI = route shell, five input renderers, five report sub-renderers. Everything else extends shared quiz components.
> Migrations mirror `packages/db/migrations/0NN_*.sql` ≡ `supabase/migrations/<ts>_*.sql`; re-confirm next-free slot at implementation. SQL ≤ 300 lines/file.
> **Incorporates plan-critic rounds 1 + 2a + 2b** — cross-cutting corrections captured once below; per-phase tasks reference them.

## QA-hardened implementation notes (rounds 1–2 — binding for every phase that touches these)

These were repeatedly mis-assumed; each applies across multiple phases. Treat as MUST.

- **N1 — RETURNS TABLE changes need DROP+recreate, not `CREATE OR REPLACE`.** Applies to **`get_quiz_questions`** (Phase 2.1) and **`get_report_correct_options`** (Phases 4.1/5.2/6.1). `DROP FUNCTION IF EXISTS <name>(<args>)` then recreate (precedent `20260327000059_shuffle_answer_options.sql:5–8`). **Enumerate ALL existing return columns verbatim + additions** (`get_quiz_questions` has 12: id, question_text, question_image_url, options, subject_code, topic_name, subtopic_name, lo_reference, difficulty, explanation_text, explanation_image_url, question_number). **Update the TS cast at the caller** (`get_quiz_questions` → `lib/queries/load-session-questions.ts:6–14,54–62`; `get_report_correct_options` → `lib/queries/quiz-report-questions.ts:115–116`) or new fields arrive at runtime but are silently inaccessible.
- **N2 — `batch_submit_quiz`: make MC guards conditional AND refactor to per-type helpers (do NOT inline more branches).** Latest body `20260619000250:169–204`: the `selected_option IS NULL/''` RAISE, the MC option-membership loop, and the `correct_option IS NULL` RAISE all run per-answer with no type branch → they reject every non-MC answer. Make all three **conditional on `question_type = 'multiple_choice'`** (mirror the `CASE question_type` branching in `submit_vfr_rt_exam_answers` `20260610001000:155–200`). **Cap tension:** the body is already **306 lines, at the 300 cap (code-style §1)**, and a function is a single object — splitting *migration files* does NOT shrink it (each DROP/REPLACE must contain the whole body). **Resolution: extract per-type grade-and-record logic into helper SQL functions** (one per type, each its own migration file ≤300 lines), and reduce `batch_submit_quiz` to a thin dispatcher. Phase 2.3 adds the dispatcher refactor + `short_answer` + `dialog_fill` helpers; Phases 5/6 each add their type's helper in its own migration. (Signature is unchanged → `CREATE OR REPLACE` is fine for the dispatcher; N1's DROP rule applies only to the RETURNS-TABLE functions.)

  **DEVIATION (Phase 2.3 implementation, 2026-06-21 — ratified by plan-critic security + contract lenses; see Decision 47):** the helpers are SECURITY DEFINER + `SET search_path` but do **NOT** each carry the full auth/owner/mode guard set. Instead the dispatcher remains the **single authorization boundary** (all auth/owner/mode guards run once at entry, as today) and each helper is made genuinely internal via an explicit **`REVOKE EXECUTE ON FUNCTION <helper>(...) FROM PUBLIC`** (granted to nobody). **Why the change:** `CREATE FUNCTION` grants EXECUTE to PUBLIC by default, so the original "each helper SECURITY DEFINER" plan — without a REVOKE — would leave a `p_student_id`-taking writer to immutable answer tables directly callable via PostgREST (a cross-user forge primitive). Re-running the full guard set inside each helper (the original text) is the alternative, but duplicates surface + re-checks per answer; the REVOKE-from-PUBLIC internal-helper model is DRYer and keeps one authz boundary. The helpers KEEP their per-type **correctness** guards (MC option-membership, short canonical-NULL, dialog blank-index). This introduces a new repo pattern (no prior `REVOKE ... FROM PUBLIC`); an integration test asserts each helper returns `42501` to a direct authenticated PostgREST call.
- **N3 — Client answer payload widening (paired with N2).** `quiz/actions/batch-submit.ts`: Zod `selectedOptionId: z.string()` → `.optional()`, add `responseText?`/`blankAnswers?`/`order?`/`labels?`; fix the hardcoded `selected_option: a.selectedOptionId` map at `:38–42`.
- **N4 — Report `.select()` string must fetch the new columns.** `lib/queries/quiz-report-questions.ts:65` is `'question_id, selected_option_id, is_correct, response_time_ms'` — **add `response_text, blank_index`** (type-widening `AnswerRow` at `report-question-builder.ts:3–9` alone is silent; the column is never fetched otherwise). Applies to Phases 4/5/6.
- **N5 — localStorage validators drop non-MC answers on refresh.** `quiz/session/_utils/quiz-session-validators.ts` `isValidDraftAnswer` (requires non-empty `selectedOptionId`) and `isValidFeedbackEntry` (requires non-empty `correctOptionId`) reject the widened unions → in-progress non-MC answers silently lost on tab refresh. **Widen both validators + their `.test.ts`** in Phase 3.2.
- **N6 — New answer-key columns need NO explicit REVOKE.** After mig 094's `REVOKE SELECT ON questions FROM authenticated` + explicit column GRANT (`20260610000100:130–154`), any column added later by `ALTER TABLE ADD COLUMN` is **not** auto-granted to `authenticated`. So `ordering_items` / `diagram_config` are already blocked from direct PostgREST SELECT. **Do NOT add them to any GRANT SELECT expansion.** (No "confirm at phase" — this is settled.)
- **N7 — Multi-row answers + report pagination (resolve in Phase 4, the first study-report exposure).** `quiz_session_answers` answer-row counts differ by type: `dialog_fill` already uses **per-blank rows** (existing production pattern — `submit_vfr_rt_exam_answers` `20260619000300:107,210–213` — keep it; `batch_submit_quiz` must match). `ordering` and `diagram_label` use a **single JSON row** (`response_text = JSON order / zone→label map`, `blank_index = NULL`) — NOT per-element rows. **Consequence:** the report pagination count at `quiz-report-questions.ts:43–68` is `COUNT(*)` over rows, so any `dialog_fill` session over-counts (pages-of-rows ≠ pages-of-questions). **Fix in Phase 4:** change the count + page-slice to operate on **DISTINCT `question_id`** (pages-of-questions), not raw rows. This single fix covers `dialog_fill` (Phase 4), `ordering`, and `diagram_label` (Phases 5/6) at once — do it once in Phase 4.
- **N8 — dnd-kit `DndContext` sensors for iPad.** Configure `[PointerSensor, TouchSensor({ activationConstraint: { delay: 250, tolerance: 5 } }), KeyboardSensor]` — `PointerSensor` alone fails on iOS Safari. Verify drag-start on a real iPad during eval.
- **N9 — `questions_question_type_check` is the Postgres auto-name** (inline CHECK, `20260610000100:62–63`) — drop directly, or use the DO-block `pg_constraint` lookup pattern (`095_session_answers_for_text_responses.sql:56–76`) for robustness, when widening the IN-list.
- **N10 — Preserve the §15 carve-out comment** on `get_report_correct_options`'s questions JOIN (`20260619000400:14–22`); do NOT add `deleted_at IS NULL` to the new columns' SELECT (the immutable write-once carve-out still holds).

## Phase 0 — Branch & seed (eval baseline)

- [x] **0.1 Fresh branch off `master`** — `feat/vfr-rt-training` from `origin/master` @ `55e50398`.
- [x] **0.2 Training seed `seed-vfr-rt-training-eval.ts`**
  - File: `apps/web/scripts/seed-vfr-rt-training-eval.ts`. Egmont org + admin/student (shared creds), RT bank, 10 `multiple_choice` questions under `P3_MC` (no exam_config). Idempotent. (Non-MC question types added in Phase 3; ordering/diagram fixtures added in Phases 5/6.)
  - _Eval:_ `db reset` → grant-fix → seed clean + idempotent; 10 MC RT questions present under P3_MC topic.

## Phase 1 — Dedicated page + nav + RT delisted from quiz (MC working)

- [x] **1.1 "VFR RT" nav item — with a NAMED icon**
  - File: `apps/web/app/app/_components/nav-items.ts`. Add entry → `/app/vfr-rt`.
  - **Icon is a closed union** (`nav-items.ts` + `nav-icon.tsx` `ICON_PATHS`, renders null for unknown). Either reuse an existing union member (no `nav-icon.tsx` change) OR add a new name to BOTH the union and `ICON_PATHS` in this task. Decide the exact name at plan-validation.
  - _Requirements: R1.1_
- [x] **1.2 Exclude RT from the quiz subject picker (central)**
  - File: `getSubjectsWithCounts` (the quiz-picker source) — exclude `easa_subjects.code='RT'`; co-located test asserts exclusion.
  - Note: gates ONLY the picker. Dashboard (`subject-grid.tsx`) + Progress (`subject-breakdown.tsx`) use separate sources — confirm at plan-validation whether RT should appear there.
  - _Requirements: R1.3, R1.4_
- [x] **1.3 `/app/vfr-rt` setup page reusing quiz Study config**
  - File: `apps/web/app/app/vfr-rt/page.tsx` (+ thin client wrapper). Compose `QuizConfigForm`/parts with subject locked = RT, units = the 3 parts (topics), reuse `QuestionCount`, hide subject dropdown. page.tsx ≤ 80 lines, composition only.
  - _Leverage: `quiz/page.tsx`, `quiz/_components/quiz-config-form.tsx`, `mode-toggle.tsx`, `question-count.tsx`_
  - _Requirements: R1.2, R1.5, R2.1, R2.5_
- [x] **1.4 Start practice from RT page (reuse study start)**
  - Reuse `quiz/actions/start.ts` + `start_quiz_session` (`quick_quiz`) + `get_random_question_ids` by selected part topic_ids. No-part-selected blocked. (Optional additive `p_question_types` filter to keep Phase 1 MC-only until Phase 3; default = all.)
  - _Requirements: R2.2, R2.3, R2.4_
- [x] **1.5 Reuse runner + report for RT (MC) + validate session-storage**
  - Mount `QuizSessionLoader`/`QuizSession`/report on the RT flow (direct import). Confirm MC practice end-to-end.
  - **Validate `activeSession` storage-key scheme** — if keyed by userId only, an RT + a quiz session collide; namespace per route or prevent concurrent. RT submit redirects to `/app/quiz/report` (shared report; document the cross-namespace redirect — `quiz-submit.ts:handleSubmitSession`).
  - _Eval:_ "VFR RT" in menu → page looks like quiz → pick parts+count → MC practice with immediate feedback → report; RT absent from `/app/quiz`; quiz unaffected.

## Phase 2 — Backend for short_answer/dialog_fill (G1 + grader + recording)

- [ ] **2.1 Migration — extend `get_quiz_questions` (DROP + recreate)**
  - Files: `packages/db/migrations/NNN_get_quiz_questions_types.sql` (+ mirror). **`DROP FUNCTION IF EXISTS get_quiz_questions(uuid[])` then recreate** (RETURNS TABLE change — precedent `20260327000059_shuffle_answer_options.sql:5–8`). Add `question_type` + canonical-stripped `dialog_template` ({{n}}) + per-blank positions (index-only). Do NOT add `canonical_answer`/`accepted_synonyms`/`blanks_config`. Trace latest definition first; reuse mig 105/099b strip logic. Diff new SELECT vs answer-key set.
  - **Same task:** extend `apps/web/lib/queries/load-session-questions.ts` — `QuizQuestionRow` + `Question` type + mapper to pass `question_type`/`dialog_template`/`blanks_safe` through (the ONLY app caller; else columns are discarded).
  - _Requirements: R3.4, NFR-Security_
- [ ] **2.2 Migration — non-MC per-question grader RPC (immediate feedback)**
  - Files: `packages/db/migrations/NNN_check_quiz_answer_ext.sql` (+ mirror). SECURITY DEFINER; grades short_answer (canonical+synonyms via `normalize_answer`) + dialog_fill (per-blank); returns `is_correct` (+granular), revealed canonical(s), explanation; mirror `check_quiz_answer` contract.
  - **Guard set (security.md 11c sibling audit vs `check_quiz_answer`/`submit_vfr_rt_exam_answers`/`start_quiz_session`):** auth.uid NULL→RAISE; **practice-mode whitelist `v_mode IN ('smart_review','quick_quiz')` else RAISE `unsupported_session_mode`** (mirrors mig 117 lines 73–74); active-caller gate (`users.deleted_at IS NULL`); session owner (`student_id=auth.uid()`); question-membership vs frozen `config.question_ids`; soft-delete filters; `SET search_path=public`.
  - _Requirements: R4.2–R4.5, R6, NFR-Security_
- [ ] **2.3 Migration + client — record non-MC answers at session end via `batch_submit_quiz`** _(per N2, N3)_
  - Migration: refactor `batch_submit_quiz` to a thin dispatcher + per-type helper functions (N2 — do not inline-grow the 306-line body); make MC guards conditional; `short_answer` + `dialog_fill` helpers persist `response_text`/`blank_index` rows (mig 095 cols; `dialog_fill` = per-blank rows per N7); sibling-guard audit on every new helper.
  - Client (N3): widen `quiz/types.ts:DraftAnswer` (`responseText?`, `blankAnswers?:{index,text}[]`); `quiz/actions/batch-submit.ts` Zod `selectedOptionId` → `.optional()` + new fields, fix the map at `:38–42`; `quiz/session/_hooks/quiz-submit.ts:submitQuizSession` (`:24–28`) forwards them.
  - _Requirements: R4.6_
- [ ] **2.4 Integration tests (CI-only) + plan.md count**
  - `get_quiz_questions` returns new display fields, NO answer-key cols, stripped dialog; grader correct/incorrect (short + per-blank) + ALL guard rejections (unauth, non-whitelist mode, soft-deleted caller, non-owner, non-member); `batch_submit_quiz` persists non-MC rows. Update `docs/plan.md` integration count SAME commit.
  - _Requirements: R3.4, R4, R6_

## Phase 3 — Runner renders + grades short_answer/dialog_fill

- [ ] **3.1 `ShortAnswerInput` + `DialogFillInput` (+ tests)** — shared `_components/`; ≤150 lines each; co-located tests. Dialog parser salvaged-from-#923-or-fresh (decide at plan-validation). _Requirements: R3.2, R3.3_
- [ ] **3.2 Type dispatch + answer-pipeline type surgery**
  - `quiz/session/_components/quiz-main-panel.tsx` dispatch on `question_type` (MC unchanged). Widen `quiz/types.ts` `DraftAnswer` + `AnswerFeedback` to discriminated unions; `use-answer-handler.ts` add `handleTextAnswer`/generalize (currently `handleSelectAnswer(optionId:string)`); update `answer-handler-helpers.ts:recordAnswerFeedback`.
  - _Requirements: R3.1, R3.5_
- [ ] **3.3 Non-MC immediate-feedback Server Action (+ test)** — calls 2.2 RPC; Zod discriminated-union input; co-located test (correct/wrong/per-blank/error); uniform contract with MC. _Requirements: R4.1–R4.4, NFR-Security_
  - _Eval:_ short_answer + dialog_fill display, answer, immediate correctness + reveal + explanation; MC still works.

## Phase 4 — Report renders short_answer/dialog_fill (G4)

- [ ] **4.1 Post-session canonical delivery (SECURITY DEFINER) + query extension** _(per N1, N4, N10)_
  - Decide DECISION at plan-validation: extend `get_report_correct_options` vs new RPC. If extending: its guards (owner + active-user + `ended_at IS NOT NULL`) are ALREADY correct (no change); but the RETURNS TABLE change requires **DROP+recreate** (N1) + widen the TS cast at `quiz-report-questions.ts:115–116` to a per-type union; preserve the §15 carve-out comment (N10). Add `response_text, blank_index` to the `.select()` at `quiz-report-questions.ts:65` (N4) and `question_type` + non-MC review data.
  - _Requirements: R5.4_
- [ ] **4.2 Report types + builder + `isAnswered` fix + pagination** _(per N7)_
  - `lib/queries/quiz-report.ts` — `QuizReportQuestion` → discriminated union on `question_type`; `AnswerRow` += `response_text`/`blank_index`. `lib/queries/report-question-builder.ts` — stop `correctOptionId ?? ''`; populate per type. `report-question-row.tsx:28` — fix `isAnswered` to check `response_text`/`blank_index` for non-MC (else "Not answered" regression).
  - **Pagination (N7):** change `quiz-report-questions.ts:43–68` count + page-slice to DISTINCT `question_id` (pages-of-questions), since `dialog_fill` writes per-blank rows. Add a co-located test with a mixed MC + multi-blank `dialog_fill` session asserting correct page count.
  - _Requirements: R5.1, R5.5_
- [ ] **4.3 Report row dispatch + sub-renderers (+ tests)** — `report-question-row.tsx` dispatch; keep `OptionsList` (MC); NEW `ShortAnswerReport`, `DialogFillReport` (+ tests). _Requirements: R5.2, R5.3_
  - _Eval:_ report shows P1+P2 with answer vs correct + explanation; MC report unchanged.

## Phase 5 — `ordering` type (Part 3 sequencing)

- [ ] **5.1 Add dnd-kit** — add dependency to `apps/web`; document the choice (touch/iPad) in decisions. Run `pnpm check-types --force` after the bump.
- [ ] **5.2 Migration — `ordering` type** — widen `questions_question_type_check` IN-list + `questions_question_type_columns_check`; add `ordering_items JSONB` (canonical order). Extend `get_quiz_questions` to deliver items **shuffled** (no order leak); extend grader (sequence match) + `batch_submit_quiz` (persist order) + `get_report_correct_options` (reveal order). Confirm whether `ordering_items` needs REVOKE. Integration tests + plan.md count.
- [ ] **5.3 `OrderingInput` (dnd-kit sortable) + `OrderingReport` (+ tests)**; dispatch entries in panel + report row; widen `DraftAnswer`/`AnswerFeedback`/`QuizReportQuestion` unions.
- [ ] **5.4 Seed ordering fixtures** (MAYDAY + position-report) in the training seed.
  - _Eval:_ drag-to-order MAYDAY/position end-to-end (answer → feedback → report).

## Phase 6 — `diagram_label` type (Part 3 traffic pattern)

- [ ] **6.1 Migration — `diagram_label` type** — widen the two CHECKs; add `diagram_config JSONB` (`image_ref`, `zones`, `labels`, `answer`). Extend `get_quiz_questions` to deliver image+zones+labels and **strip `answer`**; extend grader (zone→label map, per-zone correctness) + `batch_submit_quiz` + `get_report_correct_options`. Gate the mapping (REVOKE/RPC-only). Integration tests + plan.md count.
- [ ] **6.2 `DiagramLabelInput` (dnd-kit drag onto positioned zones, touch/responsive) + `DiagramLabelReport` (+ tests)**; dispatch entries; widen unions.
- [ ] **6.3 Seed 27/09 pattern** — static image asset (`apps/web/public/...`) + zones + label pool fixture in the training seed (admin authoring deferred).
  - _Eval:_ drag labels onto the drawn pattern end-to-end (answer → per-zone feedback → report).

## Phase 7 — Cleanup, tests, docs

- [ ] **7.1 Remove temporary scaffolding** (e.g. Phase-1 MC-only filter); confirm no dead code.
- [ ] **7.2 Full suite green** — unit + integration + types + biome; red-team if a trigger/RPC security path was touched.
- [ ] **7.3 Docs** — `docs/database.md` (extended `get_quiz_questions`, new grader RPC, extended `batch_submit_quiz`/`get_report_correct_options`, new types); `docs/plan.md` (phase status + final integration count); decisions (dnd-kit, `ordering`/`diagram_label` types).
- [ ] **7.4 #923 disposition note** — bespoke exam UI stays parked; timed exam returns later as exam-mode on this shared UI (inheriting all 5 types).

---

*Requirements traceability:* R1 → 1.1–1.3,1.5; R2 → 1.3,1.4; R3 → 2.1,3.1,3.2; R4 → 2.2,2.3,3.3; R5 → 4.1–4.3; R6 → 2.2,2.4; R7 → 5.x; R8 → 6.x. NFR-Security spans 2.1,2.2,2.3,4.1,5.2,6.1.
