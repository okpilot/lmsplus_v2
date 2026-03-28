# Build Plan — LMS Plus v2

> This is the master plan. Start every new session by reading this file.
> User writes zero code. Claude plans, builds, tests, reviews, documents.
> Last updated: 2026-03-27

---

## Quiz Session Recovery — 2026-03-27 (issue #391)

Persist quiz progress to localStorage and recover on page refresh or deployment:
- **New utility**: `quiz-session-storage.ts` with `ActiveSession` type, `write/read/clearActiveSession()` functions, 7-day staleness check, private-mode error handling
- **Auto-persist**: write checkpoint to localStorage on every answer + navigation (via `checkpoint()` callback in useQuizState)
- **Recovery prompt**: `/app/quiz/session` shows `SessionRecoveryPrompt` when recoverable session detected — resume or discard options
- **Recovery banner**: `/app/quiz` home page shows `QuizRecoveryBanner` for returning students — quick resume button with progress summary
- **Warn on new quiz**: `use-quiz-start` warns before starting new quiz if unfinished session exists in localStorage
- **Clear on completion**: localStorage cleared on successful submit, discard, or save-to-draft
- **Error handling improvements**: `handleSelectAnswer` returns boolean (error state preserved on error), error cleared on question navigation (no stale errors), submit error takes priority in UI, FinishQuizDialog displays errors inline
- No new migrations or DB changes (client-side only)
- 14 new test files (component + utility), extensive coverage of recovery paths, error scenarios, staleness limits
- E2E: recovery flow tested in quiz flow spec

---

## GDPR Consent Gate — 2026-03-27 (issue #182)

First-login consent flow with persistent audit trail:
- **Migration 057**: `user_consents` append-only table (identical pattern to `audit_events`), two SECURITY DEFINER RPCs: `record_consent()` and `check_consent_status()`
- **Consent gate**: middleware in `proxy.ts` checks cookie `__consent = "tos_version:privacy_version"` — no DB hit per request
- **Login redirect**: `/auth/login-complete` calls `check_consent_status()` → missing or stale versions → redirect to `/consent`
- **/consent page**: two checkboxes (TOS required, privacy required), Continue button gated on required acceptance
- **Server Action**: `recordConsent()` with Zod validation, calls `record_consent()` twice, sets cookie with versions, redirects to `/app/dashboard`
- **Document versioning**: `lib/consent/versions.ts` (CURRENT_TOS_VERSION, CURRENT_PRIVACY_VERSION) → bump to trigger re-consent for all users
- **Legal pages**: `/legal/terms` and `/legal/privacy` — plain-language TOS and GDPR privacy policy
- **E2E coverage**: new `consent.spec.ts` with full flow tests, E2E helpers seed consent for test users
- **Security**: auth check via RPC, soft-delete guard on users lookup, IP/UA capture, immutable RLS policies
- Migrations: migration 057 only. Zero-row no-op checks on RPC queries.
- 26+ new unit tests, 5 new E2E specs

## GDPR Data Subject Rights — 2026-03-27 (issue #182, PR 3 of 3)

Data export and EASA retention documentation:
- **Data export** (GDPR Articles 15 & 20): Self-service JSON download from `/app/settings` via `exportMyData()` Server Action. Shared `collectUserData()` queries all user tables in parallel.
- **Admin export**: `exportStudentData()` Server Action with org-scope guard, accessible from admin students page via export dialog.
- **EASA Part ORA**: Training records (sessions, answers, responses) retained with full identity — no deletion, no anonymisation. GDPR Article 17(3)(b) exemption documented in privacy policy.
- **Privacy policy update**: Section 6 (Data Retention & EASA Compliance) and Section 8 (Your GDPR Rights) updated with specific article references and EASA exemption.
- No migration required — pure application-layer feature.

---

## Student Profile & Settings — 2026-03-26 (issue #368)

Student-facing settings page at `/app/settings`:
- **Profile view**: displays email, full name (editable inline), quiz statistics (total sessions, average score, questions answered)
- **Display name edit**: updateDisplayName Server Action with Zod validation, Supabase RLS enforcement, zero-row no-op check
- **Password change**: `changePassword` Server Action via Supabase Auth `updateUser()`, with Zod validation and session-error handling
- **RLS**: new UPDATE policy on users (migration 056) `id = auth.uid() AND deleted_at IS NULL`, defended by sensitive-columns trigger (migration 041)
- **Security**: auth check + RLS + input validation + sanitized error messages
- **Navigation**: gear icon + Settings link in sidebar + mobile nav
- No new migrations beyond RLS policy
- 1667 tests (139 files), all passing

---

## Admin Student Manager — 2026-03-25 (issue #354)

Admin tool for managing students at `/app/admin/students`:
- **List view**: server-side filtered table (status, role, name/email search via URL searchParams)
- **Create**: dialog form with email, full name, role (student/instructor), temporary password
- **Edit**: dialog for name and role changes (admin/instructor/student)
- **Deactivate/Reactivate**: soft-delete + Supabase Auth ban/unban with rollback on partial failure
- **Reset password**: generates alphanumeric temp password with must-change-on-first-login flag
- **Security**: all operations org-scoped via adminClient, requireAdmin() on every action and query, LIKE metacharacter escaping, error message sanitization
- No new migrations (uses existing users table + soft-delete pattern)
- Related issues: #368 (student profile page), #369 (instructor role definition), #370 (multi-org support)
- 1667 tests (139 files), all passing

---

## Admin Question Editor — 2026-03-24 (issue #271, PR #355)

Full CRUD admin tool for managing questions at `/app/admin/questions`:
- **List view**: server-side filtered table (subject/topic/subtopic cascading, difficulty, status, text search via URL searchParams)
- **Create/Edit**: dialog-based form with option editor (4 options, correct radio), syllabus cascader, image upload, difficulty/status
- **Bulk actions**: row selection checkboxes, bulk activate/deactivate
- **Image upload**: to Supabase Storage `question-images` bucket with org-scoped path isolation
- **Soft-delete**: with zero-row no-op check pattern
- **Migrations 052–055**: admin RLS on questions (org-scoped), storage policies (path-based org enforcement)
- **Security**: path traversal prevention, blob URL revocation, cross-tenant isolation on all write/delete paths
- 1479 tests (120 files), all passing

---

## Maintenance — 2026-03-23

**Migration 050 — RLS soft-delete fix for `flagged_questions` (2026-03-23):**
- Refined migration 044: removed `deleted_at IS NULL` filter from SELECT/UPDATE/INSERT RLS policies
- **Rationale:** With `FORCE ROW LEVEL SECURITY`, Postgres checks SELECT visibility of NEW row after UPDATE, which fails if RLS filters `deleted_at IS NULL`. Solution: app code filters deleted records via `.is('deleted_at', null)` in flag.ts; RLS only enforces ownership
- **Impact:** `flagged_questions` is now a soft-delete exception documented in `docs/database.md` §2
- **Cleanup:** Quiz session layout comments refined; CSS fixed for viewport height handling

---

## Bug Fixes — 2026-03-19

Fixed 4 open bugs in a single session:

- **#274** — `flagged_questions` RLS WITH CHECK missing `deleted_at IS NULL` (security gap, migration 044)
  - **Follow-up (2026-03-23):** Migration 050 refines the approach — app filters `deleted_at`, RLS enforces ownership only
- **#270** — Password recovery redirect broken: `/auth/callback` now recovery-aware with `next` param allowlist
- **#268** — `window.location.origin` replaced with `NEXT_PUBLIC_APP_URL` env var (+ fallback)
- **#261** — `student.login` audit event: new `record_login()` RPC + `/auth/login-complete` server route

Migrations 044–047. 1082 tests, all passing. Production Supabase email template still needs manual verification.

---

## Status: SPRINT 3 — Dependency Updates (COMPLETE — 2026-03-17)

**Goal:** Get all dependencies current before any new feature work.
**Order:** Easy wins first, then big migrations.

