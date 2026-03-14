# Tech Debt Batches — LMS Plus v2

> 72 open issues grouped into 10 PRs. Work through in order.
> Each batch = 1 branch, 1 PR. Validate issues are still relevant before fixing.
> Created: 2026-03-14

---

## PR 1 — Docs & Comments (10 issues) — DONE

*Zero code changes. Fix docs, add code comments. Lowest risk.*
*Completed 2026-03-14. PR #105. Issues #55 and #46 were already resolved.*

| # | Title |
|---|-------|
| 100 | docs: fix FSRS metadata contradiction in docs/plan.md |
| 89 | Doc polish: formatting fixes in manual-eval docs |
| 83 | docs: fix typos, stale refs, and formatting in eval docs |
| 76 | Fix stale docs in manual-eval-sprint-2-3.md |
| 72 | docs: document IS DISTINCT FROM identity guard behavior in decisions.md |
| 55 | Docs: update plan.md and decisions.md for batch submit flow |
| 46 | Docs: Define batch submit transaction boundary in decisions.md |
| 16 | docs/database.md: migration naming convention doesn't match repo |
| 25 | docs: add comment explaining PKCE branch ordering in proxy.ts |
| 6 | chore: add comment explaining type cast in update-card.ts |

---

## PR 2 — Test Naming (9 issues)

*Rename test titles from implementation-focused to behavior-focused. No logic changes.*

| # | Title |
|---|-------|
| 7 | test: rename implementation-focused test names to behavior-focused |
| 73 | Improve test names to be behavior-focused across 5 files |
| 103 | style: rename implementation-coupled test titles in check-answer.test.ts |
| 98 | test: rename quiz-submit tests to describe behavior, not implementation |
| 97 | test: rename use-quiz-state tests to describe behavior, not implementation |
| 59 | Test: Rename fetch-stats test specs to behavior-focused names |
| 69 | test: use distinct counts for total vs correct in question-stats test |
| 99 | test: add try/finally cleanup for console.error spy in quiz-submit.test.ts |
| 39 | Chore: Split quiz actions test file by action module |

---

## PR 3 — Test Coverage Gaps (4 issues)

*Add missing test assertions and failure-path coverage.*

| # | Title |
|---|-------|
| 104 | Test gap: explanation-tab.test.tsx should assert sessionId param |
| 68 | test: add failure-path coverage for getSubjectScores (analytics.test.ts) |
| 19 | test: tighten Zod validation assertions across server actions |
| 48 | Test improvements: split co-located tests, add missing coverage |

---

## PR 4 — Security & Auth Hardening (6 issues)

*Auth checks, input sanitization, validation. Review carefully.*

| # | Title |
|---|-------|
| 20 | fix: add auth check to completeQuiz and completeReviewSession |
| 24 | fix: handle null user after successful code exchange in auth callback |
| 9 | Sanitize raw auth error in login form |
| 61 | Refactor: Handle auth.getUser() errors explicitly across codebase |
| 91 | Add per-element UUID validation for session_config.question_ids in batch_submit_quiz |
| 90 | Validate selected_option belongs to question in batch_submit_quiz |

---

## PR 5 — Bug Fixes: Race Conditions & Async (5 issues)

*Real bugs — stale state, race conditions, in-flight guards.*

| # | Title |
|---|-------|
| 86 | fix: add cancellation guard to useQuizCascade async cascade |
| 51 | Defensive: race condition guard for async topic/subtopic lookups |
| 40 | Bug: Add in-flight guard to useSessionState submit/next |
| 67 | fix: isPending in statistics-tab not scoped per question generation |
| 53 | UX: navigation guard false positive on unchanged resumed drafts |

---

## PR 6 — Refactor: Split Oversized Files (10 issues)

*Code-style compliance. Split hooks/components over line limits.*

| # | Title |
|---|-------|
| 92 | Refactor use-session-state.ts to comply with 80-line hook limit |
| 96 | refactor: extract useFinishDialog sub-hook from use-quiz-state.ts |
| 36 | Refactor: Split useQuizState hook (80-line limit) |
| 71 | refactor: split StatsDisplay in statistics-tab.tsx (148/150 line limit) |
| 70 | refactor: split ActivityChart into smaller sub-components (30-line rule) |
| 80 | refactor: extract TabButton from quiz-tabs to meet 30-line limit |
| 37 | Refactor: Split QuizSession render function (30-line cap) |
| 34 | Refactor: Split SessionRunner component (30-line function cap) |
| 31 | refactor: extract shared SessionQuestion type + reduce quiz/review session to <150 lines |
| 2 | refactor: split quiz/actions.ts to stay under 100-line limit |

