# Feature Backlog — LMS Plus v2

> Post-MVP feedback captured 2026-03-11. Prioritized and categorized.
> Reference this file when planning sprints.

---

## Sprint 1 — Quick Wins (biggest UX impact, small effort)

### 1.1 Markdown rendering for questions & explanations — ✅ DONE (2026-03-12)

- **Problem:** Text displays as continuous unformatted blob — no tables, line breaks, bullet lists
- **Solution:** MarkdownText component (`react-markdown` + `remark-gfm`) used in QuestionCard, FeedbackPanel
- **Size:** S

### 1.2 Image click-to-expand (lightbox) — ✅ DONE (2026-03-12)

- **Problem:** Question/explanation images are small and not zoomable
- **Solution:** ZoomableImage component using `@base-ui/react/dialog` for full-size view on click
- **Size:** S

### 1.3 Question ID/number display — ✅ DONE (2026-03-12)

- **Problem:** No way to reference a specific question
- **Solution:** Migration 008 adds `question_number` to `get_quiz_questions()` RPC; displayed in quiz/review session UI
- **Size:** XS

### 1.4 Elapsed timer in quiz/review — ✅ DONE (2026-03-12)

- **Problem:** No time tracking during sessions
- **Solution:** SessionTimer component visible during quiz and review sessions
- **Size:** S

### 1.5 Loading skeletons — ✅ DONE (2026-03-12)

- **Problem:** No loading states — blank screens while data loads
- **Solution:** Skeleton UI component + `loading.tsx` files for dashboard/quiz/review/progress + skeleton states in session loaders
- **Size:** S

### 1.6 Rename "Quick Quiz" → "Quiz" — ✅ DONE (2026-03-12)

- **Problem:** "Quick Quiz" implies a lightweight mode; it's the main quiz feature
- **Solution:** Rename in nav, routes (`/app/quiz` stays), page titles, all references
- **Size:** XS

### 1.7 Smart Review: exclude new questions — ✅ DONE (2026-03-12)

- **Problem:** Review mode includes unseen questions — defeats the purpose of "review"
- **Solution:** Only load questions the student has previously answered (has `fsrs_cards` entry or `student_responses` history)
- **Size:** XS

### 1.8 Smart Review: subject selector — ✅ DONE (2026-03-12)

- **Problem:** Can't choose which subjects to review
- **Solution:** ReviewConfigForm with subject checkboxes; `getDueCards` accepts `{ limit?, subjectIds? }` options object
- **Size:** S

### 1.9 Smart Review: how-it-works explanation — ✅ DONE (2026-03-12)

- **Problem:** Students don't understand FSRS or how to use Smart Review effectively
- **Solution:** Info card/tooltip explaining spaced repetition and recommended usage (collapsible explainer with FSRS explanation + recommended usage)
- **Size:** XS

### 1.10 Mobile responsiveness pass — ✅ DONE (2026-03-12)

- **Problem:** App may not be fully usable on mobile devices
- **Solution:** MobileNav component (hamburger menu + slide-out drawer via `@base-ui/react/dialog`), auto-closes on route change; sidebar hidden below `md` breakpoint
- **Size:** M

---

## Sprint 2 — Quiz Overhaul (core experience redesign)

### 2.1 Fullscreen quiz environment
- **Problem:** Quiz shows inside regular app layout with header/nav — distracting
- **Solution:** Dedicated quiz layout: no header/nav, just question + tabs + timer. Exit button top-right. Moodle-style question grid sidebar on right (small numbered buttons with color-coded status: unanswered, correct, incorrect, flagged)
- **Size:** L

### 2.2 Question tabs (Question / Explanation / Comments / Statistics)
- **Problem:** Explanation only visible after answering; no comments or stats
- **Solution:** 4 tabs per question inside quiz environment:
  - **Question** — current question + answer options (default tab)
  - **Explanation** — shows explanation (available after answering or in study mode)
  - **Comments** — per-question comments from all registered users (read/write)
  - **Statistics** — personal stats: times seen, correct/incorrect counts, last answered, FSRS state
- **Size:** L

### 2.3 Quiz config: subject → topic → subtopic drill-down
- **Problem:** Can only select subject, not specific topics/subtopics
- **Solution:** Cascading selectors: subject → topic → subtopic (all optional, broader = more questions)
- **Size:** M