| Order | Issue | Title | Priority | Size | Status |
|-------|-------|-------|----------|------|--------|
| 1 | #210 | Bump GitHub Actions versions (checkout v6, setup-node v6, upload-artifact v7, codeql-action v4) | P1 | S | Done |
| 2 | #211 | Batch minor/patch npm updates (pnpm update) | P1 | S | Done |
| 3 | #215 | Dev tooling majors (commitlint 20, jsdom 29, @types/node 25) | P2 | M | Done |
| 3b | #226 | Migrate vite 7→8 + @vitejs/plugin-react 5→6 (split from #215) | P2 | M | Done |
| 4 | #214 | Migrate Lefthook 1→2 (breaking config change) | P2 | M | Done |
| 5 | #213 | Migrate Biome 1→2 (breaking config change) | P1 | L | Done |
| 6 | #212 | Migrate Zod 3→4 (breaking API changes) | P0 | L | Done |

**Scope:** 2S + 3M + 2L
**Context:** Dependabot opened 16 PRs on first run. GH Actions PR #194 merged. Remaining 15 closed — Dependabot can't regenerate pnpm-lock.yaml for monorepos. All updates will be done manually.

**Tech Debt: Biome 1→2 Migration done (2026-03-16, commit a9930ac):**
- Upgraded @biomejs/biome from ^1.9.0 to ^2.4.7
- Config auto-migrated via `biome migrate --write`:
  - `$schema` updated to `https://biomejs.dev/schemas/2.4.7/schema.json`
  - `ignore/include` → `includes` with negation patterns
  - `overrides include` → `includes` with `**` prefix
  - `noVar` rule moved from `style` to `suspicious` group
  - Added `css.parser.tailwindDirectives` for Tailwind v4 compatibility
- New lint rules addressed:
  - `noImgElement`: suppressed in `zoomable-image.tsx` (intentional raw img for zoom overlay)
  - `noStaticElementInteractions`: suppressed in `finish-quiz-dialog.tsx`
  - `useIterableCallbackReturn`: fixed in `use-answer-handler.test.ts`
  - Removed stale suppression comment in `seed.ts`
- Auto-fixes applied by Biome 2:
  - Import sorting across 60+ files (new organizeImports default behavior)
  - package.json array formatting (multi-line)
  - CSS formatting in `globals.css` (trailing zeros, line breaks, quote normalization)
- All tests passing, no breaking changes to linting semantics

**Tech Debt: Lefthook 1→2 Migration done (2026-03-16, commit d743cb8):**
- Upgraded lefthook from ^1.10.0 to ^2.1.4
- Config verification: lefthook.yml uses no deprecated options (skip_output, exclude regexp), so no syntax changes needed
- All hooks verified working under Lefthook 2:
  - pre-commit: biome check + type-check + pnpm test (parallel)
  - commit-msg: commitlint (conventional commits)
  - pre-push: security-auditor agent + pnpm audit (parallel)
- Closes #214

---

## Status: SPRINT 4 — Dashboard v4 Redesign (COMPLETE — 2026-03-18)

**Goal:** Redesign dashboard UI with stat cards, single-row heatmap, color-coded subject cards, collapsible sidebar, and mobile bottom tab bar. Remove recharts dependency.

**Scope:** 22 items (remove + modify + new + backend)

| Order | Item | Description | Status |
|-------|------|-------------|--------|
| Remove | 4.1 | Delete `activity-chart.tsx` (replaced by heatmap) | Done |
| Remove | 4.2 | Delete `subject-scores-chart.tsx` (not needed) | Done |
| Remove | 4.3 | Delete `analytics.ts` queries (chart-only) | Done |
| Modify | 4.4 | Remove "Progress" link from sidebar + mobile nav | Done |
| Modify | 4.5 | Add collapsible sidebar with localStorage persistence | Done |
| Modify | 4.6 | Header greeting: "Welcome back, [Name]" via UserContext | Done |
| Modify | 4.7 | Start Quiz button moved inline top-right | Done |
| Modify | 4.8 | Heatmap single-row 31-day monthly layout | Done |
| Modify | 4.9 | Heatmap day labels (every 5th day) | Done |
| Modify | 4.10 | Heatmap legend via hover tooltip | Done |
| New | 4.11 | Subject cards: color-coded progress bars (red/amber/green) | Done |
| New | 4.12 | Subject cards: "Last practiced" dates | Done |
| New | 4.13 | Subject cards: Practice link per card | Done |
| New | 4.14 | All 9 EASA PPL subjects displayed | Done |
| New | 4.15 | Exam Readiness card (X/9 at 90%+) | Done |
| New | 4.16 | Questions Today card (N/50 daily goal) | Done |
| New | 4.17 | Study Streak card (current + best) | Done |
| Backend | 4.18 | Extract `dashboard-stats.ts` helpers (streak, today, lastPracticed, readiness) | Done |
| Backend | 4.19 | Today's question count query | Done |
| Backend | 4.20 | Study streak calculation (consecutive days) | Done |
| Backend | 4.21 | Exam readiness computation | Done |
| Backend | 4.22 | Daily goal: hardcoded 50 (configurable later) | Done |

**Implementation complete (2026-03-18):**
- Removed 4 chart components + analytics queries. Removed recharts from `package.json`.
- Redesigned heatmap: 31-day calendar month view, 5-tier green intensity, day labels, today highlight
- New stat cards: Exam Readiness (X/9 at 90%+), Questions Today (N/50), Study Streak (current + best)
- Subject cards: color-coded progress bars (red <50%, amber 50-89%, green 90%+), last-practiced dates, Practice links
- Collapsible sidebar: toggle button, icon-only mode (~48px), localStorage persistence
- Mobile: replaced hamburger drawer with fixed bottom tab bar (nav icons)
- New `UserContext` provider: passes `displayName` and `userRole` down app tree, used in dashboard greeting
- New `dashboard-stats.ts`: pure helpers for streak calc, today count, last practiced, exam readiness
- All helpers tested + dashboard queries refactored under 200 lines
- Closes #175

---

## Status: SPRINT 5 — Quiz Setup Redesign (COMPLETE — 2026-03-18)

**Goal:** Redesign quiz setup page with multi-select topic tree, combinable filter pills, and persistent question flags.

**Scope:** 18 items (UI components, hooks, actions, database, filtering logic)

| Order | Item | Description | Status |
|-------|------|-------------|--------|
| DB | 5.1 | New `flagged_questions` table for persistent per-student flags (migration 043) | Done |
| UI | 5.2 | Card 1: Subject selector (shadcn select) + study/exam mode toggle | Done |
| UI | 5.3 | Card 1: Multi-select filter pills (All/Unseen/Incorrect/Flagged) | Done |
| UI | 5.4 | Card 2: Question count slider (10-All, no hard 50-question cap) | Done |
| UI | 5.5 | Card 2: Preset buttons (10/25/50/All) | Done |
| UI | 5.6 | Card 3: Collapsible topic tree with checkboxes | Done |
| UI | 5.7 | Card 3: Per-topic and per-subtopic question counts | Done |
| UI | 5.8 | New components: `mode-toggle.tsx`, `question-count.tsx`, `subject-select.tsx`, `topic-row.tsx`, `topic-tree.tsx` | Done |
| UI | 5.9 | New shadcn components: select, slider, checkbox | Done |
| UI | 5.10 | Tabs restyled to underline pattern | Done |
| UI | 5.11 | Saved quiz cards redesigned with new layout | Done |
| Hooks | 5.12 | New `use-topic-tree.ts` hook (replaces use-quiz-cascade) | Done |
| Hooks | 5.13 | Updated `use-quiz-config.ts` to accept topicIds/subtopicIds arrays + filters array | Done |
| Logic | 5.14 | Filter intersection logic: combine active filters on topic-selected question pool | Done |
| Logic | 5.15 | Exam mode: UI stub only (disabled with "Coming soon" badge) | Done |
| Tests | 5.16 | Updated question-filters, quiz-config-form, use-quiz-config, use-quiz-start tests for new UI | Done |
| Tests | 5.17 | Updated lookup and start actions tests for new filter/topic arrays | Done |
| Tests | 5.18 | All 1082 tests passing (99 files), type check clean, lint clean | Done |

