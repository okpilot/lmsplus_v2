# Study Mode — Requirements

## Summary
A "Study mode" tab on the quiz page (`/app/quiz`) that lets a student page through MC
questions as flashcards, seeing the correct answer + explanation immediately. Same setup
filters and same flag option as a quiz. **No results stored** (no session, no answers, no
scores) — only question flags persist (reusing the existing flag feature).

## Scope
- **In:** Multiple-choice questions only. Reuse of existing quiz filter UI, flag feature,
  and question/answer rendering components.
- **Out (v1):** Non-MC question types (short_answer, dialog_fill, ordering); progress
  tracking / mark-known; sessions; scoring; a dedicated full-page route.

## Functional Requirements
1. A 3rd tab "Study mode" on the quiz page, visually identical to "New Quiz" (same
   subject/topic/subtopic selectors, all/unseen/incorrect/flagged + calc + image filters,
   count slider).
2. "Start studying" selects a random set of MC questions matching the filters and shows a
   flashcard runner.
3. Each flashcard shows: question text + image, the options with the **correct one
   highlighted**, and the explanation — all visible immediately.
4. The user pages through with prev/next and arrow keys; a progress counter (e.g. 12 / 50).
5. A flag button identical to the quiz's; flagging persists per student/question (same
   `flagged_questions` table, same `toggleFlag` action).
6. Nothing about the study session is persisted. Refresh restarts (fresh random set).
7. Empty state when no MC questions match the filters.

## Non-Functional / Constraints
- **Security:** answer exposure happens only via a new SECURITY DEFINER RPC
  `get_study_questions` with the full guard set (auth, active-user/org-scope, soft-delete,
  `status='active'`, `search_path`, `authenticated`-only EXECUTE). MC-only.
- Equivalent exposure to existing post-session practice reports — accelerated to immediate.
- Reuse over reinvention: existing filter components/hooks, flag hook/action, QuestionCard,
  AnswerOptions, getRandomQuestionIds.

## Decisions (resolved with user)
- Reveal: flashcard (answer always visible). Tracking: none. Explanation: shown.
- Branch off fresh master. Random subset via count slider. Inline runner (no route).
- **Mixed-type subjects:** future-proof now (option A) — add optional `question_type`
  filter to `get_random_question_ids` so the MC count stays honest even after non-MC
  questions exist.