### 2.4 Quiz config: question filters (unseen, incorrectly answered)
- **Problem:** Can't filter by question familiarity
- **Solution:** Filter checkboxes:
  - **Unseen** — questions student has never answered (no `student_responses` entry)
  - **Incorrectly answered** — dynamic logic:
    - Show if last attempt was incorrect
    - Remove from "incorrect" pool if answered correctly **twice in a row**
    - Bring back if answered incorrectly again
  - **All** — no filter (default)
- **Schema change needed:** Track per-question `consecutive_correct_count` and `last_was_correct` on `fsrs_cards` or new tracking table
- **Size:** L

### 2.5 Quiz config: question count slider
- **Problem:** Fixed number picker, arbitrary max limit
- **Solution:** Slider input, max = actual QDB size for selected subject/topic/subtopic + filters
- **Size:** S

### 2.6 Deferred DB writes (quiz lifecycle overhaul)
- **Problem:** Currently writes to DB on every answer submission
- **Solution:** New lifecycle:
  1. Load questions into client state
  2. Student answers questions (stored in local state only)
  3. On "Finish Test" — 3 options:
     - **Finish & Submit** — write all answers to DB, update FSRS, track progress
     - **Cancel Attempt** — discard everything, no DB writes
     - **Save for Later** — persist quiz state (questions + current answers + position) to DB draft table for resuming later
  4. If student navigates away or closes tab — show warning popup with same 3 options
  5. If tab closed without choosing — next quiz open resumes from saved state (localStorage fallback + DB sync)
- **Schema change needed:** New `quiz_drafts` table (student_id, session_config, answers_json, current_index, saved_at)
- **Size:** XL

### 2.7 Resume interrupted quiz
- **Problem:** Closing tab loses all progress
- **Solution:** Auto-save quiz state to localStorage on every answer. On next quiz open, detect saved state and offer to resume. Sync with `quiz_drafts` table for cross-device resume.
- **Size:** L (coupled with 2.6)

### 2.8 Quiz report card
- **Problem:** No detailed results view after completing/discarding a test
- **Solution:** On finish (submit or discard): show report with:
  - Overall score %, time taken
  - List of all questions with: question text, your answer, correct answer (if wrong), correct/incorrect indicator
  - Sortable/filterable (show only incorrect, etc.)
- **Size:** M

### 2.9 Incorrectly-answered tracking logic
- **Problem:** No dynamic tracking of "incorrectly answered" status
- **Solution:** Per-question tracking:
  - `last_was_correct: boolean`
  - `consecutive_correct_count: integer`
  - Logic: on correct answer → increment consecutive count. On incorrect → reset to 0, mark last_was_correct = false
  - Question leaves "incorrect" filter after 2 consecutive correct answers
  - Question re-enters "incorrect" filter on any wrong answer
- **Size:** M (schema + query logic)

### 2.10 Saved tests tab
- **Problem:** No way to see or resume saved (draft) quizzes
- **Solution:** Tab in quiz section showing saved/draft tests with: date, subject, progress (X/Y answered), resume button, delete button
- **Size:** M (coupled with 2.6)

### 2.11 Navigation away warning
- **Problem:** Accidentally leaving quiz loses progress
- **Solution:** `beforeunload` event + Next.js route change intercept. Popup with 3 options (Finish & Submit, Cancel Attempt, Save for Later)
- **Size:** S

---

## Sprint 3 — Dashboard & Analytics

### 3.1 Activity graph (questions seen, correct, incorrect)
- **Problem:** Dashboard has no visual activity overview
- **Solution:** Line/bar chart showing daily activity over last 30 days: total questions, correct, incorrect. Use recharts or similar.
- **Size:** M

### 3.2 Pie chart (average scores by last 5 tested areas)
- **Problem:** No quick visual of performance distribution
- **Solution:** Pie/donut chart showing avg scores for the 5 most recently tested subject areas
- **Size:** M

### 3.3 Monthly calendar heatmap
- **Problem:** No visual daily activity tracking
- **Solution:** Calendar grid (like GitHub contribution graph) showing per-day: questions seen, correct count, incorrect count. Color intensity = activity level.
- **Size:** M

