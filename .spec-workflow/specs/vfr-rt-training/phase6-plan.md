# Phase 6 — `diagram_label` question type — VALIDATED PLAN (resume artifact)

Status: **plan-critic APPROVED** (1 coverage round, 3 Opus lenses → 15 findings all applied → 1 clean Opus stability round). Ready to execute. Not yet started.

## Design decisions (user-confirmed 2026-07-02)
- **image_ref = logical key** → in-code SVG registry; SVG is pure artwork, zones are % overlays. NOT a static PNG.
- **Distractors allowed** → labels.length > zones.length; each zone covered once; leftover chips OK; chips consume-on-place.
- **9 zones** = 5 legs (upwind/crosswind/downwind/base/final) + 4 turns (crosswind/downwind/base/final-turn), + ~2-3 distractors. Left-hand pattern RWY 27/09.
- **General diagram_config schema**, seed only the 27/09 pattern.
- **Zone coords = fractions 0..1** (responsive/iPad).

## Data model
`questions.diagram_config JSONB` (single REVOKE-gated column, like `ordering_items`):
`{ image_ref, zones:[{id,x,y,w,h}], labels:[{id,text}], answer:[{zone_id,label_id}] }`
Public delivery = `{image_ref, zones, labels(shuffled)}` — `answer` STRIPPED.
**Security invariant (seed-enforced):** zone ids and label ids use UNRELATED random schemes (no zone_id == label_id, no parallel naming) or the pairing leaks from delivered ids even with answer stripped. Seed asserts this.

