# Manual Eval — Current Build (Round 2)

**Branch:** `feat/post-sprint-3-polish`
**Date:** 2026-03-13
**Commits:** `157f421` (6 fixes) + `5c344c0` (agent findings)
**Login:** `cd apps/web && npx tsx scripts/dev-login.ts` → paste link in browser
**Dev tools:** Mailpit http://localhost:54324 | Studio http://localhost:54323

---

## What changed since last eval

| # | Fix | What to verify |
|---|-----|---------------|
| 1 | Answer selection no longer carries over to next question | Navigate between questions — each starts fresh, no stale highlight |
| 2 | Incorrect filter counter now matches slider | Answer incorrectly, submit, answer correctly, submit → "Incorrect" filter shows 0/0 |
| 3 | "Flag" renamed to "Pin" | Button says "Pin"/"Unpin", yellow highlight in question grid |
| 4 | "Discard Quiz" option in finish dialog | Click Finish → see Discard link → confirmation step → discards session |
| 5 | Reports show correct/answered (not correct/total) | Submit partial quiz → report shows "3/3 correct" not "3/5 correct" |
| 6 | Soft-delete on draft discard | Discard with a saved draft → draft is soft-deleted (check Studio if curious) |

---

## Quick Test Flow (10 min)

1. Paste magic link → Dashboard
2. **Quiz config** → pick Meteorology, All filter, 5 questions → Start
3. **Answer Q1** → verify green highlight, answer locked, no selection on Q2
4. **Pin Q2** → button says "Pin", Q2 shows yellow in grid
5. **Answer Q3 incorrectly** → red on yours, green on correct
6. **Check Explanation tab** → shows feedback
7. **Check Statistics tab** → auto-loads
8. **Skip Q4 + Q5** → click Finish Quiz
9. **Finish dialog** → verify "2 questions are unanswered and will be skipped" (not "marked incorrect")
10. **Click "Discard Quiz"** → confirmation appears → click "Yes, discard" → back to quiz config
11. **Start new quiz (5 questions)** → answer 3, skip 2 → Finish → Submit
12. **Report card** → shows "3/3 correct" (not 3/5), score 100%
13. **Reports page** → new session appears, sort by Date/Score/Subject works
14. **Quiz config** → check Incorrect filter counter matches slider (both should be 0 or same number)
15. **Save a draft** → start quiz, answer 1, Finish → Save for Later → verify in Saved tab

---

## Detailed Checks

### A. New Fixes (priority — these are the changes)

| # | Check | Pass? |
|---|-------|-------|
| A1 | Answer selection resets when navigating to next question (no stale highlight) | |
| A2 | Pin button shows "Pin"/"Unpin" (not Flag/Unflag) | |
| A3 | Pinned questions show yellow in question grid | |
| A4 | Finish dialog has "Discard Quiz" link at the bottom | |
| A5 | Discard shows confirmation: "Are you sure? Your progress will be lost." | |
| A6 | Confirming discard returns to quiz config, no session saved | |
| A7 | Report card shows correct/answered (e.g., "3/3 correct" for partial) | |
| A8 | Reports list shows correct/answered per session | |
| A9 | Incorrect filter counter matches slider after answering correctly | |
| A10 | Skipped questions described as "skipped" in finish dialog (not "marked incorrect") | |

### B. Quiz Answer Feedback

| # | Check | Pass? |
|---|-------|-------|
| B1 | Answer locks immediately after selection | |
| B2 | Correct answer → green highlight | |
| B3 | Wrong answer → red on yours, green on correct | |
| B4 | Cannot change answer after selection | |
| B5 | Explanation tab shows feedback after answering | |
| B6 | Explanation tab shows explanation even BEFORE answering (study mode) | |

### C. Tabs

| # | Check | Pass? |
|---|-------|-------|
| C1 | All 4 tabs visible: Question, Explanation, Comments, Statistics | |
| C2 | No tab is greyed out or disabled | |
| C3 | Tab resets to Question when navigating to next question | |

### D. Statistics Tab

| # | Check | Pass? |
|---|-------|-------|
| D1 | Auto-loads — no "Load Statistics" button | |
| D2 | Shows stats even before answering current question | |

### E. Partial Quiz Submission

| # | Check | Pass? |
|---|-------|-------|
| E1 | Submit with unanswered questions succeeds | |
| E2 | Score = correct / answered (not correct / total) | |
| E3 | Full submit (all answered) still works | |

### F. Filter Counters

| # | Check | Pass? |
|---|-------|-------|
| F1 | "All" filter shows total question count | |
| F2 | "Unseen" filter updates counter | |
| F3 | "Incorrect" filter counter matches slider | |
| F4 | Counter updates on subject change | |

### G. Quiz Drafts

| # | Check | Pass? |
|---|-------|-------|
| G1 | Save draft works | |
| G2 | Multiple drafts shown as separate cards in Saved tab | |
| G3 | Resume draft restores answers/position | |
| G4 | Re-saving resumed draft UPDATES it (not creates new) | |
| G5 | Delete draft shows confirmation popup | |

### H. Reports

| # | Check | Pass? |
|---|-------|-------|
| H1 | Sort by Date (asc/desc) | |
| H2 | Sort by Score (asc/desc) | |
| H3 | Sort by Subject (alphabetical) | |

### I. Navigation & Layout

| # | Check | Pass? |
|---|-------|-------|
| I1 | Sidebar: Dashboard, Quiz, Progress, Reports (no Review) | |
| I2 | `/app/review` returns 404 | |
| I3 | Browser "Leave site?" on tab close during active quiz | |
| I4 | No console errors on any page | |

---

## After Testing

### New Issues Found
| # | Page | Description | Severity |
|---|------|-------------|----------|
| | | | |
