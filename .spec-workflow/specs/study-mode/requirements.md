# Study Mode — Requirements

## Summary
A "Discovery" mode in the New Quiz toggle on the quiz page (`/app/quiz`) that lets a
student page through MC questions as flashcards, seeing the correct answer + explanation
immediately. Same setup filters and same flag option as a quiz. **No results stored**
(no session, no answers, no scores) — only question flags persist (reusing the existing
flag feature).

> **UI placement note (post-PR #1006):** Originally shipped as a 3rd top-level tab
> "Study mode". Relocated to a 3rd segment of the New Quiz mode toggle as **Discovery**
> (first segment, default-selected) to avoid semantic collision with the existing "Study"
> toggle segment. Internal code identifiers remain `study`/`startStudy`/`useStudyConfig`.

## Scope
- **In:** Multiple-choice questions only. Reuse of existing quiz filter UI, flag feature,
  and question/answer rendering components.
- **Out (v1):** Non-MC question types (short_answer, dialog_fill, ordering); progress
  tracking / mark-known; sessions; scoring; a dedicated full-page route.

## Functional Requirements
1. Discovery mode (first/default segment of the New Quiz ModeToggle) on the quiz page, 
   with the same subject/topic/subtopic selectors, all/unseen/incorrect/flagged + calc + image 
   filters, and count slider as the main quiz setup.
2. "Start discovery" selects a random set of MC questions matching the filters and shows a
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
- **Mid-exam oracle denial:** the RPC raises `active_exam_session` when the caller has any
  active session whose mode is outside the practice set (deny-by-default), preventing a
  mid-exam student from using Study Mode to read answer keys for their in-progress exam.
- Equivalent exposure to existing post-session practice reports — accelerated to immediate.
- Reuse over reinvention: existing filter components/hooks, flag hook/action, QuestionCard,
  AnswerOptions, getRandomQuestionIds.

## Decisions (resolved with user)
- Reveal: flashcard (answer always visible). Tracking: none. Explanation: shown.
- Branch off fresh master. Random subset via count slider. Inline runner (no route).
- **Mixed-type subjects:** future-proof now (option A) — add optional `question_type`
  filter to `get_random_question_ids` so the MC count stays honest even after non-MC
  questions exist.