**Implementation complete (2026-03-18, refined 2026-03-19):**
- Replaced cascading dropdown filters with multi-select topic tree (useTopicTree hook)
- Filter pills: All/Unseen/Incorrect/Flagged — intersection logic (not union) applied on topic-selected question pool
- Question count: slider range [10, All] with preset buttons — no hard 50-question cap
- New `flagged_questions` table (migration 043) for persistent per-student flags
- Updated start action to accept `topicIds` / `subtopicIds` arrays + `filters` array
- Deleted `use-quiz-cascade` hook (functionality moved to `use-topic-tree`)
- Exam mode UI stub (disabled, "Coming soon" badge)
- Polish refinements (4 commits, 2026-03-19):
  - Filter logic switched from union to intersection
  - Filters now use toggle switches (shadcn Switch component) instead of pill buttons
  - Subject dropdown now displays names instead of UUIDs (Base UI label fix)
  - Removed redundant question counts from subject dropdown
  - Increased subtopic indentation for better visual hierarchy
  - Per-topic/subtopic filtered counts shown when filters active
  - Empty state handling when no topics selected (Start button disabled)
  - Added eval seed script: `apps/web/scripts/seed-quiz-setup-eval.ts`
- New shadcn components: `switch.tsx`, `tooltip.tsx`
- PR #272, Closes #176
- Follow-up issues: #273 (a11y), #275 (red-team specs), #276 (count cap eval) — #274 (WITH CHECK guard) fixed 2026-03-19

---

## SPRINT 6 — Quiz Session Redesign (#177)
**Status**: COMPLETE (2026-03-21)
**Started**: 2026-03-20
**Goal**: Full-screen quiz session with question grid, 4 tabs, action bar, comments, and finish dialog

5 sequential PRs, each building on the previous:

