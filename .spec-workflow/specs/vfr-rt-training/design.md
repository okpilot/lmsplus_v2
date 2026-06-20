# Design Document — VFR RT Training (Practice Drills)

## Overview

Add an untimed VFR RT **practice** surface by reusing the existing `/app/quiz` **Study-mode** stack (setup form → session runner with immediate feedback → report) on a dedicated `/app/vfr-rt` route, generalized to **five** question types. No new session mode (`quick_quiz` is reused); no bespoke runner/report.

Built in **small, independently manual-evaluable phases** (the product owner asked to "build carefully and slowly with continuous manual eval"). Each phase leaves the app coherent and demoable.

The five types (per the VictorOne briefing package):

| Part | Type | Status |
|---|---|---|
| 1 — Acronyms | `short_answer` | type exists (mig 094); wire into Study mode |
| 2 — Fill-in-the-blank | `dialog_fill` | type exists (mig 094); wire into Study mode |
| 3 — number transmission | `multiple_choice` | fully works today |
| 3 — MAYDAY/position sequencing | **`ordering`** | NEW type (drag-to-order) |
| 3 — traffic-pattern legs/turns | **`diagram_label`** | NEW type (drag labels onto a drawn pattern) |

`ordering` + `diagram_label` are drag-and-drop. The repo has **no DnD tooling** — **dnd-kit** is added (touch-capable; the real exam is on iPad). The traffic-pattern diagram (image + zone coordinates) is **seeded** (admin authoring is out of scope).

## Confirmed baseline (verified on `master` @ `55e50398`, with plan-critic corrections)

