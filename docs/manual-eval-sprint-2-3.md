# Manual Evaluation — Sprint 2 & Sprint 3

> Checklist for manually testing all features built in Sprint 2 (Quiz Overhaul) and Sprint 3 (Dashboard & Analytics).

---

## Prerequisites

### Local Dev Environment

| Service | URL |
|---------|-----|
| App | http://localhost:3000 |
| Supabase Studio | http://localhost:54323 |
| Mailpit (email) | http://localhost:54324 |
| Supabase API | http://localhost:54321 |

### Setup Commands

```bash
# 1. Start Docker Desktop (required for local Supabase)
# 2. Start local Supabase
npx supabase start

# 3. Reset DB + apply all migrations
npx supabase db reset

# 4. Seed test data (org, user, bank, 20 questions, reference data)
cd apps/web && npx tsx scripts/seed-e2e.ts

# 5. Seed your dev user
cd apps/web && npx tsx scripts/seed-test-user.ts

# 6. Start dev server
pnpm dev

# 7. Generate a magic link (no email needed)
cd apps/web && npx tsx scripts/dev-login.ts
# Paste the printed URL into your browser to log in.
```

### Alternative Login (via Mailpit)
1. Go to http://localhost:3000
2. Enter `student@example.com`
3. Open Mailpit at http://localhost:54324
4. Click the magic link in the email

---

## Sprint 2 — Quiz Overhaul

### 2.1 Subject / Topic / Subtopic Drill-Down

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1 | Navigate to `/app/quiz` | Quiz config form visible with "New Quiz" tab active | DONE |
| 2 | Click the Subject dropdown | Subjects listed with `code — name (count)` format | DONE |
| 3 | Select "050 — Meteorology" | Topic dropdown appears below Subject | DONE |
| 4 | Select a topic | Subtopic dropdown appears (if subtopics exist) | DONE |
| 5 | Clear topic selection ("All topics") | Subtopic dropdown disappears, question count increases | DONE |

