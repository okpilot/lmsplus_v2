# Study Mode — Tasks

## DB
- [x] Mig 134: `get_random_question_ids` + `_filtered_question_pool` optional `p_question_type` (DROP+recreate, two-dir mirror)
- [x] Mig 135: `get_study_questions(uuid[])` MC-only with answer key (two-dir mirror)
- [x] Extend `getRandomQuestionIds` query helper with optional `questionType`
- [x] Local `supabase db reset` clean-apply check

## Server
- [x] `lib/queries/study-queries.ts` — getStudyQuestions + StudyQuestion type
- [x] `app/app/quiz/actions/study.ts` — startStudy action

## UI
- [x] `quiz-tabs.tsx` — 3rd "Study mode" tab
- [x] `quiz/page.tsx` — studyContent
- [x] `study-section.tsx` (server)
- [x] `study-config-form.tsx` + `use-study-config.ts` + `use-study-start.ts`
- [x] `study-runner.tsx` + `study-flashcard.tsx`

## Tests
- [x] study-queries unit; startStudy action; use-study-* hooks
- [x] study-runner + study-flashcard component tests + study-config-form component test
- [x] integration test for get_study_questions .rpc site (§7 HARD)
- [x] db execution test for the RPC (executed in rolled-back txns by DB agent; EO red-team spec 5/5 against real DB)

## Red-team + docs
- [x] red-team spec (Vector EO) + new vector ID (attack-surface 48→49)
- [x] database.md / decisions.md (Decision 48) / security.md / plan.md + tech.md spec-count

## Pipeline
- [x] impl-critic (APPROVED) → 3 commits → post-commit agents + red-team + coderabbit-sync → learner → PR-level semantic sweep (CLEAN)
- [x] /fullpush gates: lint, types, 4472 tests, build, clean migration reset, red-team EO 5/5
- [ ] /crlocal → push → open PR (DO NOT MERGE)

## Deferred (GitHub issues)
- #1003 (P2/M) — MC-aware pre-start count display on mixed-type subjects (dormant; selection already MC)
- #1004 (P2/S) — EO-SD soft-deleted-caller red-team sub-test
- #1005 (P2/S) — startStudy in Hub-A unauthenticated red-team chain