### 3.4 Question statistics tab (personal)
- **Problem:** No per-question performance history
- **Solution:** In quiz question tabs (see 2.2): show times seen, correct/incorrect counts, last answered date, current FSRS state (stability, difficulty, interval)
- **Size:** S (query `student_responses` + `fsrs_cards`)

### 3.5 Reports page (past completed tests)
- **Problem:** No way to review past test results
- **Solution:** New page `/app/reports`:
  - List of all completed sessions: date, mode, subject, score, time taken
  - Click to open → full report card (same as 2.8) showing all questions with your answers vs correct answers
  - Sort by date, score, subject
- **Size:** M

### 3.6 Progress vs Dashboard differentiation
- **Problem:** Progress page overlaps with dashboard
- **Solution:**
  - **Dashboard** = landing page: activity charts (3.1–3.3), due reviews count, quick actions
  - **Progress** = detailed drill-down: subject → topic → subtopic mastery tree (current implementation)
  - Clear distinct purposes
- **Size:** S (mostly reshuffling existing components)

---

## Sprint 4 — Social, Search & Study

### 4.1 Search page
- **Problem:** No way to find specific questions
- **Solution:** New nav item + page `/app/search`:
  - Search by: subject, topic/subtopic, question number, keyword in text
  - Results show matching questions
  - Click on result → shows question in read-only view (with explanation)
- **Size:** M

### 4.2 Study mode ("study with correct answers")
- **Problem:** No way to study questions without quiz pressure
- **Solution:** New mode `/app/study`:
  - Configure like a quiz (subject, topic, subtopic, count, filters)
  - Questions displayed with correct answer already highlighted
  - Explanation visible immediately
  - No scoring, no DB tracking, no timer pressure
  - Student can mark questions as "needs review" (flags for FSRS)
- **Size:** M

### 4.3 Comments system (per-question)
- **Problem:** Students and admins can't discuss questions
- **Solution:**
  - New `question_comments` table: `id, question_id, user_id, content, created_at, deleted_at`
  - All registered users can read all comments
  - All registered users can write comments
  - Admin can soft-delete inappropriate comments
  - Visible in question Comments tab (see 2.2)
- **Schema change:** New table + RLS policies
- **Size:** L

### 4.4 FAQ section
- **Problem:** Students don't know how to use features
- **Solution:** Static page `/app/faq` explaining all features: Smart Review (FSRS), Quiz modes, Study mode, Progress tracking, Search
- **Size:** S

---

## Sprint 5 — Admin Tools & Infrastructure

### 5.1 Admin frontend
- **Problem:** Admin actions (register students, manage questions) require direct DB access
- **Solution:** Admin section `/app/admin` (role-gated):
  - **Students:** list, register new (creates `users` row), deactivate
  - **Questions:** list, add new, edit existing, soft-delete
  - **Question banks:** manage banks
  - **Organizations:** manage org settings
- **Size:** XL

### 5.2 Learning objectives / study cards (knowledge base)
- **Problem:** No structured learning material beyond questions
- **Solution:** Study cards organized by EASA learning objectives:
  - Browse by subject → topic → subtopic → LO
  - Each LO has: reference code, title, explanation text, related questions
  - Data source: needs content authoring or import
- **Size:** XL

### 5.3 AWS backup
- **Problem:** Data loss risk — Supabase backup exists but no independent backup
- **Solution:** Scheduled backup to AWS S3:
  - pg_dump on schedule (daily)
  - Storage bucket sync
  - Restore procedure documented
- **Size:** L (infrastructure, outside app code)

---

## Suggested Sprint Order

1. **Sprint 1** (Quick Wins) — 1.1–1.10
2. **Sprint 2** (Quiz Overhaul) — 2.1–2.11
3. **Sprint 3** (Dashboard & Analytics) — 3.1–3.6
4. **Sprint 4** (Social, Search, Study) — 4.1–4.4
5. **Sprint 5** (Admin & Infrastructure) — 5.1–5.3

---

## Size Legend

| Size | Effort estimate |
|------|----------------|
| XS | < 1 hour |
| S | 1–3 hours |
| M | Half day to full day |
| L | 1–2 sessions |
| XL | Multi-session |

---

*Created: 2026-03-11 — from user feedback after MVP 2 review*
*Updated: 2026-03-12 — Sprint 1 (Quick Wins) all items marked complete*
