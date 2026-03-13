# Manual Eval — Post-Sprint 3 Polish

**Branch:** `feat/post-sprint-3-polish` (16 commits)
**Date:** 2026-03-13
**Login:** http://localhost:3000 → magic link → pilot.oleksandr@proton.me
**Dev tools:** Mailpit http://localhost:54324 | Studio http://localhost:54323

---

## A. Smart Review Removal

| # | Check | How to verify | Pass? |
|---|-------|---------------|-------|
| A1 | No Smart Review in sidebar | Desktop: sidebar shows Dashboard, Quiz, Progress, Reports only | | YES
| A2 | No Smart Review in mobile nav | Resize to mobile: bottom nav shows 4 items, no Review | | can we actually simulate and test a mobile environment???
| A3 | /app/review returns 404 | Navigate to http://localhost:3000/app/review — should get Next.js 404 | | YES
| A4 | No Smart Review in Reports | Go to Reports — mode labels should show Quiz / Mock Exam only | | YES
| A5 | No Smart Review in Dashboard | Dashboard quick actions: only "Start Quiz" button, no "Start Review" | | YES

---

## B. Quiz — Answer Feedback (Training Mode)

| # | Check | How to verify | Pass? |
|---|-------|---------------|-------|
| B1 | Answer locks immediately | Select an option — it should become unclickable, other options also disabled | | YES
| B2 | Correct answer highlighted green | Select the correct answer — green highlight on selected option | | YES
| B3 | Wrong answer highlighted red + correct shown green | Select wrong answer — red on yours, green on the correct one | | YES
| B4 | Cannot change answer | After selecting, click a different option — nothing should happen | | YES
| B5 | Explanation tab shows feedback | After answering, click Explanation tab — should show correct/incorrect verdict + explanation text | | YES
| B6 | Explanation tab before answering | Before answering, click Explanation tab — should show "Answer this question to see the explanation." | | Explanation shall be given even before the question is answered. it is okay. we are in a study mode now.
| B7 | Explanation image shows if available | If question has an explanation image, it should render below the text | | HAVEN'T SEEN THE QUESTION WITH EXPLANATION. IMAGE SHALL BE ON TOP OF EXPLANATION

---

## C. Quiz — Tabs Always Accessible

| # | Check | How to verify | Pass? |
|---|-------|---------------|-------|
| C1 | All 4 tabs visible | During quiz: Question, Explanation, Comments, Statistics tabs all visible | | YES
| C2 | No tab is greyed out or disabled | Click each tab before and after answering — all should be clickable | | YES
| C3 | Tab resets on question change | Navigate to next question — tab should reset to Question | | YES

FEEDBACK - WHEN i ANSWER THE QUESTION THE STATISTIC IS NOT UPDATED IMMEDIATELY - THIS IS INTENTIONAL, RIGHT? SO WE NEED TO GIVE THE FEEDBACK TO STUDENT THAT ONLY STATISTICS FROPM PREVIOSU SUBMITTED QUIZZES IS DISPLAYED.

---

## D. Statistics Tab — Auto-Load

| # | Check | How to verify | Pass? |
|---|-------|---------------|-------|
| D1 | No "Load Statistics" button | Click Statistics tab — should show loading skeleton, then data (no button to click) | | YES
| D2 | Stats show after answering | Answer a question, click Statistics tab — should show times seen, correct %, etc. | |
| D3 | No FSRS data shown | FSRS internal state is not displayed to students (removed for simplicity) | | YES
| D4 | Before answering placeholder | Click Statistics tab before answering — "Answer this question to see statistics." | | NO IT DOES NOT, IT SHOWS THE STATISTICS RIGHT AWAY AND THIS IS CORRECT.
| D5 | Error retry | (Hard to test manually) If fetch fails, should show error message + "Retry" link | |

---

## E. Exit Button Removed

| # | Check | How to verify | Pass? |
|---|-------|---------------|-------|
| E1 | No X / Exit button | During quiz session — only "Finish Quiz" button visible in the top bar, no X or Exit | YES |
| E2 | Finish Quiz opens dialog | Click "Finish Quiz" — dialog appears with submit/return/save options | | YES

---

## F. Partial Quiz Submission

| # | Check | How to verify | Pass? |
|---|-------|---------------|-------|
| F1 | Can submit with unanswered questions | Start 10-question quiz, answer 5, click Finish → Submit — should succeed | | NOPE. SOMETHING WENT WRONG PLEASE TRY AGAIN.
| F2 | Score based on answered only | After partial submit, report should show score as correct/answered (not correct/total) | |
| F3 | Unanswered warning in dialog | Click Finish with unanswered questions — dialog should warn about skipped questions | | BUT WHY DOES OT TELL ME THAT THEY WILL BE MARKED INCORRECT? JUST MARK THEM AS SKIPPED. DON'T STORE ANY DATA FOR THE UNASWERRED QUESTIONS. FOR THE FINAL SCORE DETERMINE IT AS CORRECT ANSWERS VS TOTAL ANSWERRED WHERE YOU ACTUALLY SUBMITTED THE ANSWER... AND I CANNOT SUBMT IT PARTIALLY ANYWAYS: SOMETHING WENT WRONG PLEASE TRY AGAIN.
| F4 | Full submit still works | Answer all questions, Finish → Submit — should succeed with full score | | YES

