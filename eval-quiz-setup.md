# Manual Eval — Quiz Setup Redesign (PR #272)

Branch: `feat/176-quiz-setup-redesign`
Server: http://localhost:3000

## Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@lmsplus.local | admin123! |
| Student | student@lmsplus.local | student123! |

## Seeded Data

- 3 subjects: MET (15q), ALW (8q), FPP (14q) — 37 questions total
- 7 topics, 9 subtopics
- 10 student responses (4 incorrect) — for unseen/incorrect filters
- 5 flagged questions — for flagged filter
- 1 saved draft (2/5 answered, Meteorology)

## Checklist

### Tab Layout
- [ ] "New Quiz" tab is active by default
- [ ] "Saved Quizzes" tab shows badge with draft count (1)

### Subject Select
- [ ] Dropdown shows 3 subjects (code — name)
- [ ] Selecting a subject loads topic tree below
- [ ] Switching subject resets filters, count, and topic tree

### Topic Tree
- [ ] Shows topics with expand/collapse chevrons
- [ ] Subtopics appear indented when expanded
- [ ] "Select all" checkbox toggles everything
- [ ] Uncheck a subtopic → parent auto-unchecks
- [ ] Check all subtopics of a topic → parent auto-checks
- [ ] Uncheck topics → slider max decreases

### Question Count
- [ ] Slider adjusts from 1 to max
- [ ] Preset buttons: 10, 25, 50, All
- [ ] Presets disable when value > available questions
- [ ] "All" button sets slider to max

### Mode Toggle
- [ ] "Study" is selected by default
- [ ] "Exam" is disabled with "Coming soon" badge

### Filters
- [ ] "All questions" active by default
- [ ] "Unseen only" → count updates (fewer than total)
- [ ] "Incorrectly answered" → count updates (~4)
- [ ] "Flagged" → count updates (5)
- [ ] Multi-filter: "Unseen" + "Flagged" → union count
- [ ] Selecting "All questions" clears other filters
- [ ] Deselecting all filters reverts to "All"

### Start Quiz
- [ ] Button disabled until subject selected
- [ ] Start quiz with default settings → session starts
- [ ] Start quiz with filters → correct questions loaded
- [ ] Start quiz with partial topic selection → only those topics

### Saved Quizzes Tab
- [ ] Shows 1 draft with progress bar (2/5 = 40%)
- [ ] Resume → navigates to /app/quiz/session with correct state
- [ ] Delete → draft disappears from list

### Edge Cases
- [ ] Uncheck ALL topics → Start disabled or shows 0
- [ ] Start with 0 matching questions → error message
- [ ] Rapid subject switching → no stale data

### Permissions
- [ ] Login as admin → /app/quiz works the same
- [ ] Unauthenticated → redirected to login

## Bugs Found

| # | Severity | Description | Status |
|---|----------|-------------|--------|
| 1 | | | |
| 2 | | | |
| 3 | | | |
