# Manual Eval — Current Build

**Branch:** `feat/post-sprint-3-polish`
**Date:** 2026-03-13
**Login link:** (use output from `npx tsx scripts/dev-login.ts`)
**Dev tools:** Mailpit http://localhost:54324 | Studio http://localhost:54323

---

## Setup (already done)

```bash
npx supabase db reset
cd apps/web
source .env.local
npx tsx scripts/seed-e2e.ts
npx tsx scripts/seed-test-user.ts
npx tsx scripts/seed-eval.ts
cd ../.. && pnpm dev
cd apps/web && npx tsx scripts/dev-login.ts
```

**Seeded data:**
- 2 subjects: Meteorology (20 Qs), Air Law (15 Qs)
- 5 completed quiz sessions (various scores/dates/subjects)
- 1 student user: pilot.oleksandr@proton.me

---

## Quick Test Flow (15 min)

1. Paste magic link in browser → lands on Dashboard
2. **Dashboard** — subject grid loads, activity chart, heatmap, due reviews banner
3. **Sidebar** — 4 items only: Dashboard, Quiz, Progress, Reports (no Smart Review)
4. **Quiz config** — pick Meteorology, try All/Unseen/Incorrect filters, check counter updates
5. **Start quiz (5 questions):**
   - Answer Q1 correctly → green highlight, answer locked
   - Answer Q2 incorrectly → red on yours, green on correct
   - Check Explanation tab → shows feedback
   - Check Statistics tab → auto-loads (no button)
   - Check Comments tab → accessible
   - No Exit button, only "Finish Quiz"
6. **Partial submit** — skip Q4+Q5, click Finish → Submit → should succeed, score = correct/answered
7. **Reports** — new session appears, sort by Date/Score/Subject
8. **Save a draft** — start new quiz, answer 2, Finish → Save for Later
9. **Start another quiz** — answer 1, Save for Later → now 2 drafts
10. **Saved tab** — two draft cards with progress bars, badge count "2"
11. **Resume draft** — click Resume, verify answers restored
12. **Re-save draft** — answer 1 more, Save for Later → should UPDATE same draft (not create new)
13. **Delete draft** — delete one, other remains, confirm dialog shown
14. **Full submit** — start quiz, answer all, Submit → success
15. **/app/review** → should 404

---

## Detailed Checks

### A. Smart Review Removal

| # | Check | Pass? |
|---|-------|-------|
| A1 | Sidebar: Dashboard, Quiz, Progress, Reports only (no Review) | |
| A2 | Mobile bottom nav: 4 items, no Review | |
| A3 | `/app/review` returns 404 | |
| A4 | Reports page: mode labels show Quiz / Mock Exam only | |
| A5 | Dashboard: only "Start Quiz" quick action, no "Start Review" | |

### B. Quiz Answer Feedback

| # | Check | Pass? |
|---|-------|-------|
| B1 | Answer locks immediately after selection | |
| B2 | Correct answer → green highlight | |
| B3 | Wrong answer → red on yours, green on correct | |
| B4 | Cannot change answer after selection | |
| B5 | Explanation tab shows verdict + explanation text after answering | |
| B6 | Explanation tab shows explanation even BEFORE answering (study mode — this is correct) | |
| B7 | Explanation images render above explanation text (if question has one) | |

### C. Tabs

| # | Check | Pass? |
|---|-------|-------|
| C1 | All 4 tabs visible: Question, Explanation, Comments, Statistics | |
| C2 | No tab is greyed out or disabled — all clickable always | |
| C3 | Tab resets to Question when navigating to next question | |

### D. Statistics Tab

| # | Check | Pass? |
|---|-------|-------|
| D1 | Auto-loads — no "Load Statistics" button | |
| D2 | Shows stats immediately (times seen, correct %, etc.) even before answering current question | |
| D3 | No raw FSRS internal state shown to students | |

### E. Quiz Controls

| # | Check | Pass? |
|---|-------|-------|
| E1 | No X / Exit button — only "Finish Quiz" in top bar | |
| E2 | "Finish Quiz" opens dialog with submit/return/save options | |

### F. Partial Quiz Submission

| # | Check | Known issue? |
|---|-------|-------------|
| F1 | Submit with unanswered questions succeeds | Was failing — verify fix |
| F2 | Score = correct / answered (not correct / total) | |
| F3 | Dialog warns about skipped questions (NOT "marked incorrect" — just "skipped") | Was wrong wording |
| F4 | Unanswered questions: NO data stored (no response rows created) | |
| F5 | Full submit (all answered) still works | |

### G. Filter Counters

| # | Check | Pass? |
|---|-------|-------|
| G1 | "All" filter shows total question count | |
| G2 | "Unseen" filter updates counter | |
| G3 | "Incorrect" filter updates counter | |
| G4 | Slider max matches filtered count | |
| G5 | Counter updates on subject change | |

### H. Quiz Drafts

| # | Check | Known issue? |
|---|-------|-------------|
| H1 | Save first draft works | |
| H2 | Save second draft works (2 drafts now) | |
| H3 | Saved tab shows both drafts as separate cards | |
| H4 | Draft card: subject name, code, date, progress bar | |
| H5 | Resume draft restores answers/position | |
| H6 | Re-saving a resumed draft UPDATES it (not creates new) | Was creating duplicate |
| H7 | Delete draft shows confirmation popup first | Was missing |
| H8 | Delete removes only that draft | |
| H9 | Saved tab badge shows draft count | |
| H10 | Max 20 drafts enforced | |

### I. Navigation Guard

| # | Check | Known issue? |
|---|-------|-------------|
| I1 | Browser "Leave site?" dialog on tab close during active quiz | Was not working |
| I2 | Browser warning on back button during active quiz | Was not working |
| I3 | No warning after quiz submitted | |

### J. Reports

| # | Check | Pass? |
|---|-------|-------|
| J1 | Sort by Date (asc/desc) | |
| J2 | Sort by Score (asc/desc) | |
| J3 | Sort by Subject (alphabetical) | |
| J4 | 5 seeded sessions visible with correct scores | |

### K. Dashboard Analytics

| # | Check | Pass? |
|---|-------|-------|
| K1 | Activity chart renders (bar chart of recent activity) | |
| K2 | Activity heatmap renders | |
| K3 | Subject scores chart shows both subjects | |
| K4 | Due reviews banner shows count | |
| K5 | Dashboard loads without errors if analytics RPCs return empty | |

### L. General

| # | Check | Pass? |
|---|-------|-------|
| L1 | No console errors on any page | |
| L2 | Progress page loads and shows data | |
| L3 | Mobile responsive — no overflow/broken layouts | |

---

## Known Issues from Previous Eval

These were flagged in the last eval session — check if they're fixed:

1. **Partial submit failing** (F1) — "Something went wrong, please try again"
2. **Wrong wording in finish dialog** (F3) — said "marked incorrect" instead of "skipped"
3. **Navigation guard not working** (I1, I2) — no browser warning on close/back
4. **Draft re-save creates duplicate** (H6) — should update existing draft
5. **Delete draft has no confirmation** (H7) — should show popup warning
6. **Statistics not updating in-session** (C note) — intentional, but needs student-facing message explaining stats reflect previous quizzes only

---

## After Testing

Fill in Pass? columns, note any new issues below:

### New Issues Found
| # | Page | Description | Severity |
|---|------|-------------|----------|
| | | | |
