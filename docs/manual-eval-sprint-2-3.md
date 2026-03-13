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
2. Enter `pilot.oleksandr@proton.me`
3. Open Mailpit at http://localhost:54324
4. Click the magic link in the email

---

## Sprint 2 — Quiz Overhaul

### 2.1 Subject / Topic / Subtopic Drill-Down

| # | Step | Expected |
|---|------|----------|
| 1 | Navigate to `/app/quiz` | Quiz config form visible with "New Quiz" tab active | DONE 
| 2 | Click the Subject dropdown | Subjects listed with `code — name (count)` format | DONE 
| 3 | Select "050 — Meteorology" | Topic dropdown appears below Subject | DONE 
| 4 | Select a topic | Subtopic dropdown appears (if subtopics exist) | DONE 
| 5 | Clear topic selection ("All topics") | Subtopic dropdown disappears, question count increases | DONE 

### 2.2 Question Filters

| # | Step | Expected |
|---|------|----------|
| 1 | Select a subject | Three radio filters appear: All / Unseen / Incorrectly answered | DONE
| 2 | Select "All questions" | Count shows total available questions | IT DOES NOT UPDATE THE COUNTER CAN SELECT ALL
| 3 | Select "Unseen only" | Count may be lower (only questions you haven't answered) | IT DOES NOT UPDATE THE COUNTER CAN SELECT ALL
| 4 | Select "Incorrectly answered" | Count shows only questions where `last_was_correct = false` (0 if you haven't answered any yet) | IT DOES NOT UPDATE THE COUNTER CAN SELECT ALL

### 2.3 Question Count Slider

| # | Step | Expected |
|---|------|----------|
| 1 | Select a subject | Slider appears with range 1–N | YES
| 2 | Drag slider to different values | Label updates with current count | YES
| 3 | "Up to N available" text shows below | Matches the selected filter's available count | IT DOES NOT UPDATE THE COUNTER CAN SELECT ALL

### 2.4 Start Quiz & Fullscreen Session

| # | Step | Expected |
|---|------|----------|
| 1 | Configure quiz and click "Start Quiz" | Navigates to `/app/quiz/session` | YES
| 2 | Observe layout | Main nav/header hidden — fullscreen quiz environment | YES
| 3 | Check top bar | Exit button (X), progress bar (0/N), session timer ticking | what is the difference between the exit and finish test? we must have only finish test.
| 4 | Check left sidebar (desktop) | Question grid with numbered buttons (1–N), all grey | YES

### 2.5 Question Grid Navigation

| # | Step | Expected |
|---|------|----------|
| 1 | Click question #3 in the grid | Jumps to question 3 | YES
| 2 | Answer question 3 | Grid button 3 turns blue/primary | YES
| 3 | Current question has a ring/outline indicator | Distinguishable from answered/unanswered | YES
| 4 | On mobile | Grid scrolls horizontally | CANNOT CHECK NOW

### 2.6 Flag Questions

| # | Step | Expected |
|---|------|----------|
| 1 | Click the flag button below answer options | Button changes to "Unflag", question grid button turns yellow | YES
| 2 | Click "Unflag" | Returns to normal state | YES 
| 3 | Flagged state persists while navigating between questions | Yellow indicator stays on the grid | YES

### 2.7 Question Tabs

| # | Step | Expected |
|---|------|----------|
| 1 | Before answering, check tabs below options | "Question" tab active. "Explanation" and "Statistics" tabs disabled (greyed out, `cursor-not-allowed`) | EXPLANATION DOES NOT EXIST AT ALL, STATISTICS IS NOT GREYED OUT. COMMENTS ARE NOT GREYED OUT AS WELL. AND THEY SHALL NOT. YOU MUST BE ABLE TO IMMEDIATELY SEE EXPLANATION, COMMENTS, STATISTICS. 
| 2 | "Comments" tab | Visible but shows "Comments are coming soon." placeholder | YES
| 3 | Answer the question | "Explanation" and "Statistics" tabs become enabled | EXPLANATION NEVER COMES. STATISTICS WAS NEVER BLOCKED.
| 4 | Click "Explanation" tab | Shows correct/incorrect verdict, explanation text, optional image | NO EXPLANATION TAB
| 5 | Click "Statistics" tab → "Load Statistics" | Shows: times seen, correct/incorrect counts, accuracy %, last answered date, FSRS state (New/Learning/Review/Relearning), stability, difficulty, interval | WELL IT ONLY SHOWS TIMES SEEN CORRECT INCORRET. AND YOU SHALL NOT CLICK TO SHOW STATISTICKS - LOAD IT IMMEDIATELY.
| 6 | Navigate to next question | Tabs reset to "Question" tab | YES.

FEEDBACK IT NEVER SHOWS ME CORRECT ANSWER AND INCORRECT ANSWER AFTER i SUBMINT. IT JUST SHOWS WHICH ONE WAS SELECTED. THIS IS WRONG. THIS IS NOT EXAM MODE, SO YOU SHALL HAVE IMMEDIATE FEEDBACK.

### 2.8 Deferred Writes (No DB Writes Per Answer)

| # | Step | Expected |
|---|------|----------|
| 1 | Open Supabase Studio → `quiz_session_answers` table | Note current row count |
| 2 | Answer 3–5 questions in a quiz session | Row count should NOT increase (answers are in React state) |
| 3 | Only after submitting quiz (step 2.10) | All answers appear in DB at once |

### 2.9 Exit Button

| # | Step | Expected |
|---|------|----------|
| 1 | With no answers, click Exit (X) | Navigates directly to `/app/quiz` — no confirmation | IT SHALL NOT EXIST. ONLY FINISH TEST MUST EXIST.
| 2 | With 1+ answers, click Exit (X) | Browser `confirm()` dialog: "You have unsaved answers. Leave quiz?" | 
| 3 | Click Cancel | Stays in quiz session |
| 4 | Click OK | Navigates to `/app/quiz`, answers are lost |

### 2.10 Navigation-Away Warning

| # | Step | Expected |
|---|------|----------|
| 1 | With 1+ answers, try to close the browser tab | Browser "Leave site?" dialog appears | NO - CLOSES IMMEDIATELY.
| 2 | With 1+ answers, click browser back button | Warning appears | NO LEAVES IMMEDIATELY.
| 3 | After submitting quiz | No warning — safe to navigate | YES

### 2.11 Finish Quiz Dialog

| # | Step | Expected |
|---|------|----------|
| 1 | Answer some (not all) questions, click "Finish" | Modal dialog appears | YES
| 2 | Dialog shows | Warning about unanswered questions (if any), three buttons | YES
| 3 | Click "Submit" | Quiz submitted, redirects to `/app/quiz/report?session=<id>` | FAILED TO SUBMIT QUIZ. PLEASE TRY AGAIN. 
| 4 | Click "Return" / Cancel | Dialog closes, back to quiz | YES
| 5 | Click "Save for Later" | Draft saved, navigates to `/app/quiz` | YES

### 2.12 Quiz Report Card

| # | Step | Expected |
|---|------|----------|
| 1 | After submitting a quiz | Report page shows at `/app/quiz/report?session=<id>` | YES
| 2 | Score card | Large percentage (green ≥75%, yellow ≥50%, red <50%), correct/total, time taken | YES 
| 3 | Question breakdown | One row per question: check/X icon, question number, truncated text, your answer (green/red), correct answer (if wrong), explanation, response time | YES
| 4 | Navigation buttons | "Back to Dashboard" and "Start Another Quiz" work | YES

### 2.13 Save & Resume Quiz Drafts

| # | Step | Expected |
|---|------|----------|
| 1 | Start a quiz, answer some questions, "Save for Later" | Navigates to `/app/quiz` | YES
| 2 | Check "Saved Quiz" tab | Tab shows a badge indicator (1) | YES
| 3 | Click "Saved Quiz" tab | Draft card visible: subject, progress bar (X/Y answered, %), date saved | YES
| 4 | Click "Resume" | Returns to quiz session with previous answers and position restored | YES
| 5 | Continue answering, submit quiz | Draft is consumed — "Saved Quiz" tab returns to empty state | YES

**Delete Draft:**

| # | Step | Expected |
|---|------|----------|
| 1 | Save a draft, go to "Saved Quiz" tab | Draft card visible | YES
| 2 | Click "Delete" | Draft removed, empty state shown | YES
| 3 | Only one draft per student at a time | Saving a new draft replaces any existing one | THIS IS WRONG. YU CAN SAVE AS MANY TESTS AS YOU WANT.

### 2.14 Incorrectly Answered Tracking (FSRS Integration)

| # | Step | Expected |
|---|------|----------|
| 1 | Answer a question incorrectly | `last_was_correct = false` in `fsrs_cards` (check Studio) |
| 2 | Start new quiz with "Incorrectly answered" filter | The wrong question appears in the pool |
| 3 | Answer it correctly twice in a row | `consecutive_correct_count = 2`, exits the "incorrectly answered" pool |
| 4 | Answer it incorrectly again | `consecutive_correct_count` resets to 0, re-enters pool |

---

## Sprint 3 — Dashboard & Analytics

### 3.1 Dashboard Layout

| # | Step | Expected |
|---|------|----------|
| 1 | Navigate to `/app/dashboard` | Dashboard loads with analytics sections | YES
| 2 | Layout includes | Activity chart, heatmap, subject scores donut, due reviews banner, quick actions, subject grid, "View all reports" link | YES
| 3 | If no quiz data exists | Charts show empty states ("No activity data yet", "Complete some quizzes to see subject scores") | YES
| 4 | Quick Actions | "Start Quiz" (primary button) → `/app/quiz`, "Start Review" (bordered) → `/app/review` | YES

### 3.2 Activity Bar Chart (30-Day)

| # | Step | Expected |
|---|------|----------|
| 1 | Complete 2–3 quizzes on different days | Activity chart populates | YES
| 2 | Stacked bars show | Bottom bar: correct (green-ish), top bar: incorrect (red-ish) | YES
| 3 | X-axis | Dates in `d MMM` format (e.g., "13 Mar"), 30 days shown | YES
| 4 | Hover over a bar | Tooltip shows exact correct + incorrect counts for that day | YES
| 5 | Before hydration | Animated pulse skeleton (no layout jump) | YES

### 3.3 Subject Scores Donut Chart

| # | Step | Expected |
|---|------|----------|
| 1 | Complete quizzes in a subject | Donut chart appears with slice for that subject | YES
| 2 | Multiple subjects | Each gets a colored slice |
| 3 | Legend | Shows: color dot, subject name, avg score % | YES
| 4 | Hover over slice | Tooltip: "Avg Score: X%" | YES
| 5 | Top 5 subjects by session count | Only 5 slices max |

### 3.4 Study Streak Heatmap

| # | Step | Expected |
|---|------|----------|
| 1 | Complete some quizzes | Heatmap grid appears (30-day squares) | YES
| 2 | Day squares | 16×16px, 5-tier green intensity based on question count | YES
| 3 | Hover over a square | Tooltip shows date + question count | YES
| 4 | Legend | "Less → More" color scale at bottom | YES
| 5 | No activity | Heatmap hidden entirely | YES
| 6 | Intensity tiers | 0: grey, 1-5: light green, 6-15: medium, 16-30: darker, 31-50: dark, 50+: darkest | YES

### 3.5 Due Reviews Banner

| # | Step | Expected |
|---|------|----------|
| 1 | After answering questions (FSRS schedules reviews) | Banner shows "X cards due for review" | YES
| 2 | Click the review link | Navigates to `/app/review` | YES
| 3 | No cards due | Banner hidden or shows 0 | YES

### 3.6 Reports Page

| # | Step | Expected |
|---|------|----------|
| 1 | Navigate to `/app/reports` (sidebar link or "View all reports" from dashboard) | Session history list visible | YES
| 2 | Each row shows | Mode (Quiz/Smart Review/Mock Exam), subject name, correct/total, duration, date, score % | YES
| 3 | Click column header "Date" | Sorts by date (toggle asc/desc) | YES
| 4 | Click "Score" | Sorts by score | NO SORTING WORKS AT ALL
| 5 | Click "Subject" | Sorts alphabetically | NOPE
| 6 | Active sort column | Shows up/down arrow | YES
| 7 | Click any row | Navigates to `/app/quiz/report?session=<id>` | YES

### 3.7 Statistics Tab (Per-Question Stats)

| # | Step | Expected |
|---|------|----------|
| 1 | In a quiz session, answer a question | "Statistics" tab becomes enabled |
| 2 | Click "Statistics" tab | "Load Statistics" button appears (lazy load) |
| 3 | Click "Load Statistics" | Shows: times seen, correct count (accuracy %), incorrect count, last answered date |
| 4 | FSRS section | State label (New/Learning/Review/Relearning), stability, difficulty, interval in days |

### 3.8 Navigation — Reports Link

| # | Step | Expected |
|---|------|----------|
| 1 | Check sidebar nav (desktop) | "Reports" link present |
| 2 | Check mobile nav | "Reports" link present |
| 3 | Active link highlighting | Current page link is highlighted |

### 3.9 Graceful Degradation

| # | Step | Expected |
|---|------|----------|
| 1 | If analytics RPCs fail (e.g., network error) | Dashboard still loads — charts show empty state, main content (subject grid, due reviews) still works |
| 2 | Check browser console | No unhandled exceptions — errors logged cleanly |

### 3.10 Dashboard vs Progress Differentiation

| # | Step | Expected |
|---|------|----------|
| 1 | `/app/dashboard` | Activity-focused: charts, heatmap, quick actions | YES
| 2 | `/app/progress` | Mastery-focused: overall mastery %, expandable subject → topic drill-down with progress bars | YES
| 3 | Both pages load independently | No data dependency between them | YES

---

## Smart Review (Pre-existing, verify still works)

| # | Step | Expected |
|---|------|----------|
| 1 | Navigate to `/app/review` | Review config page | YES
| 2 | Start a review session | Shows due FSRS cards | IT IS JUST QUESTIONS
| 3 | Answer questions | FSRS state updates (check `fsrs_cards` in Studio) |
| 4 | Complete review | Session completes, appears in Reports |
FEEDBACK - QUESTION OLLOWS THE PREVIOUS FORMAT HERE AND DOES NOT MATCH THE QUIZ. MUST MATCH. CANNOT CONFIGURE ANYTHING. BASICALLY, I DON'T LIKE THIS FEATURE AT ALL. THE WAY IT IS REALISED NOW IS STUPID.
---

## Cross-Cutting Checks

### Responsive Design

| # | Check | Expected |
|---|-------|----------|
| 1 | Quiz session on mobile | Question grid scrolls horizontally, no sidebar |
| 2 | Dashboard on mobile | Charts stack vertically |
| 3 | Reports on mobile | Table scrolls or adapts |
| 4 | Sidebar nav | Hidden on mobile, visible on md+ |

### Data Integrity

| # | Check | Expected |
|---|-------|----------|
| 1 | Complete a quiz → check `quiz_session_answers` in Studio | All answers present with correct `response_time_ms` |
| 2 | Check `quiz_sessions` | `ended_at` populated, `score_percentage` correct |
| 3 | Check `fsrs_cards` | Entries created/updated for answered questions |
| 4 | Check `student_responses` | Historical record of each answer |
| 5 | Check `audit_events` | Events logged for session start, answer submit, session complete |

### Security

| # | Check | Expected |
|---|-------|----------|
| 1 | Quiz report URL with someone else's session ID | Returns null / empty — no data leakage |
| 2 | Analytics RPCs | Only return data for the logged-in user |
| 3 | Correct answers | Not visible in the browser network tab during quiz (only after answering) |
| 4 | Try `/app/dashboard` without auth | Redirected to login |

---

## Known Limitations

- **Comments tab** — placeholder only ("Coming soon"). Full feature planned for Sprint 4.
- **Question flags** — session-local only (React state). Not persisted to DB.
- **EASA reference tables** — `easa_subjects`, `easa_topics`, `easa_subtopics` may be empty unless seeded. The seed-e2e script creates one subject/topic/subtopic. For full testing, import real QDB data.
- **One draft per student** — saving a new draft replaces any existing one.
- **Incorrectly answered filter** — requires prior quiz history to show results. Empty on first use.