| # | PR | Scope | Status |
|---|-----|-------|--------|
| 1 | Comments + Flags backend | Migration 049, comment/flag Server Actions, 57 tests | ✅ Done (PR #315) |
| 2 | Full-screen layout + navigator | Session layout, header, question grid redesign | ✅ Done (PR #317) |
| 3 | Answer options + question card | Letter circles, selection states, question info bar | ✅ Done (PR #319) |
| 4 | Tab content | Comments thread UI, statistics table, explanation images + LO box | ✅ Done (PR #320) |
| 5 | Action bar + finish dialog | Previous/Flag/Submit/Pin/Next, mobile bottom sheet | ✅ Done (PR #322) |

**Key decisions:**
- Comments: org-wide visibility, hard DELETE (low audit value)
- Flag (DB persistent) vs Pin (session ephemeral) — distinct visuals in grid
- Full-screen session layout (no app shell/sidebar)
- New rule: zero-row no-op check for ownership-scoped mutations

---

## SPRINT 7 — Quiz Results Redesign (#178)
**Status**: COMPLETE (2026-03-21)
**Started**: 2026-03-21
**Goal**: Redesign quiz results page with visual score ring, stats grid, and improved question breakdown

**Scope:** 3 new components, enhanced quiz-report query

| Item | Description | Status |
|------|-------------|--------|
| New component: ScoreRing | SVG-based circular progress ring with percentage | ✅ Done |
| New component: ResultSummary | Stats grid (subject, mode, duration, accuracy) + ScoreRing | ✅ Done |
| New component: QuestionBreakdown | Paginated question list (5 per page) with answer details | ✅ Done |
| Refactored: ReportCard | Simplified to layout-only, delegates content to ResultSummary + QuestionBreakdown | ✅ Done |
| Refactored: ReportQuestionRow | Enhanced with letter prefixes (A/B/C/D) for options, pink tint on incorrect rows | ✅ Done |
| Query enhancement: quiz-report.ts | Added `mode` and `subjectName` fields (resolves subject_id → name) | ✅ Done |

**Implementation complete (2026-03-21):**
- ScoreRing: canvas-like SVG for animated circular progress (configurable size, percentage)
- ResultSummary: 2-column layout with stats (Subject, Mode, Duration, Accuracy) on left, score ring on right
- QuestionBreakdown: paginated component (5 questions/page) with previous/next navigation
- ReportQuestionRow enhancements: letter-prefixed answer options (e.g., "A — Upward force"), pink/red tint on incorrect rows
- quiz-report query: now fetches `mode` (quick_quiz/practice/exam) and resolves `subject_id` → `name` (or null for Mixed)
- All tests updated for new component structure (12 tests in report-card.test.tsx, 29 in report-question-row.test.tsx, 18 in quiz-report.test.ts)
- Closes #178

---


## SPRINT 8 — Reports Redesign (#179)
**Status**: COMPLETE (2026-03-21)
**Started**: 2026-03-21
**Goal**: Redesign reports page with session table (desktop) and session cards (mobile), mode badge, and color-coded scores

**Scope:** 4 new components + shared utilities

| Item | Description | Status |
|------|-------------|--------|
| New component: SessionTable | 6-column desktop table (Date, Subject, Mode, Correct, Time, Score) with sortable headers | ✅ Done |
| New component: SessionCard | Mobile card layout with subject/score header and metadata row (mode, correct, time) | ✅ Done |
| New component: ModeB badge | EXAM pill (amber) for mock_exam mode, "Study" for others | ✅ Done |
| New utility: scoreColor | Shared score-color function: green >=70%, amber 50-69%, red <50% | ✅ Done |
| Refactored: ReportsList | Split into SessionTable + SessionCard with responsive layout selection | ✅ Done |
| Created: reports-utils.ts | Helper functions for formatting and filtering | ✅ Done |
| Refactored: ScoreRing | Extracted shared scoreColor utility for reuse across components | ✅ Done |
| Tests: reports-list.test.tsx | Updated to test both table and card layouts with responsive behavior | ✅ Done |

**Implementation complete (2026-03-21):**
- SessionTable: 6-column layout for desktop (Date, Subject, Mode, Correct, Time, Score)
- SessionCard: Mobile/responsive card layout with collapsible metadata
- Score color-coding: green (>=70%), amber (50-69%), red (<50%)
- Mode badge: "EXAM" pill in amber for mock_exam mode, "Study" label for others
- Extracted scoreColor utility to `lib/utils/score-color.ts` for shared use across score-ring, session-table, and session-card
- ReportsList split into feature components: session-table.tsx, session-card.tsx, reports-utils.ts
- Mobile-first design: stacked cards below `md` breakpoint, 6-column table above
- All tests updated for new component structure and responsive behavior (96+ assertions in reports-list.test.tsx)
- Closes #179

---

## SPRINT 1 COMPLETE — Quick Wins shipped

**Phase 1 done (2026-03-11):** Monorepo scaffold, all Claude Code config, tooling, shadcn/ui v4 (Base UI + oklch blue theme), git init. 3 commits on `master`.

**Phase 2 done (2026-03-11):** Supabase setup complete:
- `apps/web/.env.local` with all credentials (publishable key, secret key, access token)
- Supabase MCP scoped to project `uepvblipahxizozxvwjn`
- Full schema: 15 tables with RLS + FORCE RLS on all tables
- RLS policies: tenant isolation, immutability guards, role-scoped access
- 4 RPC functions: `get_quiz_questions`, `submit_quiz_answer`, `start_quiz_session`, `complete_quiz_session`
- All indexes from `docs/database.md`
- Typed Supabase clients: browser (`client.ts`), server (`server.ts`), admin (`admin.ts`)
- Generated TypeScript types from live schema
- Zod validation schemas for all mutations
- Security headers in `next.config.ts` (CSP, HSTS, X-Frame-Options, etc.)

**Phase 3 done (2026-03-11):** Question import tool:
- `packages/db/src/import-schema.ts` — Zod validation for import JSON
- `apps/web/scripts/import-questions.ts` — full import pipeline
- Bootstraps org (Egmont Aviation), admin user, question bank (EASA PPL(A) QDB)
- Parses folder paths → derives topic/subtopic codes & names → upserts reference data
- Uploads images to Supabase Storage (`question-images` bucket)
- Dedup by `question_number` per bank (unique index)
- Migration `002_add_question_number.sql` — added `question_number` column
- `@repo/db` package exports map added
- Test batch: 5 questions from 050-01-01 imported + idempotency verified
- 4 Claude subagents run via Agent tool after each commit (not Lefthook):
  - `code-reviewer` (haiku) — reviews diff for code style violations
  - `doc-updater` (haiku) — checks if docs need updates
  - `test-writer` (sonnet) — writes missing tests for new source files
  - `security-auditor` (sonnet) → pre-push via Lefthook, **blocking** on CRITICAL/HIGH findings
- Agent memory dirs: `.claude/agent-memory/{code-reviewer,security-auditor,doc-updater,test-writer}/`

**Phase 4 done (2026-03-11, updated 2026-03-18):** Student auth (email + password):
- Login page at `/` with email + password inputs, Zod validation, error display via `searchParams`
- Email + password auth via `supabase.auth.signInWithPassword()`
- Forgot password flow: `/auth/forgot-password` → reset email (PKCE) → `/auth/confirm` (verifyOtp) → `/auth/reset-password`
- Auth callback at `/auth/callback` — exchanges code for session, checks `users` table
- Unregistered users signed out + redirected to `/?error=not_registered`
- Proxy (`proxy.ts`, Next.js 16 convention) protects all `/app/*` routes, refreshes session tokens, propagates auth cookies on redirects
- Authenticated users auto-redirected from `/` to `/app/dashboard`
- App layout with user display name + sign-out button
- Dashboard placeholder at `/app/dashboard`
- Supabase middleware client helper in `packages/db/src/middleware.ts`
- Root layout metadata updated (was "Create Next App")

**Phase 5 done (2026-03-11, refined 2026-03-13):** Question Bank Trainer (MVP 2):
- Dashboard (`/app/dashboard`) — subject progress grid, recent sessions, quick actions (Start Quiz)
- Quiz (`/app/quiz`) — subject selector, question count, randomized quiz mode
- Progress (`/app/progress`) — detailed breakdown by subject/topic with mastery percentages
- Reports (`/app/reports`) — session history with sortable columns, click-through to quiz report
- Shared components: QuestionCard, AnswerOptions, FeedbackPanel, SessionSummary
- Sidebar navigation for all modes
- Server Actions split into feature files: quiz/actions/{start, submit, complete, batch-submit}.ts
- Quiz session: deferred writes architecture — answers accumulate in React state, batch submitted on finish. Partial submissions allowed (students can skip questions).
- Immediate feedback: answers locked after selection, explanation shown in-session
- Query functions: getDashboardData, getSubjectsWithCounts, getRandomQuestionIds, getProgressData
- UI components (shadcn): Badge, Card, Progress, Skeleton
- Tests written for auth flow, middleware, server actions
- Session state machine: answering → show-finish-dialog → submit-batch → complete
- Dark mode: next-themes provider, system default, toggle in header
- Quiz drafts: up to 20 saved drafts per student for resuming interrupted sessions
- Statistics tab: per-question stats (times seen, accuracy %, last answered date), auto-loads on tab click

**Phase 5B-7 done (2026-03-12, refined 2026-03-13):** Deferred Quiz Writes & Immediate Feedback:
- Refactored quiz/actions.ts into feature-based files: start.ts, submit.ts, complete.ts, batch-submit.ts, discard.ts (new)
- Quiz state machine updated: answers stored in React state (Map<questionId, {selectedOptionId, responseTimeMs}>)
- Migration 017: `batch_submit_quiz` RPC — allows partial answers; score calculated as `correct / answered` (not `correct / total`)
- Migration 022: `batch_submit_quiz` updated to atomically set `fsrs_cards.last_was_correct` within the transaction (closes race condition window)
- Migration 025: `batch_submit_quiz` input validation hardening — validates non-null JSON array, rejects duplicates, checks question membership
- Discard session: students can discard active quiz (soft-delete session), with optional draft cleanup
- FinishQuizDialog: modal with unanswered count warning, options: Return to Quiz, Save for Later, Submit Quiz, Discard Quiz
- QuizNavBar: question navigator with previous/next buttons, current index display
- Pinned questions: renamed from "flagged" to "pinned" for clarity (use-pinned-questions.ts hook)
- Immediate answer feedback: after selection, answer is locked and explanation shown inline (not deferred to end)
- SessionSummary: now displays `answeredCount` alongside `totalQuestions` for clarity on partial submissions
- Session Zod types: SubmitRpcResult, CompleteRpcResult, StartQuizResult, SubmitQuizAnswerResult, CompleteQuizResult, BatchAnswerResult, BatchSubmitResult
- QuizSession component displays explanation immediately after answer selection
- Report queries: fetch answered count per session from `quiz_session_answers` for accurate scoring on partial submissions

**Tech Debt PR #4 done (2026-03-14):** Security & Auth Hardening:
- Auth error handling: explicit `getUser()` error destructuring across 14 files (10 Server Actions, proxy, layout, auth callback, fetch-stats)
- Auth callback: now rejects null user instead of silently redirecting (closes auth bypass gap)
- Login form: raw Supabase errors sanitized with friendly messages for users
- Migration 035: `complete_quiz_session` RPC — added `deleted_at IS NULL` guard to prevent completing soft-deleted sessions
- Migration 036: `submit_quiz_answer` RPC — added `deleted_at IS NULL` guard + option membership validation (prevents submitting to discarded sessions, validates selected_option exists in question's options JSONB array)
- Migration 037: `batch_submit_quiz` RPC — added option membership validation for each answer in batch (prevents bulk-submitting arbitrary option strings)
- Test updates: auth callback, fetch-stats mocks, login-form error assertions

**Tech Debt PR #5 done (2026-03-14):** Race Conditions & Async Bugs:
- In-flight guard added to useSessionState submit/next handlers (#40)
- Navigation guard false positive on unchanged resumed drafts fixed (#53)
- Issues #86, #51, #67 confirmed already implemented — closed

**Tech Debt PR #6 done (2026-03-15):** Split Oversized Files:
- Shared types (SessionQuestion, AnswerResult, CompleteResult, SubmitInput) extracted to `_types/session.ts`
- SessionRunner split into SessionRunner + ActiveSession + SessionProgressBar + SessionAnswerBlock
- QuizSession split into QuizSession + QuizMainPanel + QuizTabContent + QuizControls + useQuizActiveTab
- use-session-state.ts refactored: async operations extracted to session-operations.ts, type refs to _types/session.ts (79/80 lines)
- ActivityChart tooltip/axis config hoisted to module constants
- Issues #2, #36, #71, #80, #96 already resolved in prior PRs — all 10 PR 6 issues closed

**Tech Debt PR #7 done (2026-03-15):** Type Safety & Cleanup:
- Supabase types regenerated from linked project (picks up all 37 migrations)
- Removed ~50 `as string & keyof never` column-name casts across 10 query files by eliminating `.returns<T>()` and casting results at point of use instead
- Removed `as 'users'` / `as never` casts from quiz draft actions (quiz_drafts now properly typed in generated types)
- Consolidated duplicate QuestionFilter type: canonical def in lib/queries/quiz.ts, all other imports reference it
- ReactMarkdown components and remarkPlugins hoisted to module scope (prevents re-allocation on every render)
- Removed duplicate --radius declaration from .dark block in globals.css
- Test mocks refactored: replaced .returns() terminal with thenable chain pattern
- Issues #3 (shared RPC types) and #65 (NaN in boundParam) confirmed already resolved; all 7 issues closed

**Tech Debt PR #8 done (2026-03-15):** Accessibility:
- Quiz tabs: WAI-ARIA tablist pattern (role="tablist", role="tab", aria-selected, aria-controls, aria-labelledby, tabpanel)
- Quiz tabs: keyboard navigation (ArrowLeft/Right, Home/End) with deferred focus via useEffect
- Quiz tabs: aria-controls scoped to active tab only (inactive panel not in DOM)
- ZoomableImage: aria-label on Dialog.Popup using alt text
- MobileNav: aria-label="Navigation menu" on Dialog.Popup
- Tests: 10 new ARIA/keyboard tests for quiz-tabs, 2 new dialog aria-label tests
- Issues #102, #50, #30, #28 closed

**Admin Syllabus Manager done (2026-03-15, issue #171):**
- Migration 039: `is_admin()` helper RPC + admin INSERT/UPDATE/DELETE policies on `easa_subjects`, `easa_topics`, `easa_subtopics`
- Admin route guard: `proxy.ts` checks `users.role = 'admin'` on `/app/admin/*`, returns 403 if not admin
- `requireAdmin()` Server Action guard in `apps/web/lib/auth/require-admin.ts` — verifies auth + admin role, called by all admin Server Actions
- CRUD UI: create/edit/delete subjects, topics, subtopics via admin interface
- 45 new tests covering admin guards, RLS policies, and CRUD Server Actions

**Admin Question Editor done (2026-03-24, issue #271, PR #355):**
- Migrations 052–055: admin INSERT/UPDATE on `questions` (org-scoped), storage policies for `question-images` bucket (path-based org isolation)
- Server Actions: `upsertQuestion` (create with org/bank resolution, edit with version bump), `softDeleteQuestion` (zero-row no-op check), `uploadQuestionImage` (2MB limit, org-prefixed paths), `bulkUpdateStatus` (activate/deactivate with deleted_at guard)
- Components: QuestionTable, QuestionFiltersBar (cascading subject/topic/subtopic + difficulty + status + search), QuestionFormDialog, OptionEditor, SyllabusCascader, ImageUploadField, BulkActionsBar, DifficultyStatusSelect
- Custom hook: `useQuestionFormState` — manages all form state + reset on dialog close
- Zod schemas: `UpsertQuestionSchema` (4 options, exactly 1 correct), `SoftDeleteQuestionSchema`, `BulkUpdateStatusSchema`
- ~65 new tests across queries, server actions, and mock patterns

**Tech Debt PR #9 done (2026-03-15):** UX, Perf & Architecture:
- Migration 038: `get_quiz_questions` RPC returns real explanation fields (was NULL)
- ExplanationTab refactored to pure render component (deleted `fetchExplanation` Server Action)
- Suspense boundary on quiz page for subjects section streaming
- Parallel queries in `getSubjectsWithCounts()` via `Promise.all`
- `question-stats.ts`: 3 COUNT queries collapsed to 1 select + JS aggregation (capped at 500 rows)
- `subject-scores-chart.tsx`: responsive layout (stack on mobile, side-by-side on sm+)
- Draft Zod `.superRefine()` for cross-field validation + stale answer filtering in loader
- Test quality: error message assertions, specific selectors, mock body fixes
- Issues #43, #4, #29 closed as stale (Smart Review removed), #101 already done
- PR #181 merged

**Security & dev tooling sprint (2026-03-16):**
- PR #227: commitlint 19→20, jsdom 28→29, @types/node 20→22
- PR #228: removed hardcoded Supabase keys from integration tests
- PR #230: pinned all GitHub Actions to immutable commit SHAs
- PR #231: added knip dead-code scanner (weekly cron + manual dispatch)
- PR #232: re-tracked docs/config + fixed 7 hook bugs (guard-bash CRITICAL, review-gate, code-reviewer scope, etc.)
- PR #245: defense-in-depth trigger on users table blocking role/org/deleted_at privilege escalation (#236)
- 7 Dependabot PRs auto-created for SHA-pinned action bumps

**Tech Debt PR #10 done (2026-03-15):** Infrastructure & Scripts:
- CI security hardening: added `permissions: contents: read` to `ci.yml` (principle of least privilege)
- Security auditor grep fix: improved detection of `adminClient` usage in app files (scans full file diffs, not just line context)
- Import script hardening: `import-questions.ts` now refuses non-local Supabase URLs unless `--force-remote` flag passed (prevents accidental remote pushes)
- Import validation: enforces all questions in JSON file reference same subject (prevents mixing subjects in single import)
- Seed script created: `apps/web/scripts/seed-admin-eval.ts` — creates admin+student users, org, bank, and 3 test questions with error handling for manual eval (closes #85)
- Biome lint fixes: template literal normalization across scripts
- Issues #22, #18, #13, #14, #85 closed

**Local dev setup (2026-03-11, updated 2026-03-16):**
- Local Supabase via `supabase start` (Docker) — all dev against local, never remote
- `.env.local` → local keys (`localhost:54321`), `.env.remote` → backup of production keys
- Mailpit at `http://localhost:54324` — catches password reset emails locally
- Studio at `http://localhost:54323`
- `scripts/import-questions.ts` — imports questions from JSON; refuses non-local URLs unless `--force-remote` flag passed
- `scripts/seed-admin-eval.ts` — seeds admin/student users for manual eval; run after `npx supabase db reset`
- 73 questions seeded locally (050-01-01 through 050-01-05)
- **Integration tests locally:** Require `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` env vars (security fix 2026-03-16). Set via: `eval "$(supabase status -o env)"` before running `pnpm --filter @repo/db test:integration`
- Migrations in `supabase/migrations/`:
  - 003: add `question_number` column
  - 004: fix users RLS (infinite recursion from self-referencing policy)
  - 005: fix immutable table RLS (restrict to SELECT+INSERT only)
  - 006: drop INSERT policies on immutable answer tables (RPC-only writes)
  - 007: add SECURITY DEFINER to start_quiz_session (required for quiz initialization)
  - 008: add question_number to get_quiz_questions() RPC return set
- CSP updated: `connect-src` and `img-src` allow `http://localhost:*` for local dev
- Image URLs use `localhost:54321` (not `127.0.0.1`) to match browser origin
- React Strict Mode fix: session loaders cache data to survive double-mount

**Phase 5B-1 done (2026-03-11):** Fixed existing test failures (middleware env var test).
**Phase 5B-2 done (2026-03-11):** 9 new unit test files for Phase 5 components. 212 tests passing across 28 files.
**Phase 5B-3 done (2026-03-11):** 35 integration tests against local Supabase:
- 4 RPC test suites: `get_quiz_questions`, `start_quiz_session`, `submit_quiz_answer`, `complete_quiz_session`
- RLS tenant isolation tests (cross-org, cross-student, role-based)
- RLS immutable table tests (quiz_session_answers, student_responses, audit_events)
- Found + fixed real RLS bug: permissive ALL policies overrode no_update/no_delete (migration 005)
- Test infra: `packages/db/src/__integration__/setup.ts` (helpers for user/org/question seeding + cleanup)

**Phase 5B-4 done (2026-03-11, updated 2026-03-17):** E2E tests (Playwright):
- Auth setup flow: email + password login, session persistence
- 10 E2E tests across 4 spec files: login flow, protected routes (5), quiz session, progress (2)
- Mailpit helper (`e2e/helpers/mailpit.ts`): fetch latest email, extract links (used for password reset)
- Supabase helper (`e2e/helpers/supabase.ts`): ensure E2E test user exists in Egmont Aviation org
- Playwright config: auth state caching, headless + headed modes, HTML reporter
- Scripts: `pnpm e2e`, `pnpm e2e:ui`, `pnpm e2e:headed`
- All core user flows covered: login → quiz/review → progress → back to dashboard

**Phase 5B-5 done (2026-03-11):** CI/QA pipelines (Lefthook + subagents + GitHub Actions):
- **Lefthook local QA** (3-layer mechanical gates, all blocking):
  - **Layer 1: pre-commit** (parallel): biome-check + type-check + test — catches broken code before git history
  - **Layer 2: commit-msg**: commitlint — enforces Conventional Commits
  - **Layer 3: pre-push**: security-auditor + dep audit — final defense before remote
- **Claude Code subagents** (run via Agent tool after each commit — findings flow back to conversation):
  - code-reviewer (haiku) — reviews diff for code style violations
  - doc-updater (haiku) — checks if docs need updates
  - test-writer (sonnet) — writes missing tests, runs them
  - learner (haiku) — analyzes findings, detects patterns, updates rules/memory
  - coderabbit-sync (haiku) — keeps .coderabbit.yaml aligned when rules change
- **CodeRabbit** (GitHub PR review):
  - `.coderabbit.yaml` — assertive profile, path-specific rules mirroring code-style.md + security.md
  - Pre-merge checks: no-secrets, no-answer-exposure, soft-delete-only
- **GitHub Actions CI** (cloud):
  - `ci.yml` — runs on every PR and push to master: lint (Biome), type-check (tsc), unit tests + coverage (Vitest with v8 provider), Codecov upload, dependency audit
    - Permissions: `contents: read` (principle of least privilege, enforced 2026-03-15)
    - Codecov integration added (2026-03-19): uploads lcov reports, advisory only (fail_ci_if_error: false), thresholds 60/50/60 (lines/branches/functions) aligned with Vitest config
  - `sonarcloud.yml` — runs on PRs + push to master: static code quality analysis via SonarCloud with new code detection
    - Configuration: `sonar-project.properties` defines source paths, test inclusions, coverage report paths, TypeScript config paths
    - Org: okpilot, project key: okpilot_lmsplus_v2 — SONAR_TOKEN secret configured
    - Executes `pnpm coverage` to generate lcov reports, then uploads to SonarCloud
  - `e2e.yml` — runs on pull requests + push to master + nightly + manual dispatch: migration test (clean reset) + integration tests (Supabase) + E2E tests (Playwright)
    - Migration test: `supabase db reset --no-seed` verifies all migrations apply cleanly on fresh DB
  - `lighthouse.yml` — runs on PRs + push to master: performance + accessibility audits via Lighthouse CI
    - Config: `.github/lighthouse/lighthouserc.json` — 3 runs per page, min scores: a11y/best-practices 0.9, SEO 0.85, performance 0.6 (warn)
    - Audits homepage + forgot-password page
    - Artifacts uploaded to GitHub (14-day retention)
  - `codeql.yml` — weekly security scan (Monday 05:30 UTC) for JavaScript/TypeScript via GitHub CodeQL action, logs to Security tab
  - `dependabot.yml` — automated dependency updates with auto-grouping by ecosystem/directory, weekly schedule, `tech-debt` label, commits with `ci` or `chore` prefix
    - Scopes: GitHub Actions + npm root + apps/web + packages/{db,ui,typescript-config}
  - `health-monitoring.yml` — weekly workflows: dependency audit, security audit, codeql scan (added 2026-03-15, moved to separate weekly schedule for visibility)
  - Local Supabase spun up in CI via `supabase/setup-cli` — runs all migrations automatically
  - `apps/web/scripts/seed-e2e.ts` — seeds org, users, question bank, and 20 questions for E2E (expanded from 5 to support review flow after quiz)
  - Playwright config updated: uses `pnpm start` (production build) in CI, `pnpm dev` locally
  - Playwright report + test results uploaded as artifacts (14-day / 7-day retention)
  - Concurrency groups prevent duplicate runs on the same branch

**Phase 5B-6 done (2026-03-11):** CodeRabbit review findings addressed:
- **CSP tightened:** `script-src` drops `unsafe-eval` in production (kept in dev for HMR); `allowLocal` flag enables localhost in dev + production builds targeting local Supabase (E2E CI)
- **RLS hardened:** Migration 006 drops INSERT policies on immutable answer tables (`quiz_session_answers`, `student_responses`) — writes only via SECURITY DEFINER RPCs
- **Docs updated:** security.md and database.md reflect immutable table policy pattern (RPC-only writes, no direct client inserts)
- Migration 005 (`quiz_session_answers` → `quiz_sessions` FK) moved; `020260311000006` is the immutable INSERT restriction

**Phase 6-Sprint1 complete (2026-03-12, refined 2026-03-13):** Quick Wins — all 10 backlog items (1.1–1.10) done in 8 commits on `feat/sprint-1-quick-wins`:
- ✅ Renamed "Quick Quiz" → "Quiz" throughout UI (sidebar, page heading, session summary, recent sessions list)
- ✅ Migration 008: added `question_number` to `get_quiz_questions()` RPC return set
- ✅ MarkdownText component (`react-markdown` + `remark-gfm`) for questions and explanations
- ✅ ZoomableImage component (click-to-expand lightbox via `@base-ui/react/dialog`)
- ✅ Question number displayed in quiz session UI
- ✅ Elapsed timer component visible during quiz sessions
- ✅ Loading skeletons: Skeleton UI component, `loading.tsx` files for dashboard/quiz/progress, skeleton states in session loaders
- ✅ Mobile navigation drawer: hamburger menu below `md` breakpoint, slide-out drawer with nav links via `@base-ui/react/dialog`, auto-closes on route change
- ✅ Immediate answer feedback in quiz: answers locked + explanation shown inline after selection
- Tests updated for renamed labels; new test files for MarkdownText, ZoomableImage, MobileNav

**Phase 6-Sprint2 complete (2026-03-12):** Quiz Overhaul — all items (2.1–2.11) on `feat/sprint-2-quiz-overhaul`:
- ✅ Migration 009: new `quiz_drafts` table for saving/resuming interrupted quizzes
- ✅ Subject → topic → subtopic drill-down selectors (2.3)
- ✅ Question filters: unseen, incorrectly answered, all (2.4)
- ✅ Question count slider (2.5)
- ✅ Deferred quiz writes: answers accumulate in React state, batch submitted on finish (2.6)
- ✅ Save/resume quiz drafts: 3-action finish dialog (Submit/Cancel/Save), auto-save to localStorage + DB, resume on next quiz open (2.7)
- ✅ Navigation-away warning: `beforeunload` event + Next.js route change guard with 3-option dialog (2.11)
- ✅ Incorrectly-answered tracking: `consecutive_correct_count` and `last_was_correct` on `fsrs_cards` (2.9)
- ✅ Question tabs: Question/Explanation/Comments/Statistics tabs inside quiz (2.2)
- ✅ Quiz report card: score %, question-by-question breakdown, sortable results list (2.8)
- ✅ Migration 011: new `batch_submit_quiz` RPC — atomic all-or-nothing session completion (replaces per-answer loop)
- ✅ Exit button for fullscreen quiz session (2.1)
- ✅ Saved drafts tab: tab UI + draft card with subject metadata, resume/delete (2.10)

### Sprint 3 — Dashboard & Analytics (COMPLETE — 2026-03-12)

- ✅ Migration 013: `get_daily_activity` + `get_subject_scores` analytics RPCs (SECURITY DEFINER + auth.uid() guard)
- ✅ recharts integration: activity bar chart (30-day stacked correct/incorrect), subject scores donut chart
- ✅ CSS grid study-streak heatmap (5-tier green intensity)
- ✅ Quick actions (Start Quiz / Start Review) on dashboard
- ✅ Dashboard reshaped: charts + heatmap + subject grid + reports link (replaced RecentSessions)
- ✅ `/app/reports` page: sortable session history (date/score/subject), click → quiz report
- ✅ Statistics tab: per-question stats (times seen, accuracy)
- ✅ Navigation updated: Reports added to sidebar + mobile nav
- ✅ Query layer: `analytics.ts`, `reports.ts`, `question-stats.ts` with tests (11 new tests)

**Post-sprint fixes (CodeRabbit PR #57 — 2026-03-12):**
- ✅ Migration 000016: add parameter clamping to analytics RPCs (`get_daily_activity` p_days [1,365], `get_subject_scores` p_limit [1,100]) + use IS DISTINCT FROM for null-safe auth check
- ✅ UTC date parsing fix in activity-chart and activity-heatmap (off-by-one for west-of-UTC users)
- ✅ Remove unnecessary 'use client' from activity-heatmap (Server Component only)
- ✅ Split subject-scores-chart into 3 sub-components (chart container + legend + tooltip) to meet 30-line limit
- ✅ Dashboard page switched to Promise.allSettled (analytics failures now degrade gracefully)
- ✅ Add `/coderabbit` skill command for triaging CodeRabbit review comments

**Tech debt PR 1 — Docs & Comments (2026-03-14, `fix/pr1-docs-comments`):**
- ✅ PR #105 merged — 10 doc/comment issues fixed (see `docs/tech-debt-batches.md` PR 1)
- ✅ Biome CSS formatting fix (`globals.css` — trailing zeros, line breaks, quote normalization)
- ✅ Stylelint disabled in `.coderabbit.yaml` (was producing false positives on unquoted font names)

**Post-sprint polish (2026-03-13, `feat/post-sprint-3-polish`):**
- ✅ Remove FSRS metadata from statistics tab (state, stability, difficulty, interval) — simplify student view to: times seen, accuracy %, last answered date
- ✅ New `fetchExplanation` Server Action — fetches question explanation (text + image) before answering, shows loading state
- ✅ Update `ExplanationTab` to load explanations pre-answer — students can preview explanations in study mode before attempting questions
- ✅ Draft update support: `saveDraft` now accepts optional `draftId` to update existing draft instead of creating new one (fix: resuming draft then re-saving creates duplicate)
- ✅ Navigation guard fix: added `e.returnValue = ''` to beforeunload handler for cross-browser support
- ✅ Session ownership checks: `checkAnswer` and `fetchExplanation` verify session belongs to authenticated user and question is in session config (security hardening)
- ✅ Error recovery: `handleSelectAnswer` reverts locked state and clears answer on `checkAnswer` failure, allowing user retry (closes #8)
- ✅ Migration 026: batch_submit_quiz field validation — validates jsonb_typeof before extracting question_ids (fixes eval-before-guard #33); validates selected_option/response_time_ms per answer (closes #38)
- ✅ Hook split: `use-quiz-state` → `use-answer-handler` extraction to stay under 80-line limit
- ✅ UUID validation fix: `lookup.ts` `getFilteredCount` validates empty string UUID correctly (closes #10)
- ✅ Migration 028: UUID case-insensitive regex in batch_submit_quiz — changed to `!~*` to accept uppercase UUIDs (valid per RFC 4122); defense-in-depth input validation
- ✅ Migration 031: batch_submit_quiz idempotent retry + soft-delete scoring — if session already completed, return existing results instead of raising error; allow scoring questions soft-deleted after quiz started (membership validated at session start, safe to score historical responses for retired questions)
- ✅ Migration 032: add `get_report_correct_options` RPC — returns correct option IDs for quiz report page (strips `correct` boolean before client sees it)
- ✅ Migration 033: scope `get_report_correct_options` to session — added `p_session_id` parameter; validates session ownership, completion, and soft-delete status before revealing correct options (prevents arbitrary question ID probing by unauthenticated/non-owning students)
- ✅ Migration 034: derive question set from quiz_session_answers — drops `p_question_ids` parameter; questions now derived from session answers, preventing arbitrary question ID probing via the Supabase REST API
- ✅ Migration 035: add DISTINCT ON to `get_report_correct_options` — prevents duplicate rows when a question has multiple `correct: true` options in JSONB, matching LIMIT 1 pattern in other RPCs
- ✅ saveDraft error logging: added console.error logging for draft count query and insert errors for better observability

---

## Phase 1 — Foundation (do this first, one session)

### 1A. Monorepo scaffold
```
npx create-turbo@latest lmsplusv2 --package-manager pnpm
```
Then reshape into final structure:
```
lmsplusv2/
├── apps/
│   └── web/                ← Next.js (create-next-app, App Router, TypeScript, Tailwind)
├── packages/
│   ├── db/                 ← Supabase client + schema + migrations
│   ├── ui/                 ← shadcn/ui shared components
│   └── typescript-config/  ← shared tsconfig (base, nextjs, react-library)
├── CLAUDE.md
├── .claudeignore
├── lefthook.yml
├── biome.json
├── turbo.json
└── package.json (root)
```

### 1A-pre. MCP setup (do before anything else)
Before building, configure the three essential MCPs so Claude has full tool access throughout the build:

1. **Supabase MCP** — get personal access token from supabase.com → Account → Access Tokens
   Add to `.claude/settings.local.json` (gitignored): `SUPABASE_ACCESS_TOKEN=sbp_xxxx` (MCP token only — not a runtime secret)
   Once project created, add `--project-ref <ref>` to `.claude/settings.json` Supabase args.

2. **Context7** — no setup needed, works immediately after `settings.json` is in place

3. **shadcn/ui** — no setup needed

### 1B. Claude Code config (write all files)
Full `.claude/` directory — see decisions.md for complete file tree.

Files to create (✅ = already created):
- `CLAUDE.md` (root, 50-80 lines)
- `.claudeignore`
- `.claude/settings.json` (all hooks)
- `.claude/hooks/pre-compact-handover.sh`
- ✅ `.claude/settings.json` — mcpServers (Supabase, Context7, shadcn) + hook stubs
- ✅ `.claude/agents/code-reviewer.md` — haiku, post-commit, quality + structure
- ✅ `.claude/agents/security-auditor.md` — sonnet, pre-push, vulns + secrets
- `.claude/agents/test-writer.md`
- `.claude/agents/doc-updater.md`
- `.claude/commands/review.md`
- `.claude/commands/test.md`
- `.claude/commands/plan.md`
- `.claude/commands/insights.md`
- `.claude/skills/nextjs-patterns.md`
- `.claude/skills/supabase-rls.md`
- `.claude/skills/fsrs-patterns.md`
- ✅ `.claude/rules/code-style.md` — file size limits, component rules, TS rules
- `.claude/rules/security.md` (short, points to docs/security.md)

### 1C. Tooling config
- `biome.json` — linting + formatting rules
- `lefthook.yml` — pre-commit (biome), commit-msg (commitlint), pre-push (tsc + vitest)
- `packages/typescript-config/` — base.json, nextjs.json, react-library.json
- `turbo.json` — tasks: build, lint, test, check-types, e2e
- Root `package.json` — pnpm workspaces, scripts

### 1D. Git init
```
git init
git add .
git commit -m "chore: initial monorepo scaffold"
```
Branching: `main` (protected) + feature branches `feat/xxx`

---

## Phase 2 — Supabase setup (BLOCKED until user provides keys)

### 2A. Database schema
Create migration files in `packages/db/migrations/`:

**Full schema + SQL in `docs/database.md`.** Summary:

```
organizations        + deleted_at (soft delete)
users                + deleted_at (soft delete)
easa_subjects        reference data, no delete
easa_topics          reference data, no delete
easa_subtopics       reference data, no delete
question_banks       + deleted_at (soft delete)
questions            + deleted_at (soft delete), options JSONB (correct stripped by RPC)
courses              + deleted_at (soft delete)
lessons              + deleted_at (soft delete), content JSONB
quiz_sessions        immutable record (no delete)
quiz_session_answers IMMUTABLE — no UPDATE, no DELETE, UNIQUE(session_id, question_id)
student_responses    IMMUTABLE — no UPDATE, no DELETE
fsrs_cards           upsert-only, UNIQUE(student_id, question_id)
audit_events         IMMUTABLE — append-only compliance log
```

**Rules:**
- No hard DELETE anywhere — always `UPDATE SET deleted_at = now()`
- RLS on every table: USING + WITH CHECK + `AND deleted_at IS NULL` on soft-delete tables
- All multi-table operations go through RPCs (atomic transactions)
- All INSERTs use `ON CONFLICT DO NOTHING` / upsert (idempotent)

**Core RPCs:** `get_quiz_questions`, `submit_quiz_answer`, `start_quiz_session`, `complete_quiz_session`
See `docs/database.md` for full SQL.

### 2B. Supabase client package
`packages/db/`:
- `src/client.ts` — typed Supabase client
- `src/types.ts` — generated types from schema
- `src/schema.ts` — Zod validation schemas

### 2C. Auth setup
- Supabase email + password auth configured
- Email templates customized (password reset)
- Redirect URLs configured:
  - **Site URL:** `https://lmsplus.app` (production)
  - **Allowed redirects:** `https://lmsplus.app/auth/callback`, `https://lmsplus.app/auth/confirm`, `http://localhost:3000/auth/callback`, `http://localhost:3000/auth/confirm`
  - Configured via Supabase Management API (not config.toml — that's local dev only)

### 2D. Security baseline
- Security headers in `apps/web/next.config.ts` (CSP, HSTS, X-Frame-Options)
- `packages/db/src/admin.ts` — service role client with browser guard
- `get_quiz_questions()` Postgres RPC function created
- `audit_events` table with append-only policies
- Verify all tables have RLS USING + WITH CHECK (run checklist from docs/security.md §3)

---

## Phase 3 — Question import tool

### Goal
Import ~3,000 questions from JSON into Supabase.

### JSON format (Claude will design proposal, confirm with user)
```json
{
  "subject": "010",
  "subject_name": "Air Law",
  "topic": "010-01",
  "subtopic": "010-01-01",
  "lo_reference": "010-01-01-a",
  "text": "What is the minimum...",
  "question_image_url": null,
  "options": {
    "a": "Option A text",
    "b": "Option B text",
    "c": "Option C text",
    "d": "Option D text"
  },
  "correct": "b",
  "explanation": "The correct answer is...",
  "explanation_image_url": null,
  "difficulty": 2
}
```

### Import tool
`apps/web/scripts/import-questions.ts` — reads JSON, validates with Zod, upserts to Supabase.

---

## Phase 4 — Student auth

### Pages
- `/` — landing / login page (email + password)
- `/auth/callback` — auth callback handler (code exchange for login)
- `/auth/confirm` — PKCE token exchange for password reset (verifyOtp)
- `/auth/forgot-password` — forgot password form
- `/auth/reset-password` — set new password after reset email

### Proxy (Next.js 16)
`apps/web/proxy.ts` — protect all `/app/*` routes, redirect to login if not authenticated.

### Session
Supabase session via `@supabase/ssr` package (server-side session management for Next.js App Router).

---

## Phase 5 — Question Bank Trainer (MVP 2)

### Route structure
```
/app/
├── dashboard/              ← progress overview, recent sessions, quick actions
├── quiz/                   ← Quiz config (subject, count, randomized mode)
│   └── session/            ← active quiz session (immediate feedback + in-session explanation)
├── progress/               ← detailed progress per subject/topic/subtopic
├── reports/                ← session history with sortable columns, links to quiz reports
├── settings/               ← student profile & settings: display name edit, password change (#368)
└── admin/                  ← admin-only (proxy guard + requireAdmin())
    ├── syllabus/           ← CRUD for subjects/topics/subtopics (#171)
    └── questions/          ← question editor: create, edit, list, filter, bulk actions (#271)
```

### Components (in `packages/ui/`)
- `QuestionCard` — question text + optional image
- `AnswerOptions` — 4 radio options, submit button
- `FeedbackPanel` — correct/incorrect, explanation, explanation image, LO ref
- `ProgressBar` — subject/topic completion
- `SessionSummary` — end-of-session score, time, breakdown
- `SubjectSelector` — EASA subject tree with drill-down

---

## Automation Pipeline

```
Claude finishes responding
    → [Stop hook] biome format changed files
    → [Stop hook] vitest run affected tests
    → [Stop hook] PowerShell toast notification

git commit
    → [Lefthook pre-commit] biome check --write + type-check + unit tests (BLOCKING)
    → [Lefthook commit-msg] commitlint validates message format
    → [Claude subagents — run by me via Agent tool, results come back to conversation]
        1. code-reviewer (haiku) — diff against code-style.md
        2. doc-updater (haiku) — check docs freshness
        3. test-writer (sonnet) — find/write missing tests
        4. learner (sonnet) — detect patterns, update rules/memory
        5. red-team (sonnet) — if diff touches security files, map to attack specs + flag gaps
        6. coderabbit-sync (haiku) — sync .coderabbit.yaml if rules changed
    → Fix any findings → commit again → repeat until clean

git push (only with user approval)
    → [Lefthook pre-push] security-auditor agent (sonnet) — BLOCKING on CRITICAL/HIGH
    → [Lefthook pre-push] pnpm audit — dependency vulnerabilities

GitHub PR
    → [CodeRabbit] reviews PR against .coderabbit.yaml rules
    → [GitHub Actions ci.yml] lint + types + unit tests
    → [GitHub Actions e2e.yml] integration + E2E tests (PRs + master)
    → [GitHub Actions redteam.yml] red-team security tests (triggered on security-sensitive paths)

Context approaching limit
    → [PreCompact hook] saves HANDOVER-YYYY-MM-DD.md before compression

Weekly
    → /project:insights → reads git log + test failures + agent memories
                        → updates MEMORY.md + suggests rule improvements
```

---

## How to start a new session

1. Read `docs/plan.md` (this file)
2. Check current status in the Status section above
3. Enter Plan Mode (Shift+Tab twice)
4. Tell Claude which phase to work on
5. Approve tool permission prompts as they appear
6. Test in browser when Claude says it's done

---

## Session prompts (copy-paste ready)

**Start Phase 1 (foundation):**
> Read docs/plan.md and docs/decisions.md, then build Phase 1 completely — monorepo scaffold, all Claude Code config files, tooling config, and git init. Use Plan Mode first.

**Start Phase 2 (after getting Supabase keys):**
> I've created the Supabase project. URL: [xxx], anon key: [xxx], service role key: [xxx]. Read docs/plan.md and build Phase 2 — database schema, RLS policies, Supabase client package, and auth setup.

**Start Phase 3:**
> Read docs/plan.md and build the question import tool (Phase 3). Propose the JSON format first, I'll confirm before you write any import code.

**Start Phase 4:**
> Read docs/plan.md and build student auth (Phase 4) — login page, email+password auth, auth callback, proxy.ts auth guard.

**Start Phase 5:**
> Read docs/plan.md and build the Question Bank Trainer (Phase 5), starting with the dashboard and quiz mode.

---

## Phase 5B — Test Hardening (COMPLETE as of 2026-03-11)

✅ **5B-1 done:** Fixed middleware test failure
✅ **5B-2 done:** Unit test coverage for Phase 5 components (dashboard, quiz, review, progress)
✅ **5B-3 done:** 35 integration tests for all 4 RPC functions + RLS policies (tenant isolation, immutability)
✅ **5B-4 done:** 10 Playwright E2E tests across 4 spec files (login, protected routes, quiz flow, progress)
✅ **5B-5 done:** GitHub Actions CI — `ci.yml` (PR: lint + types + tests + audit) + `e2e.yml` (PRs + master + nightly: integration + E2E with local Supabase)

Test summary: 247 unit tests (32 files) + 35 integration tests + 10 E2E tests. All passing.

## Phase 5B-6 (COMPLETE — 2026-03-14)

✅ **Red-team security testing suite added:**
- 9 Playwright attack vector specs: RPC question membership, cross-tenant isolation, unauthenticated server actions, audit event forgery, quiz draft injection, session replay, session race conditions, PKCE state forgery, rate limiting
- Seed helpers for adversarial users + cross-org test fixtures
- Separate Playwright project (redteam) with dedicated CI workflow (redteam.yml)
- Red-team agent (sonnet) integrated into post-commit pipeline — auto-triggers on security-sensitive file changes
- Attack surface memory system for tracking exploitation patterns
- `/redteam` skill command for on-demand test execution

---

## Phase 6 — Feature Backlog (post-MVP feedback)

Full backlog with sizing and sprint grouping: **`docs/backlog.md`**

| Sprint | Focus | Key items |
|--------|-------|-----------|
| 1 | Quick Wins | Markdown rendering, image lightbox, question ID, timer, skeletons, mobile, smart review fixes |
| 2 | Quiz Overhaul | Fullscreen env, question tabs (Q/Explanation/Comments/Stats), deferred DB writes, save/resume, report card, incorrect tracking, Moodle-style question grid |
| 3 | Dashboard & Analytics | Activity graph, pie chart, calendar heatmap, reports page, progress/dashboard differentiation |
| 4 | Social, Search, Study | Search page, study mode (correct answers shown), per-question comments, FAQ |
| 5 | Admin & Infrastructure | Admin frontend (students, questions), learning objectives/study cards, AWS backup |

## Post-Phase 5 Suggestions

From setup audit (2026-03-11), updated 2026-03-19:
- **CI/CD:** GitHub Actions mirroring Lefthook checks ✓ (added: `lighthouse.yml` for performance/accessibility audits)
- **Migration testing:** Added `migration-test` job in `e2e.yml` to verify clean DB resets
- **Error tracking:** Sentry integration after Phase 5 goes live
- **Monitoring:** Vercel Web Analytics dashboard
- **Vercel MCP:** Add after first deploy

---

*Last updated: 2026-03-27 — Student Profile & Settings page (#368). Sprint 4 complete.*
