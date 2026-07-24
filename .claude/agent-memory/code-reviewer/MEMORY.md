# Code Reviewer — Memory

> Native subagent memory index. Tracker first, durable knowledge second, topic pointers last.
> Update rows/bullets IN PLACE. No session logs — git holds history (`git log -p`).

## Recurring Issues Tracker

| Pattern | First Seen | Count | Last Seen | Status (→ rule loc) |
|---------|-----------|-------|-----------|---------------------|
| Function > 30 lines in Server Action | 2026-03-20 (d93f924) | 2 | 2026-03-20 (6520962) | PROMOTED → code-style.md §3 (getFilteredCount 58L, toggleFlag 52L; both fixed) |
| New hook/utility file shipped without co-located test | 2026-03-21 (8771aa2) | 5 | 2026-07-02 (37fc1127) | PROMOTED → code-style.md §7. Post-promotion recurrence: load-session-diagram-guards.ts shipped no test (covered only indirectly). Watch for 6th instance → mechanical guard. POSITIVE: guard-bash.js stdin rewrite (5923087a) + session-bootstrap-load.ts .catch() (cb690c4f) both shipped with co-located test — rule holding. |
| Hook file > 80-line limit | 2026-03-21 (8771aa2) | 4 | 2026-04-27 (c656868) | PROMOTED → code-style.md §1. Fix = extract orchestration helper. use-study-config.ts 80L exactly at cap — WATCH. |
| React component > 150-line limit | 2026-03-21 (8771aa2) | 6 | 2026-07-02 (03aae12d) | PROMOTED → code-style.md §1. BLOCKING: rwy-2709-lh-pattern.tsx 155L (fix: extract RunwayBody). SPLIT CANDIDATE: select.tsx 193L, alert-dialog.tsx 168L (shadcn wrappers; annotation-expansion; split work separate). WATCH: quiz-config-form.tsx 150L exactly at cap, quiz-main-panel.tsx 125L. RESOLVED: quiz-session.tsx 161L→132L (eec31df2 — QuizSessionProps extracted to session-types.ts). |
| Feature modes (study/exam) wired into one hook/component | 2026-04-13 (exam PR2) | 2 | 2026-04-26 (34194aa) | RULE CANDIDATE — extract mode logic once file passes 120L (hook) or 200L (component). |
| Server Action file > 100-line limit | 2026-03-20 (d93f924) | 2 | 2026-06-07 (e9c2a36b) | RESOLVED. WATCHING: lookup.ts 112L; batch-submit.ts 100L exactly at cap. |
| Utility function > 30 lines | 2026-05-31 (c879a259) | 15 | 2026-07-13 (001bacb6) | WATCHING. Active over-30L: getSessionReports 64L; buildReportQuestions 65L; getQuizReportQuestions 160L; startOralExam 44L (fix: extract validateMode); getOralExamSession 31L (fix: extract toResponses helper); buildHandleSubmit 47L; buildFinishDialogHandlers 37L; assembleQuizState 36L; useOrderingInput 46L; useFinishQuizDialog 59L. RESOLVED: useResumeExamActions 61L→17L hook body (f9a2a164 — extracted to resume-exam-handlers.ts; builders buildResumeHandler 25L + buildDiscardHandler 25L, both within cap). QuizReportView RESOLVED 5ac5ae17. Seed helpers structural exceptions. Pre-existing worsened: handleSave in quiz-recovery-handlers.ts ~35L→41L (eec31df2), →42L on deps-object refactor (001bacb6, +1 destructure line) — structural, no extraction available. WATCH: handleRecoveryResume (session-bootstrap-load.ts) inner function body 30L exactly at cap after cb690c4f .catch() addition; outer factory `buildRecoveryResume` body 32L — factory-pattern exception (single return statement, no extractable steps). |
| Deep nesting > 3 levels | 2026-03-27 (75ffa51) | 3 | 2026-07-10 (df045384) | WATCHING (ConsentForm JSX 4-deep; ensureOtherOrgBank cb150e26 3-branch conditional at indent 4 — fix = early-return chain; topic-tree-actions.ts df045384: nested startTransition pushed setTopics to indent 4 — fix = extract applyTopics helper). |
| Utility file > 200-line limit | 2026-04-27 (c656868) | 6 | 2026-07-02 (d74f3e0e) | WATCHING. SPLIT CANDIDATE: quiz-session-storage.ts 279L; admin-quiz-report.ts 231→221L IMPROVED (5cd62560 −10L); quiz-report-questions.ts 213L; quiz-submit.ts 239L. WATCH: check-non-mc-answer-helpers.ts 200L at cap; seed-users.ts 198L; helpers/cleanup.ts 195L. BLOCKING: question-filters.tsx 181L (fix: extract FilterToggle + constants); use-quiz-config.ts 94L hook cap (fix: extract useQuizConfigState). Full history → file-size-watch-log. |
| E2E Playwright hermiticity (hard-delete without restoration) | 2026-04-30 (from §7) | 2 | 2026-04-30 | RESOLVED — afterEach soft-delete pattern established; no recurrence. |
| `waitForTimeout` in E2E specs | 2026-06-06 (test/isolation-hygiene) | 1 | 2026-06-06 | WATCHING (exam-recovery.spec.ts — fixed in same commit; tracking for recurrence). |