### 2.2 Question Filters

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1 | Select a subject | Three radio filters appear: All / Unseen / Incorrectly answered | DONE |
| 2 | Select "All questions" | Count shows total available questions | Counter did not update — could select all |
| 3 | Select "Unseen only" | Count may be lower (only questions you haven't answered) | Counter did not update — could select all |
| 4 | Select "Incorrectly answered" | Count shows only questions where `last_was_correct = false` (0 if you haven't answered any yet) | Counter did not update — could select all |

### 2.3 Question Count Slider

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1 | Select a subject | Slider appears with range 1–N | YES |
| 2 | Drag slider to different values | Label updates with current count | YES |
| 3 | "Up to N available" text shows below | Matches the selected filter's available count | Counter did not update — could select all |

### 2.4 Start Quiz & Fullscreen Session

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1 | Configure quiz and click "Start Quiz" | Navigates to `/app/quiz/session` | YES |
| 2 | Observe layout | Main nav/header hidden — fullscreen quiz environment | YES |
| 3 | Check top bar | "Finish Quiz" button only (no separate Exit button), progress bar (0/N), session timer ticking | Note: Exit and Finish were both present — only Finish should exist |
| 4 | Check left sidebar (desktop) | Question grid with numbered buttons (1–N), all grey | YES |

### 2.5 Question Grid Navigation

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1 | Click question #3 in the grid | Jumps to question 3 | YES |
| 2 | Answer question 3 | Grid button 3 turns blue/primary | YES |
| 3 | Current question has a ring/outline indicator | Distinguishable from answered/unanswered | YES |
| 4 | On mobile | Grid scrolls horizontally | Not tested |

### 2.6 Pin Questions

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1 | Click the "Pin" button below answer options | Button changes to "Unpin", question grid button turns yellow | YES |
| 2 | Click "Unpin" | Returns to normal state | YES |
| 3 | Pinned state persists while navigating between questions | Yellow indicator stays on the grid | YES |

### 2.7 Question Tabs

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1 | Before answering, check tabs below options | All 4 tabs visible and accessible: Question, Explanation, Comments, Statistics | Explanation was missing; Statistics was not greyed out — all tabs should always be accessible |
| 2 | "Comments" tab | Visible but shows "Comments are coming soon." placeholder | YES |
| 3 | Answer the question | Explanation tab shows the explanation | Explanation was not showing after answering |
| 4 | Click "Explanation" tab | Shows correct/incorrect verdict, explanation text, optional image | No Explanation tab was present |
| 5 | Click "Statistics" tab | Auto-loads: times seen, correct/incorrect counts, accuracy %, last answered date | Only showed times seen, correct, incorrect. Should load immediately without a button click |
| 6 | Navigate to next question | Tabs reset to "Question" tab | YES |

> **Note (original eval):** Immediate feedback (green/red highlight + explanation) was not shown after answering. The app only showed which option was selected. In training mode, correct/incorrect feedback must be immediate.

### 2.8 Deferred Writes (No DB Writes Per Answer)

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1 | Open Supabase Studio → `quiz_session_answers` table | Note current row count | |
| 2 | Answer 3–5 questions in a quiz session | Row count should NOT increase (answers are in React state) | |
| 3 | Only after submitting quiz (step 2.10) | All answers appear in DB at once | |

### 2.9 Exit Button (Removed)

> **Note:** The Exit (X) button was removed. Only "Finish Quiz" exists. The checks below reflect what the original eval found and what was subsequently fixed.

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1 | With no answers, open Finish dialog | "Finish Quiz" button opens finish dialog | Was: X button navigated directly to `/app/quiz` — should not exist |
| 2 | Finish dialog shows options | Submit / Save for Later / Discard / Return | |

### 2.10 Navigation-Away Warning

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1 | With 1+ answers, try to close the browser tab | Browser "Leave site?" dialog appears | Did not appear — closed immediately |
| 2 | With 1+ answers, click browser back button | Warning appears | Did not appear — left immediately |
| 3 | After submitting quiz | No warning — safe to navigate | YES |

### 2.11 Finish Quiz Dialog

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1 | Answer some (not all) questions, click "Finish" | Modal dialog appears | YES |
| 2 | Dialog shows | Warning about unanswered questions (if any), action buttons | YES |
| 3 | Click "Submit" | Quiz submitted, redirects to `/app/quiz/report?session=<id>` | Failed to submit — "Failed to submit quiz. Please try again." |
| 4 | Click "Return" / Cancel | Dialog closes, back to quiz | YES |
| 5 | Click "Save for Later" | Draft saved, navigates to `/app/quiz` | YES |

### 2.12 Quiz Report Card

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1 | After submitting a quiz | Report page shows at `/app/quiz/report?session=<id>` | YES |
| 2 | Score card | Large percentage (green ≥75%, yellow ≥50%, red <50%), correct/total, time taken | YES |
| 3 | Question breakdown | One row per question: check/X icon, question number, truncated text, your answer (green/red), correct answer (if wrong), explanation, response time | YES |
| 4 | Navigation buttons | "Back to Dashboard" and "Start Another Quiz" work | YES |

### 2.13 Save & Resume Quiz Drafts

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1 | Start a quiz, answer some questions, "Save for Later" | Navigates to `/app/quiz` | YES |
| 2 | Check "Saved Quiz" tab | Tab shows a badge indicator | YES |
| 3 | Click "Saved Quiz" tab | Draft card visible: subject, progress bar (X/Y answered, %), date saved | YES |
| 4 | Click "Resume" | Returns to quiz session with previous answers and position restored | YES |
| 5 | Continue answering, submit quiz | Draft is consumed — "Saved Quiz" tab returns to empty state | YES |

**Delete Draft:**

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1 | Save a draft, go to "Saved Quiz" tab | Draft card visible | YES |
| 2 | Click "Delete" | Draft removed, empty state shown | YES |
| 3 | Multiple drafts supported (up to 20) | Saving additional drafts adds new cards; existing drafts are not replaced | Was incorrectly limited to one draft per student — multiple drafts now supported |

### 2.14 Incorrectly Answered Tracking

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1 | Answer a question incorrectly | `last_was_correct = false` in `fsrs_cards` (check Studio) | |
| 2 | Start new quiz with "Incorrectly answered" filter | The wrong question appears in the pool | |
| 3 | Answer it correctly twice in a row | `consecutive_correct_count = 2`, exits the "incorrectly answered" pool | |
| 4 | Answer it incorrectly again | `consecutive_correct_count` resets to 0, re-enters pool | |

---

## Sprint 3 — Dashboard & Analytics

### 3.1 Dashboard Layout

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1 | Navigate to `/app/dashboard` | Dashboard loads with analytics sections | YES |
| 2 | Layout includes | Activity chart, heatmap, due reviews banner, quick actions, subject grid, "View all reports" link | YES |
| 3 | If no quiz data exists | Charts show empty states ("No activity data yet", "Complete some quizzes to see subject scores") | YES |
| 4 | Quick Actions | "Start Quiz" (primary button) → `/app/quiz` | YES |

### 3.2 Study Streak Heatmap

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1 | Complete some quizzes | Heatmap grid appears (30-day squares) | YES |
| 2 | Day squares | 16×16px, 5-tier green intensity based on question count | YES |
| 3 | Hover over a square | Tooltip shows date + question count | YES |
| 4 | Legend | "Less → More" color scale at bottom | YES |
| 5 | No activity | Heatmap hidden entirely | YES |
| 6 | Intensity tiers | 0: grey, 1-5: light green, 6-15: medium, 16-30: darker, 31-50: dark, 50+: darkest | YES |

### 3.3 Due Reviews Banner

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1 | After answering questions | Banner shows "X cards due for review" if any are due | YES |
| 2 | No cards due | Banner hidden or shows 0 | YES |

### 3.4 Reports Page

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1 | Navigate to `/app/reports` (sidebar link or "View all reports" from dashboard) | Session history list visible | YES |
| 2 | Each row shows | Mode (Quiz/Mock Exam), subject name, correct/total, duration, date, score % | YES |
| 3 | Click column header "Date" | Sorts by date (toggle asc/desc) | YES |
| 4 | Click "Score" | Sorts by score | Sorting did not work |
| 5 | Click "Subject" | Sorts alphabetically | Sorting did not work |
| 6 | Active sort column | Shows up/down arrow | YES |
| 7 | Click any row | Navigates to `/app/quiz/report?session=<id>` | YES |

### 3.5 Statistics Tab (Per-Question Stats)

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1 | In a quiz session, click "Statistics" tab | Loads immediately — no button click required | |
| 2 | Stats shown | Times seen, correct count (accuracy %), incorrect count, last answered date | |

### 3.6 Navigation — Reports Link

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1 | Check sidebar nav (desktop) | "Reports" link present | |
| 2 | Check mobile nav | "Reports" link present | |
| 3 | Active link highlighting | Current page link is highlighted | |

### 3.7 Graceful Degradation

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1 | If analytics RPCs fail (e.g., network error) | Dashboard still loads — charts show empty state, main content (subject grid, due reviews) still works | |
| 2 | Check browser console | No unhandled exceptions — errors logged cleanly | |

### 3.8 Dashboard vs Progress Differentiation

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1 | `/app/dashboard` | Activity-focused: charts, heatmap, quick actions | YES |
| 2 | `/app/progress` | Mastery-focused: overall mastery %, expandable subject → topic drill-down with progress bars | YES |
| 3 | Both pages load independently | No data dependency between them | YES |

---

## Cross-Cutting Checks

### Responsive Design

| # | Check | Expected | Result |
|---|-------|----------|--------|
| 1 | Quiz session on mobile | Question grid scrolls horizontally, no sidebar | |
| 2 | Dashboard on mobile | Charts stack vertically | |
| 3 | Reports on mobile | Table scrolls or adapts | |
| 4 | Sidebar nav | Hidden on mobile, visible on md+ | |

### Data Integrity

| # | Check | Expected | Result |
|---|-------|----------|--------|
| 1 | Complete a quiz → check `quiz_session_answers` in Studio | All answers present with correct `response_time_ms` | |
| 2 | Check `quiz_sessions` | `ended_at` populated, `score_percentage` correct | |
| 3 | Check `fsrs_cards` | Entries created/updated for answered questions | |
| 4 | Check `student_responses` | Historical record of each answer | |
| 5 | Check `audit_events` | Events logged for session start, answer submit, session complete | |

### Security

| # | Check | Expected | Result |
|---|-------|----------|--------|
| 1 | Quiz report URL with someone else's session ID | Returns null / empty — no data leakage | |
| 2 | Analytics RPCs | Only return data for the logged-in user | |
| 3 | Correct answers | Not visible in the browser network tab during quiz (only after answering) | |
| 4 | Try `/app/dashboard` without auth | Redirected to login | |

---

## Known Limitations

- **Comments tab** — placeholder only ("Coming soon"). Full feature planned for Sprint 4.
- **Question pins** — session-local only (React state). Not persisted to DB.
- **EASA reference tables** — `easa_subjects`, `easa_topics`, `easa_subtopics` may be empty unless seeded. The seed-e2e script creates one subject/topic/subtopic. For full testing, import real QDB data.
- **Multiple drafts** — up to 20 saved quizzes per student. Saving a 21st returns an error.
- **Incorrectly answered filter** — requires prior quiz history to show results. Empty on first use.