- `get_random_question_ids` and `start_quiz_session` do **not** filter by `question_type` — non-MC questions already enter a study session. `quick_quiz` is the study mode.
- RT's three parts ARE `easa_topics` (`P1_ACRONYMS` / `P2_DIALOG` / `P3_MC`), so "parts = topics" reuse holds. (`P3_MC` will hold MC + ordering + diagram_label questions; selection is by topic, type-agnostic.)
- `get_quiz_questions(p_question_ids uuid[])` returns 12 MC-shaped columns, **no `question_type`/`dialog_template`/blanks**. **Its only app caller is `apps/web/lib/queries/load-session-questions.ts`** (`QuizQuestionRow`, MC-only, lines 6–14/54–62) — it will silently discard any new columns unless extended in the same phase.
- **Adding columns to `get_quiz_questions`'s `RETURNS TABLE` requires `DROP FUNCTION IF EXISTS get_quiz_questions(uuid[])` first** — `CREATE OR REPLACE` cannot change return type (precedent: `supabase/migrations/20260327000059_shuffle_answer_options.sql:5–8`).
- **Study answers are recorded at session END via `batch_submit_quiz`**, NOT per question. Flow: `quiz/session/_hooks/quiz-submit.ts:submitQuizSession` builds `DraftAnswer[]` (`{selectedOptionId, responseTimeMs}` — `types.ts:88`, MC-only) → `quiz/actions/batch-submit.ts:batchSubmitQuiz` → `batch_submit_quiz` RPC. `check_quiz_answer` only returns immediate feedback and writes nothing.
- `check_quiz_answer` (latest mig `20260619000700`) is MC-only AND carries a **practice-mode whitelist**: `IF v_mode NOT IN ('smart_review','quick_quiz') THEN RAISE 'unsupported_session_mode'` (lines 73–74) — the new grader must mirror this.
- Answer-key columns are column-REVOKE-gated: `correct_option_id` (mig 111); `canonical_answer`/`accepted_synonyms`/`dialog_template`/`blanks_config` (mig 094, not in re-GRANT). Only SECURITY DEFINER RPCs read them. The new-type key columns must be gated the same way.
- Report layer is MC-only and needs real surgery (see G4): `quiz-report.ts:QuizReportQuestion.correctOptionId` is non-nullable; `report-question-builder.ts:35` sets `?? ''`; `report-question-row.tsx:28` computes `isAnswered` from `options.some(...)` (always false for non-MC → "Not answered" regression); the report's canonical reads go via direct PostgREST `from('questions').select(...)` which **cannot** read the REVOKE-gated columns.
- Nav icon is a **closed union** (`nav-items.ts` 9 names; `nav-icon.tsx` exhaustive `ICON_PATHS`, renders `null` for unknown). A new icon needs both files updated; reusing an existing name needs neither.
- `normalize_answer` (mig 101) is the shared text-normalization used by `submit_vfr_rt_exam_answers` (mig 100).
- The bespoke Phase C UI exists only on the parked `feat/vfr-rt-phase-c` (PR #923), NOT on master — reference only; nothing to delete here.

## The gaps and their fixes

### G1 — `get_quiz_questions` delivers display data for all types
`DROP FUNCTION IF EXISTS get_quiz_questions(uuid[])` then recreate, adding: `question_type` (always); canonical-stripped `dialog_template` (`{{n}}` only) + blank positions for `dialog_fill`; **shuffled** items for `ordering` (no canonical order); image + zones (positions) + label pool for `diagram_label` (no zone→label mapping). NEVER add `canonical_answer`/`accepted_synonyms`/`blanks_config`/correct-order/correct-mapping. **`load-session-questions.ts` must be extended in the same phase** (`QuizQuestionRow` + `Question` type + mapper) or the columns are discarded. (For the core-three slice, only `question_type` + dialog fields are added; ordering/diagram fields land in their phases.)

### G2 — Runner renders all types + answer-pipeline type surgery
Dispatch on `question_type` in `quiz/session/_components/quiz-main-panel.tsx`:
- `multiple_choice` → existing `AnswerOptions` (unchanged),
- `short_answer` → NEW `ShortAnswerInput`,
- `dialog_fill` → NEW `DialogFillInput`,
- `ordering` → NEW `OrderingInput` (dnd-kit sortable list),
- `diagram_label` → NEW `DiagramLabelInput` (dnd-kit drag onto positioned zones).

Required type surgery (plan-critic ISSUE 5): widen `quiz/types.ts` `DraftAnswer` and `AnswerFeedback` to discriminated unions over `question_type`; `use-answer-handler.ts:handleSelectAnswer(optionId)` is MC-only → add `handleTextAnswer`/generalize; update `answer-handler-helpers.ts:recordAnswerFeedback`. New renderers live in a shared location so both routes share one code path.

### G3 — Immediate per-question feedback + end-of-session recording
**Feedback (per question):** NEW SECURITY DEFINER RPC `check_quiz_answer_ext` (or generalized `check_quiz_answer`) grading `short_answer`/`dialog_fill`/`ordering`/`diagram_label`, returning `is_correct` (+ granular per-blank/per-zone/per-position) and the revealed key + explanation, mirroring the MC `check_quiz_answer` response. Guards (security.md 11c sibling audit vs `check_quiz_answer`/`submit_vfr_rt_exam_answers`/`start_quiz_session`): `auth.uid()` NULL→RAISE; **practice-mode whitelist `v_mode IN ('smart_review','quick_quiz')`**; active-caller gate (`users.deleted_at IS NULL`); session owner (`student_id = auth.uid()`); question-membership vs frozen `config.question_ids`; soft-delete filters; `SET search_path = public`. Text grading reuses `normalize_answer`.

**Recording (session end, plan-critic ISSUE 1):** widen `DraftAnswer` to carry `responseText?` / `blankAnswers?` / `order?` / `labels?`; `quiz-submit.ts:submitQuizSession` forwards them; **migration extends `batch_submit_quiz`** to accept and persist non-MC rows into `quiz_session_answers.response_text` / `blank_index` (mig 095 columns) — sibling-guard audit on the updated body.

### G4 — Report renders all types (deeper than first drafted, plan-critic ISSUE 4)
- Widen `lib/queries/quiz-report.ts:QuizReportQuestion` to a discriminated union on `question_type`; `AnswerRow` gains `response_text: string|null`, `blank_index: number|null` (and ordering/diagram fields).
- Fix `report-question-row.tsx` `isAnswered` to check `response_text`/`blank_index` presence for non-MC (else "Not answered" regression).
- **Name the SECURITY DEFINER canonical-delivery path:** the report's REVOKE-gated canonical reads cannot use direct PostgREST — extend `get_report_correct_options` (or a new post-session report RPC) to return type-specific keys, gated on session ownership + `ended_at IS NOT NULL`. Update `report-question-builder.ts` (no more `?? ''`).
- Row dispatch in `report-question-row.tsx`: keep `OptionsList` for MC; add `ShortAnswerReport`, `DialogFillReport`, `OrderingReport`, `DiagramLabelReport`.

## New-type data model (designed precisely at each type's phase)

- **`ordering`**: store canonical ordered items, e.g. `ordering_items JSONB` = ordered `[{id, text}]`. Delivered **shuffled** (the order is the secret; items text is not). Grade = submitted id-sequence vs canonical. Widen `questions_question_type_check` IN-list + `questions_question_type_columns_check` for the new type's column population. No column REVOKE needed if only the *order* is sensitive (delivered shuffled) — confirm at phase.
- **`diagram_label`**: store `diagram_config JSONB` = `{ image_ref, zones:[{id,x,y,w,h}], labels:[{id,text}], answer:[{zone_id,label_id}] }`. Deliver image + zones + labels, **strip `answer`** (column-REVOKE or RPC-only). Grade = submitted zone→label map vs `answer`. Seeded 27/09 left-hand pattern image as a static asset (admin authoring deferred). Widen the two CHECKs.

## Reuse map (REUSE = import/extend; NEW = author)

| Layer | Piece | Disposition |
|---|---|---|
| Nav | `app/app/_components/nav-items.ts` (+ maybe `nav-icon.tsx`) | EXTEND — "VFR RT" → `/app/vfr-rt`; **name the icon** (reuse existing union member, else extend union + `ICON_PATHS`) |
| Setup | `QuizConfigForm`, `ModeToggle`, `QuestionCount`, topic selection | REUSE — locked subject = RT, units = parts; hide subject dropdown |
| Setup data | `getSubjectsWithCounts` (quiz picker source) | EXTEND — exclude `code='RT'` centrally (only gates the picker; Dashboard/Progress use other sources — document) |
| Route | `app/app/vfr-rt/page.tsx` (+ thin client wrapper) | NEW — compose shared components scoped to RT |
| Session start | `quiz/actions/start.ts` + `start_quiz_session` + `get_random_question_ids` | REUSE (`quick_quiz`, topics = parts) |
| Question load | `lib/queries/load-session-questions.ts` | EXTEND (G1 — pass new columns through) |
| Runner | `QuizSessionLoader`/`QuizSession`/`quiz-main-panel.tsx`/tabs/`QuestionCard`/`ExplanationTab`/`CommentsTab`/`StatisticsTab` | REUSE; panel gains type dispatch (G2) |
| Answer pipeline | `quiz/types.ts`, `use-answer-handler.ts`, `answer-handler-helpers.ts`, `quiz-submit.ts` | EXTEND (G2/G3 type surgery + forward non-MC answers) |
| Renderers | MC `AnswerOptions` | REUSE |
| Renderers | `ShortAnswerInput`, `DialogFillInput`, `OrderingInput`, `DiagramLabelInput` | NEW (shared) |
| Feedback | MC `check_quiz_answer` | REUSE |
| Feedback | non-MC grader RPC + Server Action | NEW (G3) |
| Recording | `batch_submit_quiz` | EXTEND (persist non-MC answers, G3) |
| Question delivery | `get_quiz_questions` | EXTEND via DROP+recreate (G1) |
| Report | `ReportCard`/`ResultSummary`/`QuestionBreakdown` | REUSE |
| Report | `quiz-report.ts`, `report-question-builder.ts`, `report-question-row.tsx`, `quiz-report-questions.ts`, `get_report_correct_options` | EXTEND (G4) |
| Report | `ShortAnswerReport`/`DialogFillReport`/`OrderingReport`/`DiagramLabelReport` | NEW (G4) |
| Report redirect | `quiz-submit.ts:handleSubmitSession` | REUSE — RT submits to `/app/quiz/report` (shared report; document the cross-namespace redirect) |

## Phased delivery (each phase = one manual-eval checkpoint; each gets its own plan-validation + plan-critic + approval)

- **Phase 0 — Branch + seed.** Done: branch `feat/vfr-rt-training` off master. NEW `seed-vfr-rt-training-eval.ts` (RT questions across parts; later phases add ordering/diagram fixtures). *Eval:* seed idempotent; RT questions present.
- **Phase 1 — Dedicated page + nav + RT-out-of-quiz (MC working).** `/app/vfr-rt` route reusing quiz Study setup/runner/report scoped to RT; "VFR RT" nav (named icon); exclude RT from `getSubjectsWithCounts`. Confirm `activeSession` storage key doesn't collide (RT vs quiz). *Eval:* RT MC practice end-to-end, looks like quiz, separate menu, not in quiz dropdown; quiz unchanged.
- **Phase 2 — Backend for `short_answer`/`dialog_fill` (G1 + G3 grader + recording).** `get_quiz_questions` DROP+recreate (+`load-session-questions.ts`); non-MC grader RPC; extend `batch_submit_quiz` + `DraftAnswer`/`quiz-submit.ts`. Integration-tested; plan.md count updated in the same commit.
- **Phase 3 — Runner renders + grades `short_answer`/`dialog_fill` (G2 + wire G3).** Type dispatch, `ShortAnswerInput`/`DialogFillInput`, answer-pipeline type surgery, feedback Server Action. *Eval:* P1+P2 display, answer, immediate feedback + reveal.
- **Phase 4 — Report renders `short_answer`/`dialog_fill` (G4).** Report discriminated union, `isAnswered` fix, SECURITY DEFINER canonical delivery, sub-renderers. *Eval:* report shows P1+P2 with answer vs correct + explanation.
- **Phase 5 — `ordering` type.** Add dnd-kit. Migration: widen CHECKs + `ordering_items`; grader + delivery (shuffle) + recording + report renderer/sub-report. Seed ordering fixtures. *Eval:* MAYDAY/position drag-to-order works end-to-end.
- **Phase 6 — `diagram_label` type.** Migration: widen CHECKs + `diagram_config` + answer stripping; grader + delivery (strip mapping) + recording + report; `DiagramLabelInput` (dnd onto positioned zones, touch); seed 27/09 pattern image (static asset) + zones + labels. *Eval:* traffic-pattern drag-label works end-to-end.
- **Phase 7 — Cleanup, tests, docs.** Remove temporary scaffolding; full unit + integration + types + biome; red-team if a trigger/RPC security path was touched; docs (`database.md` RPCs, `plan.md` phase + integration count, decisions for dnd-kit + new types); note #923 disposition (parked; exam returns later as exam-mode on this shared UI).

## Testing Strategy

- **Unit (Vitest, co-located):** each new input renderer + report sub-renderer; the non-MC feedback Server Action (correct/incorrect/granular/error); dialog-display parser; `getSubjectsWithCounts` excludes RT; `isAnswered` for non-MC; dnd interactions where testable (jsdom limits noted).
- **Integration (CI-only, `packages/db/__integration__`):** `get_quiz_questions` returns new display fields + NO answer-key columns + stripped dialog + shuffled ordering + stripped diagram mapping; grader RPC correctness + full guard set (unauth, non-whitelist mode, soft-deleted caller, non-owner, non-member); `batch_submit_quiz` persists non-MC rows. Update plan.md integration count in the same commit.
- **No regression:** existing quiz Study + report tests stay green; MC path unchanged.
- **Manual eval** at every phase checkpoint.

## Open validation items (resolved per-phase, before each slice's code)

1. Exact `DraftAnswer`/`AnswerFeedback` discriminated-union shapes + `recordAnswerFeedback` changes (Phase 2/3).
2. Salvage-from-#923 vs author-fresh for `ShortAnswerInput`/`DialogFillInput` + dialog parser (Phase 3) — lean author-fresh in the quiz idiom; reuse pure parsing logic.
3. Extend `get_quiz_questions` in place (DROP+recreate) — confirmed approach; re-trace latest definition before editing (Phase 2).
4. `get_report_correct_options` extension vs new report RPC for post-session canonical delivery (Phase 4).
5. `activeSession` storage-key scheme — namespace per route or prevent concurrent RT+quiz sessions (Phase 1).
6. Whether RT should also be hidden from Dashboard/Progress subject lists (Phase 1 — R1.3 scopes exclusion to the picker; confirm).
7. dnd-kit version + a11y/touch config; ordering/diagram exact column shapes + whether `ordering_items` needs REVOKE (Phase 5/6).
