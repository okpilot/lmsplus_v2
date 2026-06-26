# Study Mode — Design

## Data flow (session-free, mirrors quiz's two-step)
```
StudyConfigForm (reuses quiz filter UI/hooks)
  → startStudy(filters) [Server Action]
      → getRandomQuestionIds(filters, questionType='multiple_choice')  [EXISTING, extended]
      → getStudyQuestions(ids)  → get_study_questions RPC  [NEW]
  → returns StudyQuestion[] (with correct_option_id + explanation)
  → study tab swaps in-place to StudyRunner (client state)
      → StudyFlashcard per question (QuestionCard + AnswerOptions[revealed] + explanation + flag)
```

## DB

### Mig 134 — extend `get_random_question_ids` + `_filtered_question_pool`
Add optional `p_question_type text DEFAULT NULL` to the pool helper and the public RPC.
`NULL` ⇒ no type filter (existing behavior preserved for the quiz/exam callers). Non-NULL
⇒ `AND question_type = p_question_type` in the pool WHERE clause. Param-list change ⇒
**DROP + recreate** (not CREATE OR REPLACE) for both functions; re-emit bodies verbatim
from the latest definition + the new predicate. Re-GRANT EXECUTE TO authenticated. Mirror
in `packages/db/134_*.sql` and `supabase/migrations/20260626000100_*.sql`.

### Mig 135 — `get_study_questions(p_question_ids uuid[])`
Clone the guard block of `get_quiz_questions` (mig 126 / `20260623000500` — the latest on
this master-based branch; Phase 5's mig 136 is unmerged and not present here). MC-only.
Returns the answer key.
```
RETURNS TABLE (
  id uuid, question_text text, question_image_url text,
  options jsonb,            -- [{id,text}] NOT shuffled (stable paging; answer shown anyway)
  correct_option_id text,   -- the MC answer key (deliberately returned)
  subject_code text, topic_name text, subtopic_name text,
  explanation_text text, explanation_image_url text,
  question_number text, difficulty text
)
SECURITY DEFINER, SET search_path = public.
Guards: auth.uid() null-check; v_org_id via `users u WHERE u.id=auth.uid() AND u.deleted_at IS NULL`;
WHERE q.id = ANY(p_question_ids) AND q.organization_id = v_org_id
      AND q.deleted_at IS NULL AND q.status='active' AND q.question_type='multiple_choice'.
Alias all tables + qualify columns (RETURNS TABLE has `id` OUT param → 42702 risk).
GRANT EXECUTE TO authenticated. Mirror packages/db/135_*.sql + supabase/migrations/20260626000200_*.sql.
```
Security: reads by arbitrary client IDs (not a session-frozen immutable column) → §15
carve-out does NOT apply → `deleted_at IS NULL` is REQUIRED (present above).

## Server
- `lib/queries/study-queries.ts` — `getStudyQuestions(ids: string[]): Promise<StudyQuestion[]>`
  via `rpc('get_study_questions', {p_question_ids})`; §5 `{error}` check + cast-guard
  (Array.isArray + per-row narrowing). Export `StudyQuestion` type.
- `app/app/quiz/actions/study.ts` — `startStudy(raw)`: Zod schema = same shape as
  `actions/start.ts` (subjectId, topicIds?, subtopicIds?, count, filters?, calcMode?, imageMode?).
  Calls `getRandomQuestionIds({...filters, questionType:'multiple_choice'})` → `getStudyQuestions`.
  Returns `{success:true, questions} | {success:false, error}` (generic error, no leak).

## Client (reuse existing; new files stay under §1 limits)
- `quiz-tabs.tsx` (edit) — state `'new'|'saved'|'study'`; TAB_NAMES 3 entries; keyboard %3,
  End→2; `studyContent` prop + TabButton + tabpanel branch.
- `quiz/page.tsx` (edit) — `studyContent={<StudySection userId={user.id}/>}` (Suspense).
- `quiz/_components/study-section.tsx` (new, server) — `getSubjectsWithCounts()` → `<StudyConfigForm>`.
- `quiz/_components/study-config-form.tsx` (new, client) — composes subject-select + topic-tree
  + question-filters + question-count + Start button; renders `<StudyRunner>` once started.
- `quiz/_hooks/use-study-config.ts` (new) — reuse use-quiz-config-state + use-topic-tree + use-filtered-count.
- `quiz/_hooks/use-study-start.ts` (new) — calls startStudy; holds questions + loading/error.
- `quiz/study/_components/study-runner.tsx` (new, client) — index + prev/next + arrow keys +
  counter; `useFlaggedQuestions(ids)`; renders `<StudyFlashcard>`; empty-state.
- `quiz/study/_components/study-flashcard.tsx` (new, client) — `QuestionCard` +
  `AnswerOptions(options, correctOptionId, selectedOptionId=correctOptionId, disabled, isExam=false)`
  [renders the key green] + explanation (MarkdownText + ZoomableImage) + flag button.

## Reused unchanged
subject-select, topic-tree, question-filters, question-count, use-quiz-config-state,
use-topic-tree, use-filtered-count, QuestionCard, AnswerOptions, useFlaggedQuestions,
toggleFlag/getFlaggedIds, MarkdownText, ZoomableImage, getRandomQuestionIds (extended).

## Tests / docs / red-team
Unit (query, action, hooks, runner, flashcard); integration test for the new `.rpc` site
(§7 HARD); db execution test for get_study_questions; red-team spec (auth, cross-org
non-vacuous, soft-deleted excluded, MC-only, positive control) + new vector ID; docs
(database.md, decisions.md, security.md, plan.md).