## 7 migrations (dual-authored supabase/migrations/ ≡ packages/db/migrations/, byte-identical; re-timestamp past latest prod migration)
- **A** questions_diagram_label_type: ADD COLUMN diagram_config JSONB (NOT in any GRANT SELECT — mig 20260610000100 column-grant list auto-gates by omission); widen question_type IN-list (+'diagram_label' via pg_constraint); `is_valid_diagram_config(jsonb)` IMMUTABLE — CASE-wrap all 3 arrays (zones/labels/answer) BEFORE element access (non-array→23514 not 22023); `jsonb_typeof(z->'x')='number'` BEFORE `(z->>'x')::numeric` (non-number→23514 not 22P02 abort); coords in [0,1]; distinct non-blank ids; answer covers each zone EXACTLY once, every zone_id∈zones, every label_id∈labels, labels MAY be unused (distractors); rewrite questions_question_type_columns_check (diagram_label⇒valid config; other types⇒diagram_config NULL).
- **B** blank_index trigger: widen biconditional to `question_type IN ('dialog_fill','ordering','diagram_label') <=> blank_index IS NOT NULL`.
- **C** get_quiz_questions: DROP+recreate (+trailing `diagram_config_public jsonb`); diagram rows build `{image_ref,zones,labels}` labels ORDER BY random() (shuffle IS a leak-guard), answer omitted; NULL non-diagram.
- **D** check_non_mc_answer: DROP exact 5-arg `(uuid,uuid,text,jsonb,jsonb)` + CREATE 6-arg (+`p_mapping jsonb`). RE-EMIT all existing branches (short_answer/dialog_fill/ordering)+guard prologue VERBATIM from latest def (mig 146). answer_type_mismatch 4-way parity: each existing branch adds `OR p_mapping IS NOT NULL`; diagram branch requires `p_mapping NOT NULL AND p_response_text NULL AND p_blank_answers NULL AND p_order NULL` + `jsonb_typeof(p_mapping)='array'` guard (mirror ordering L260). Practice-mode whitelist + full sibling guard set preserved.
- **E** _grade_record_diagram_label SECURITY DEFINER; REVOKE FROM PUBLIC, anon, authenticated (FROM PUBLIC alone insufficient — Phase 2 lesson). **Derive blank_index server-side = index of zone_id in config.zones (single ordinal source).** RAISE on zone_id∉zones, label_id∉labels, out-of-range (mirror ordering mig 147 L48/L51-53/L59-69). is_correct=(label_id=answer-for-zone); insert one quiz_session_answers + student_responses row per zone (response_text=label text, blank_index=derived, no selected_option_id).
- **F** batch_submit_quiz: add diagram_config to _batch_questions; **INVERTED self-defence (do NOT clone ordering's complete-permutation check):** integrity key = **DISTINCT zone_id** (submitted zone_ids⊆config, distinct zone_id, distinct label_id — no chip on 2 zones); ALLOW partial (<#zones) + leftover distractors; client `blankIndex` exists ONLY to satisfy the existing `(question_id,blank_index)` dup-guard (mig 148 L167-176) and is discarded server-side. Dispatch → _grade_record_diagram_label per entry. total_blanks = jsonb_array_length(zones) → folds into DISTINCT-question partial-credit rollup (LEAST(correct/total,1.0) caps).
- **G** get_report_answer_keys: add branch — one row per zone via jsonb_array_elements(zones) WITH ORDINALITY, blank_index=ord-1 (SAME index grader derives), answer_key = **2-hop resolve**: zone→config.answer entry→label_id→config.labels text (NOT a 1-expression ordering clone).

## App layer (clone ordering files)
- `apps/web/app/app/_types/session.ts` — +'diagram_label' to QuestionType union (imported by ~10 session files; tsc break if omitted) + delivery field on SessionQuestion.
- `apps/web/lib/queries/load-session-questions.ts` — QuizQuestionRow+Question gain diagram_config; +'diagram_label' to BOTH inline unions (:19 and :33); isDiagramConfig guard; mapper.
- `apps/web/app/app/quiz/actions/diagram-validation.ts` NEW (mirror ordering-validation.ts) — MAX_ZONES/MAX_LABELS, mapping-shape validators, submission self-defence predicate.
- `apps/web/app/app/quiz/session/_components/answer-input.tsx` (137 LINES — OVER CAP after wiring): budget extraction of per-type *Answer subcomponents in SAME commit, then wire `case 'diagram_label'`.
- `diagram-label-input.tsx` NEW — @dnd-kit/core DndContext (clone sensors verbatim: PointerSensor, TouchSensor{delay:250,tolerance:5}, KeyboardSensor), `collisionDetection={pointerWithin}` (NOT closestCenter); useDroppable zones + useDraggable chips; SVG underlay; %-positioned zone boxes; consume-on-place pool; submit→mapping[]. Extract zone-box/chip/pool subcomponents + helpers for 150-line cap.
- `_components/diagrams/rwy-2709-lh-pattern.tsx` NEW (SVG artwork) + `_components/diagrams/registry.ts` NEW (image_ref→component).
- `_hooks/answer-handler-helpers.ts` — handleDiagramLabelAnswer(mapping); wire use-answer-pipeline + use-quiz-state; noop in use-exam-state.
- `types.ts` — DraftAnswer.mapping?; AnswerFeedback + CheckNonMcAnswerResult diagram variant.
- `_hooks/quiz-submit.ts` — fanOutDiagramLabelAnswer (one entry per zone: {questionId,zoneId,labelId,blankIndex,responseTimeMs}).
- `actions/batch-submit.ts`; `actions/check-non-mc-answer{,-schema,-helpers}.ts` (DiagramRpcResult+isDiagramRpcResult); `actions/draft-schema.ts`; `actions/load-draft-helpers.ts` (`toFeedbackEntry` case 'diagram_label' — DB-draft RESUME; omission discards whole draft feedback on resume); `_utils/quiz-session-validators.ts`.
- Report: `report-answer-body.tsx` (dispatch + `never` at :49 FORCES branch), `diagram-label-report.tsx` NEW, `report-question-builder.ts`+`report-diagram-label-helpers.ts` NEW, `quiz-report.ts` union, `quiz-report-helpers.ts` buildAnswerKeyMap diagram branch.
- `packages/db/src/types.ts` — OPTIONAL doc-drift only (question_type is typed `string`, not a literal; ordering never regenerated this — NOT a tsc/parity requirement). If touched, note pre-existing missing `ordering_items`.
- Seed `apps/web/scripts/seed-vfr-rt-training-eval.ts` — one 27/09 fixture (9 zones + 9 correct + ~3 distractors, UNRELATED random ids, answer covers each zone once, seed-time id-disjointness assertion).

## Tests
Integration (packages/db/src/__integration__/, CI-only, EXECUTE the RPCs): rpc-get-quiz-questions-diagram (omits answer + shuffles labels), rpc-diagram-config-column-revoke (authed student SELECT of diagram_config errors — the answer-exposure surface), rpc-check-non-mc-answer-diagram (correctness + FULL guard set: unauth/non-whitelist/both-exam-mode/soft-deleted/non-owner/non-member/answer_type_mismatch/non-array p_mapping→clean not 22023), rpc-batch-submit-quiz-diagram (per-zone rows + partial credit + self-defence rejects dup zone/double-placed label + ACCEPTS partial+distractor NON-VACUOUS), rpc-report-answer-keys-diagram (aligns with derived blank_index), check-constraint-diagram-config (9-case reject suite: non-number coord, out-of-range, non-array zones/labels/answer, uncovered zone, unknown zone/label ref, dup zone), _grade_record REVOKE test (anon/authenticated cannot EXECUTE — non-vacuous), trigger-blank-index-diagram.
Unit: DiagramLabelInput (drop/consume-on-place/submit/disabled/distractor-leftover), diagram-validation helpers, report builder, load-session-questions mapper, load-draft-helpers diagram resume.
**Fixture fix:** quiz-main-panel.test.tsx:528 uses question_type:'diagram_label' as its UNKNOWN-type fixture → swap to a bogus type so default/fail-closed branch stays exercised (:535).
Update docs/plan.md integration-count literal (line-5 `311`) in the SAME commit as integration tests.

## Docs
docs/database.md (column/helper/4 extended RPCs/grader), docs/decisions.md (Decision 52 diagram_label+SVG registry), docs/plan.md (Phase 6 status + count), tasks.md 6.1/6.2/6.3 → [x], .coderabbit.yaml (confirm no new rule).

## Sequencing
Continuation branch (like PR #998). (1) migs A–G + integration tests + plan.md count (backend, DB-only, no manual eval); (2) app layers + seed + unit tests (manual eval applies). One PR, or split backend/app if too large.

## Plan-critic status
Coverage round: 3 Opus lenses (security / contract-pattern / completeness-tests) → 15 findings, all applied into this REV.
Stability round: 1 Opus round → CLEAN (0 critical, 0 issue; 3 SUGGESTION-level clarifications already folded into the text above: types.ts optional/reworded, DISTINCT zone_id is the integrity key, mig G 2-hop answer_key resolve).
Verdict: **APPROVED — ready for user approval → execute.**