---

## G. Filter Counter Updates

| # | Check | How to verify | Pass? |
|---|-------|---------------|-------|
| G1 | "All" filter shows total count | Select a subject — counter shows total question count | | YES
| G2 | "Unseen" filter updates counter | Switch filter to Unseen — counter should change to reflect unseen questions | | YES
| G3 | "Incorrect" filter updates counter | Switch filter to Incorrect — counter should change (may be 0 if no wrong answers yet) | | YES
| G4 | Slider max updates with filter | After filter change, the question count slider max should match the filtered count | | YES
| G5 | Counter updates on subject change | Change subject — counter should update for the new subject with current filter | | YES

---

## H. Multiple Quiz Drafts

| # | Check | How to verify | Pass? |
|---|-------|---------------|-------|
| H1 | Save first draft | Start quiz, answer a few, Finish → Save for Later — should save | | YES
| H2 | Save second draft | Start another quiz, answer a few, Save for Later — should save (two drafts now) | | YES
| H3 | Drafts listed separately | Go to Saved tab on quiz page — both drafts should appear as separate cards | | YES
| H4 | Draft card shows progress | Each card shows subject name, code, date, and progress bar (% answered) | | YES
| H5 | Resume draft works | Click Resume on a draft — should load back into quiz session with previous progress | | YES, BUT IF AGAIN, I DON'T FINISH IT AND CLICK SAVE FOR LATER - IT CREATES ME A NEW DRAFT INSTEAD OF UPDATING SAVED QUIZ... 
| H6 | Delete individual draft | Click Delete on one draft — only that draft removed, other stays | | YES, BUT THERE SHALL BE A POPUP WARNING.
| H7 | Draft count badge | Saved tab badge shows count of drafts (e.g., "2") | | YES
| H8 | Max 20 drafts enforced | (Edge test) Try saving 21st draft — should get error "Maximum 20 saved quizzes reached." | |

---

## I. Navigation Guard

| # | Check | How to verify | Pass? |
|---|-------|---------------|-------|
| I1 | Browser warns on close during quiz | Start quiz, answer 1 question, try closing the tab — browser should show "Leave site?" dialog | | NO
| I2 | Browser warns on back navigation | During active quiz, click browser back button — should show leave warning | | NO
| I3 | No warning after submit | Submit quiz, then navigate away — no warning | | 

---

## J. Reports Sorting

| # | Check | How to verify | Pass? |
|---|-------|---------------|-------|
| J1 | Sort by Date works | Click Date column header — reports should sort by date asc/desc | | YES
| J2 | Sort by Score works | Click Score column header — reports should sort by score asc/desc | | YES
| J3 | Sort by Subject works | Click Subject column header — reports should sort alphabetically | | YES
| J4 | Sort by Questions works | Click Questions column header — reports should sort by question count | | NO SUCH THING EXISTS.

**Note:** Need 2+ completed quizzes (ideally different subjects) to properly verify sorting. If only one subject is seeded, Score and Questions sorting can still be verified if scores differ.

---

## K. General Smoke Tests

| # | Check | How to verify | Pass? |
|---|-------|---------------|-------|
| K1 | Dashboard loads | Navigate to /app/dashboard — shows subject grid, quick actions | | YES
| K2 | Progress page loads | Navigate to /app/progress — shows progress data | | YES
| K3 | Quiz config page loads | Navigate to /app/quiz — shows subject dropdown, filters, start button | | YES
| K4 | No console errors | Open DevTools Console during all checks — no red errors | | YES
| K5 | Mobile responsive | Resize to mobile width — layout adjusts, no overflow/broken UI | | DID NOT TEST

---

## Quick Test Flow

1. Login via magic link
2. **Dashboard** → verify no Smart Review (A5, K1)
3. **Sidebar/Mobile nav** → verify 4 items only (A1, A2)
4. **Quiz config** → select subject, change filters, verify counter updates (G1-G5)
5. **Start quiz (10 questions)**:
   - Answer Q1 correctly → verify green highlight, locked answer (B1-B4)
   - Check Explanation tab → verify feedback shown (B5)
   - Check Statistics tab → verify auto-load (D1-D2)
   - Answer Q2 incorrectly → verify red/green highlights (B3)
   - Navigate to Q3, check Explanation tab before answering (B6)
   - Verify all tabs always clickable (C1-C2)
   - Verify no Exit button, only Finish Quiz (E1)
6. **Save as draft** → Finish → Save for Later (H1)
7. **Start another quiz** → answer 3 of 10 → Save for Later (H2)
8. **Check Saved tab** → two drafts with badges (H3, H4, H7)
9. **Resume first draft** → verify progress restored (H5)
10. **Finish quiz** → Submit with unanswered → verify partial submit works (F1-F3)
11. **Delete second draft** (H6)
12. **Start fresh quiz** → answer all → Submit → verify full submit (F4)
13. **Reports** → verify sorting works, no Smart Review label (J1-J4, A4)
14. **Try /app/review** → verify 404 (A3)
