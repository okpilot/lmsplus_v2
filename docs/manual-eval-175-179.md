# Manual Eval Checklist — Issues #175–#179

## Prerequisites

- Log in as a student with quiz history (eval seed)
- Have at least one saved/draft quiz and one completed quiz session
- Test on both desktop (>=768px) and mobile (390px viewport in DevTools)

---

## 1. Dashboard Redesign (#175, PR #269)

### Layout & Navigation

- [ ] **Desktop**: sidebar (192px) with Dashboard / Quiz / Reports links — no "Progress" link
- [ ] **Desktop**: sidebar collapse button works, icon-only mode, preference persists on reload
- [ ] **Mobile**: bottom tab bar (Dashboard / Quiz / Reports) with icons + labels, active state highlights
- [ ] **Mobile**: no hamburger menu / sidebar visible
- [ ] **Header**: "LMS Plus" left, user name + dark mode toggle + "Sign out" right (desktop)
- [ ] **Header mobile**: "LMS Plus" left, avatar circle with initials right

### Stat Cards (3)

- [ ] **Exam Readiness**: shows percentage, "X / 9 subjects at 90%+", projection date
- [ ] **Questions Today**: shows count / 50 goal, progress bar fills proportionally
- [ ] **Study Streak**: shows consecutive days, best streak
- [ ] **Mobile**: 3 compact cards in a row with abbreviated labels
- [ ] All values are **live data** (not hardcoded) — answer a question and refresh to verify count changes

### Heatmap

- [ ] Single-row layout for current month (March 2026 = 31 squares)
- [ ] Day squares have green intensity tiers based on activity
- [ ] Day number labels visible below (desktop: 1, 5, 10, 15, 20, 25, 30, 31)
- [ ] Info tooltip (i icon) explains color meaning

### Subject Progress Grid

- [ ] All 9 EASA subjects displayed (010 through 090)
- [ ] **Desktop**: 3-column grid
- [ ] **Mobile**: single-column stack
- [ ] Each card: subject code + name + percentage + color-coded progress bar
  - Red (<50%) / Amber (50-89%) / Green (90%+)
- [ ] "Last practiced" relative date shown

### Dark Mode

- [ ] Toggle dark mode — dashboard renders correctly (colors, borders, backgrounds)

### Cleanup

- [ ] Old activity chart removed
- [ ] Old subject scores chart removed
- [ ] "Start Quiz" button visible (top-right desktop, full-width below greeting on mobile)

---

## 2. Quiz Setup Redesign (#176, PR #272)

### Tabs

- [ ] "New Quiz" and "Saved Quizzes (N)" tabs visible, count badge on Saved Quizzes
- [ ] Tab switching works, active tab has underline

### New Quiz Form — Card 1: Configuration

- [ ] Subject dropdown with all 9 EASA subjects
- [ ] Study / Exam mode toggle (segmented control)
  - Study: currently active, explanations after each answer
  - Exam: may show "coming soon" or be selectable
- [ ] Helper text below mode toggle explains the difference
- [ ] Question filter pills: "All questions", "Unseen only", "Incorrect only", "Flagged" — multi-select

### New Quiz Form — Card 2: Number of Questions

- [ ] Slider adjusts question count
- [ ] Preset buttons: 10, 25, 50, All — clicking a preset updates slider
- [ ] "of N selected" text updates dynamically based on topic selection

### New Quiz Form — Card 3: Topics

- [ ] "Select all" checkbox works
- [ ] Collapsible topic tree with chevrons
- [ ] Checkboxes at topic and subtopic level
- [ ] Per-topic and per-subtopic question counts shown
- [ ] Unchecking a topic unchecks all its subtopics
- [ ] Question count updates when topics are checked/unchecked

### Start Quiz

- [ ] "Start Quiz" button full-width at bottom
- [ ] Clicking starts a quiz with selected configuration
- [ ] **Mobile**: button fixed at bottom above tab bar

### Saved Quizzes Tab

- [ ] Draft cards show subject, save date, progress (X of Y answered), percentage
- [ ] Progress bar fills proportionally
- [ ] "Resume" button resumes the quiz session
- [ ] "Delete" button removes the draft (confirm works)
- [ ] **Mobile**: cards stacked full-width

---

## 3. Quiz Session Redesign (#177, PRs #315, #317, #319, #320, #322)

### Layout

- [ ] **Full-screen**: no sidebar or app header visible during quiz
- [ ] Progress bar across top shows % complete

### Question Navigator Grid

- [ ] Numbered circles for each question, horizontally scrollable
- [ ] Color coding:
  - Blue fill = current question
  - Green fill = answered correctly
  - Red fill = answered incorrectly
  - Amber/yellow border = flagged
  - Gray border = unanswered
- [ ] Clicking a circle navigates to that question

### Answer Options