---

## PR 7 — Type Safety & Cleanup (7 issues)

*Remove type casts, dead code, duplicate types.*

| # | Title |
|---|-------|
| 95 | Remove Supabase type-cast workarounds in draft actions |
| 12 | Type assertions (as string & keyof never) across query files |
| 54 | Cleanup: remove duplicate QuestionFilter type, unused questionId prop |
| 3 | refactor: extract shared RPC types from quiz/types.ts and review/types.ts |
| 5 | fix: remove duplicate --radius declaration in globals.css |
| 27 | Hoist markdown components object outside render |
| 65 | refactor: handle NaN in boundParam (analytics.ts) |

---

## PR 8 — Accessibility (4 issues)

*a11y improvements — ARIA attributes, keyboard nav, accessible names.*

| # | Title |
|---|-------|
| 102 | a11y: add aria-pressed to quiz-tabs.tsx |
| 50 | A11y: add ARIA tablist and keyboard navigation to QuestionTabs |
| 30 | a11y audit: add accessible names to Dialog-based components |
| 28 | ZoomableImage: deeper accessibility audit |

---

## PR 9 — UX, Perf & Architecture (10 issues)

*UX polish, performance, data architecture improvements.*

| # | Title |
|---|-------|
| 75 | Refactor explanation-tab.tsx: replace useEffect data fetch with server-side loading |
| 43 | Refactor: Replace useEffect data fetching in review-session-loader |
| 49 | Perf: add Suspense boundaries to quiz page for parallel loading |
| 66 | refactor: replace parallel COUNT queries with single GROUP BY aggregation |
| 58 | UX: Make subject-scores-chart responsive on small screens |
| 4 | feat: add loading state during completeReviewSession |
| 52 | Draft improvements: soft-delete, cross-field validation, stale answer filtering |
| 29 | Push subject filter into RPC for getDueCards |
| 101 | feat: make batch_submit_quiz retry-idempotent |
| 17 | Minor CodeRabbit review items (test quality + UX polish) |

---

## PR 10 — Infrastructure & Scripts (7 issues)

*CI config, scripts, tooling, E2E test infra.*

| # | Title |
|---|-------|
| 22 | chore: add permissions block to CI workflows |
| 21 | fix: E2E helper silent failures (missing env var, query errors) |
| 32 | test: E2E review-flow should snapshot/restore FSRS rows |
| 85 | fix(scripts): add error handling for DB failures in seed-eval.ts |
| 18 | fix: security-auditor shell grep pipe bug + unused variable |
| 13 | Import script: no guard against running on production Supabase |
| 14 | Import script: shared-refs assumption not validated |

---

## Parking Lot — Needs Discussion (5 issues)

*Design decisions that need investigation before implementation.*

| # | Title |
|---|-------|
| 87 | Decide: allow pre-answer explanations or gate behind answer submission |
| 44 | Data: Don't use FSRS state as source of truth for correctness |
| 11 | FSRS: learning_steps not persisted in DB schema |
| 10 | FSRS: silent state downgrade to New for unknown DB values |
| 15 | Review query: newIds undercount with large FSRS history |
| 56 | Config: narrow security-auditor auth-delegation suppression rule |
| 45 | Test: Remove raw answer keys from web-layer test contract |

---

## Summary

| PR | Theme | Issues | Risk | Status |
|----|-------|--------|------|--------|
| 1 | Docs & comments | 10 | None | **DONE** |
| 2 | Test naming | 9 | None |
| 3 | Test coverage gaps | 4 | None |
| 4 | Security & auth | 6 | Medium |
| 5 | Race conditions & async bugs | 5 | Medium |
| 6 | Split oversized files | 10 | Low |
| 7 | Type safety & cleanup | 7 | Low |
| 8 | Accessibility | 4 | Low |
| 9 | UX, perf & architecture | 10 | Medium |
| 10 | Infrastructure & scripts | 7 | Low |
| — | Parking lot (needs discussion) | 7 | — |
| | **Total** | **79** | |

Suggested order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 10 → 9

Start with zero-risk batches (docs, test renames) to build momentum.
Security and bugs next because they're real gaps.
Refactoring and cleanup after — safe but tedious.
UX/perf last — these are enhancements, not fixes.