> Count increments only on a **distinct** mechanism. Rows transition state, never deleted.

## Durable knowledge

- **Scope is the commit diff only.** Flag size violations only when the commit introduced or worsened them (`+` lines in the hunk). Note pre-existing violations but don't flag them.
- **Test files** are exempt from line limits up to 500L (`.test.ts`/`.test.tsx` only). Shared test-infra helpers (`setup.ts`, `helpers/*.ts`, `seed.ts`) are utility files subject to the 200L cap.
- **Server Action exception:** file >100L holding 3+ focused exports (each ≤30L) + private helpers is acceptable.
- **`useEffect` exceptions:** ResizeObserver, click-outside, timer cleanup, and hydration guards are NOT data-fetching violations. Only flag `useEffect` that fetches data.
- **§5 mutations in test `finally` restore blocks:** `await admin.from(...).update(...)` without `{ error }` destructuring is a WARNING — silent restore failure corrupts next test run.
- **Migrations:** 300L cap. Single-function SECURITY DEFINER RPCs may exceed — documented exception in code-style.md §1 (mig 129 330L, mig 130 329L, mig 087 360L).
- **Page files:** 80L cap, composition only — consistently honored.
- **Borderline watch files** — full history → [file-size-watch-log](topics/file-size-watch-log.md). E2E infra helpers (audit-helpers.ts, get-study-questions-eo-setup.ts, seed-vfr-rt-pool.ts) are structural exceptions — do NOT flag. SPLIT CANDIDATE test files: rpc-vfr-rt-submit 842L, rpc-vfr-rt-results 838L, rpc-vfr-rt-constraint-regression 621L, server-action-unauthenticated 614L, quiz-session-validators.test 744L, quiz-main-panel.test 706L, quiz-report-questions.test 639L, rpc-report-answer-keys 610L, audit-completeness.spec 583L, rpc-check-non-mc-answer-diagram 550L, collect-user-data.test 550L, rpc-vfr-rt-start 570L; quiz-session-storage.test 1203L; quiz-session.test.tsx 970L (grew 935→970 on f9a2a164); use-session-bootstrap.test.ts 797L (001bacb6). WATCH: get-study-questions-eo.spec 416L; rpc-get-quiz-questions-ordering 486L. (quiz/report/page.tsx now 10L — RESOLVED 425ab703.)
- **`auth.getUser()` / auth SDK:** destructuring only `{ data }` is correct — §5 destructure rule applies to `.from()` table queries only.
- **`null as unknown as T` in integration tests** is a permitted null-injection pattern (not a §5 violation — that rule targets `req.body`, `formData`, `JSON.parse()` in prod code).
- **`unknown`-typed wire-shape + `typeof` runtime guards** (study-queries.ts, 14a8b9c5): the correct §5 cast-guard pattern for nullable `RETURNS TABLE` fields. Acknowledge, don't re-litigate.
- **code-reviewer scope is style/structure only.** Logic, security, RLS belong to semantic-reviewer.
- **Bash hook files in `.claude/hooks/`** are infrastructure — file-size limits do not apply.
- **Agent prompt / parser contract drift** is a WARNING — verify the agent prompt emits the token format the hook's verdict parser expects.
- **`Readonly<Props>` rule** (code-style.md §5+§8, WARNING). `Readonly<Readonly<...>>` double-wrap is harmless — WARNING not BLOCKING. Shadcn wrapper annotation expansion worsens line counts by 2-4L per component; note as pre-existing, split work is separate.

## Topic pointers

- [commit-review-log](topics/commit-review-log.md) — per-commit review notes (read on demand).
- [file-size-watch-log](topics/file-size-watch-log.md) — full chronological file-size growth history (read on demand).