- [ ] 4 options with letter circles (A/B/C/D)
- [ ] **Unselected**: gray outline
- [ ] **Selected**: blue border + light blue background, blue circle
- [ ] **Correct** (after submit): green border + green tint
- [ ] **Incorrect** (after submit): red border + red tint
- [ ] Options lock after submission (can't re-select)

### 4 Tabs

- [ ] **Question tab**: question text + answer options
- [ ] **Explanation tab**: explanation text, image placeholders (side-by-side desktop / stacked mobile), Learning Objective box at bottom
- [ ] **Comments tab**: threaded comments with colored avatar circles + initials
  - [ ] Admin comments have "LMS Plus" badge
  - [ ] "Add a comment..." input works, comment appears after posting
  - [ ] Comment count shows in tab label "Comments (N)"
- [ ] **Statistics tab**: bordered table with Times seen / Correct (green) / Incorrect (red) / Last answered

### Action Bar

- [ ] **Desktop**: Previous (left) / Flag + Submit + Pin (center) / Next (right)
- [ ] **Mobile**: Submit full-width above, Previous / Flag / Pin / Next in bottom bar
- [ ] Flag button toggles flag state (persists — check DB `flagged_questions` table)
- [ ] Pin button works (session-ephemeral)
- [ ] Submit Answer submits and reveals correct/incorrect state
- [ ] On non-Question tabs: Submit button hidden, nav buttons still visible

### Timer

- [ ] Elapsed time visible throughout session (desktop: info bar, mobile: header)

### Finish Dialog

- [ ] "Finish Test" button opens dialog
- [ ] **Desktop**: centered modal with backdrop
- [ ] **Mobile**: bottom sheet sliding up
- [ ] Shows: "You have answered X of Y questions" + warning about unanswered
- [ ] 4 actions: Submit Quiz / Save for Later / Return to Quiz / Discard Quiz
- [ ] **Submit Quiz**: completes session, navigates to results
- [ ] **Save for Later**: saves draft, returns to quiz setup
- [ ] **Return to Quiz**: closes dialog, resumes
- [ ] **Discard Quiz**: cancels attempt entirely (no record)

---

## 4. Quiz Results Redesign (#178, PR #323)

### Score Ring

- [ ] Circular SVG ring with percentage in center
- [ ] **Green** (>=70%) / **Amber** (50-69%) / **Red** (<50%)
- [ ] Ring is ~120px on desktop, ~90px on mobile

### Summary Card

- [ ] "Quiz Complete" heading
- [ ] Stats grid: Subject, Date, Correct count, Time, Skipped
- [ ] "Start Another Quiz" button → `/app/quiz`
- [ ] "Back to Dashboard" button → `/app/dashboard`
- [ ] **Mobile**: score ring centered, stats in compact row below

### Question Breakdown

- [ ] "Question Breakdown" heading + question count
- [ ] Each row: status icon (green check / red cross) + question number + truncated text + response time
- [ ] Correct answers: green "Your answer" text
- [ ] Incorrect answers: red "Your answer" + green "Correct answer" below, pink/red tint background
- [ ] Pagination or "show all" for long quizzes

### Dual Entry Points

- [ ] Accessible after completing a quiz (post-quiz flow)
- [ ] Accessible from Reports page by clicking a session row/card

---

## 5. Reports Redesign (#179, PR #324)

### Desktop Table

- [ ] Columns: Date, Subject, Mode, Correct, Time, Score
- [ ] **Mode column**: "Study" as plain text, "EXAM" as bordered badge
- [ ] **Score**: color-coded (green >=70% / amber 50-69% / red <50%)
- [ ] Rows clickable → navigates to Quiz Results page for that session
- [ ] Sortable by Date and Score
- [ ] Subtitle: "N completed sessions"

### Mobile Cards

- [ ] Cards show: subject + score (large, color-coded) + date + mode/correct/time
- [ ] Cards clickable → Quiz Results
- [ ] Bottom tab bar visible with Reports active

---

## 6. Cross-Cutting Checks

### Responsiveness

- [ ] Resize browser from desktop → mobile: all pages transition cleanly at 768px
- [ ] No horizontal scroll overflow on mobile (390px)
- [ ] Bottom tab bar doesn't overlap content on mobile

### Navigation Flow

- [ ] Dashboard "Start Quiz" → Quiz Setup page
- [ ] Quiz Setup "Start Quiz" → Quiz Session (full-screen)
- [ ] Quiz Session "Finish Test" → Submit → Quiz Results
- [ ] Quiz Results "Start Another Quiz" → Quiz Setup
- [ ] Quiz Results "Back to Dashboard" → Dashboard
- [ ] Reports row click → Quiz Results for that session
- [ ] Reports "Back" → stays in reports (no broken navigation)

### Data Integrity

- [ ] Complete a quiz → verify it appears in Reports table
- [ ] Complete a quiz → dashboard stat cards update (questions today, streak if applicable)
- [ ] Flag a question during quiz → verify it persists (flagged_questions table)
- [ ] Post a comment on a question → verify it shows for other users on the same question
- [ ] Save a quiz for later → verify it appears in Saved Quizzes tab with correct progress

### Dark Mode

- [ ] Toggle dark mode on each page — verify no broken colors, unreadable text, or missing borders
