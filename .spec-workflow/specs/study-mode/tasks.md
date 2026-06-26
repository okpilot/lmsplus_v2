# Study Mode — Tasks

## DB
- [ ] Mig 134: `get_random_question_ids` + `_filtered_question_pool` optional `p_question_type` (DROP+recreate, two-dir mirror)
- [ ] Mig 135: `get_study_questions(uuid[])` MC-only with answer key (two-dir mirror)
- [ ] Extend `getRandomQuestionIds` query helper with optional `questionType`
- [ ] Local `supabase db reset` clean-apply check

## Server
- [ ] `lib/queries/study-queries.ts` — getStudyQuestions + StudyQuestion type
- [ ] `app/app/quiz/actions/study.ts` — startStudy action

## UI
- [ ] `quiz-tabs.tsx` — 3rd "Study mode" tab
- [ ] `quiz/page.tsx` — studyContent
- [ ] `study-section.tsx` (server)
- [ ] `study-config-form.tsx` + `use-study-config.ts` + `use-study-start.ts`
- [ ] `study-runner.tsx` + `study-flashcard.tsx`

## Tests
- [ ] study-queries unit; startStudy action; use-study-* hooks
- [ ] study-runner + study-flashcard component tests
- [ ] integration test for get_study_questions .rpc site (§7 HARD)
- [ ] db execution test for the RPC

## Red-team + docs
- [ ] red-team spec + new vector ID
- [ ] database.md / decisions.md / security.md / plan.md

## Pipeline
- [ ] impl-critic → commit(s) → post-commit agents → red-team → semantic sweep → /crlocal → /fullpush → push → open PR (DO NOT MERGE)
