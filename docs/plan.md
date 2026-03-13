# Build Plan — LMS Plus v2

> This is the master plan. Start every new session by reading this file.
> User writes zero code. Claude plans, builds, tests, reviews, documents.
> Last updated: 2026-03-12

---

## Known Issues — Fix Before Next Sprint

### `easa_subjects` / `easa_topics` / `easa_subtopics` tables are empty everywhere

**Discovered:** 2026-03-12 during remote→local data sync investigation.

**Problem:** The `easa_subjects`, `easa_topics`, and `easa_subtopics` tables exist in the schema (migration `001_initial_schema.sql`) but are **never populated** — not on remote, not on local. The import script (`import-questions.ts`) likely writes subject/topic/subtopic data somewhere else, or the reference data was never seeded.

**Impact:** Any query joining `questions` → `easa_subtopics` → `easa_topics` → `easa_subjects` will return zero rows. The dashboard analytics, review config drill-down, and progress pages may silently show empty results for subject-level breakdowns.

**Investigation needed:**
1. Check how `import-questions.ts` handles subject/topic/subtopic data — does it populate `easa_*` tables or derive from folder paths only?
2. Check if `questions.subtopic_id` FK points to `easa_subtopics` — if so, questions can't be imported without seeding the reference tables first
3. Check all queries that join on `easa_*` tables — are they returning empty results in production?
4. Decide: seed the `easa_*` tables from QDB folder structure during import, or create a standalone seed migration

**Priority:** HIGH — fix first thing next session before any new feature work.

---

## Status: SPRINT 1 COMPLETE — Quick Wins shipped

**Phase 1 done (2026-03-11):** Monorepo scaffold, all Claude Code config, tooling, shadcn/ui + tweakcn theme, git init. 3 commits on `master`.

**Phase 2 done (2026-03-11):** Supabase setup complete:
- `apps/web/.env.local` with all credentials (publishable key, secret key, access token)
- Supabase MCP scoped to project `uepvblipahxizozxvwjn`
- Full schema: 14 tables with RLS + FORCE RLS on all tables
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

**Phase 4 done (2026-03-11):** Student auth (magic link):
- Login page at `/` with email input + Zod validation
- Magic link via `supabase.auth.signInWithOtp()` → redirects to `/auth/verify`
- Auth callback at `/auth/callback` — exchanges code for session, checks `users` table exists (pre-created by admin)
- Unregistered users signed out + redirected to error page
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
- FSRS integration via `packages/db/src/fsrs.ts` — wraps ts-fsrs library, updateFsrsCard on answer
- UI components (shadcn): Badge, Card, Progress, Skeleton
- Tests written for auth flow, middleware, server actions
- Session state machine: answering → show-finish-dialog → submit-batch → complete
- Dark mode: next-themes provider, system default, toggle in header
- Quiz drafts: up to 20 saved drafts per student for resuming interrupted sessions
- Statistics tab: per-question stats (times seen, accuracy, FSRS state), auto-loads on tab click

**Phase 5B-7 done (2026-03-12, refined 2026-03-13):** Deferred Quiz Writes & Immediate Feedback:
- Refactored quiz/actions.ts into feature-based files: start.ts, submit.ts, complete.ts, batch-submit.ts
- Quiz state machine updated: answers stored in React state (Map<questionId, {selectedOptionId, responseTimeMs}>)
- Migration 017: `batch_submit_quiz` RPC — allows partial answers; score calculated as `correct / answered` (not `correct / total`)
- FinishQuizDialog: modal with unanswered count warning, options: Return to Quiz, Save for Later, Submit Quiz
- QuizNavBar: question navigator with previous/next buttons, current index display
- Immediate answer feedback: after selection, answer is locked and explanation shown inline (not deferred to end)
- Session Zod types: SubmitRpcResult, CompleteRpcResult, StartQuizResult, SubmitQuizAnswerResult, CompleteQuizResult, BatchAnswerResult, BatchSubmitResult
- QuizSession component displays explanation immediately after answer selection

**Local dev setup (2026-03-11):**
- Local Supabase via `supabase start` (Docker) — all dev against local, never remote
- `.env.local` → local keys (`localhost:54321`), `.env.remote` → backup of production keys
- Mailpit at `http://localhost:54324` — catches all magic link emails locally
- Studio at `http://localhost:54323`
- `scripts/dev-login.ts` — generates magic link via admin API (no email needed)
- 73 questions seeded locally (050-01-01 through 050-01-05)
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

**Phase 5B-4 done (2026-03-11):** E2E tests (Playwright):
- Auth setup flow: magic link, OTP extraction, session persistence
- 10 E2E tests across 4 spec files: login flow, protected routes (5), quiz session, progress (2)
- Mailpit helper (`e2e/helpers/mailpit.ts`): fetch latest email, extract magic link
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
  - `ci.yml` — runs on every PR and push to master: lint (Biome), type-check (tsc), unit tests (Vitest), dependency audit
  - `e2e.yml` — runs on pull requests + push to master + nightly + manual dispatch: integration tests (Supabase) + E2E tests (Playwright)
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

**Post-sprint polish (2026-03-13, `feat/post-sprint-3-polish`):**
- ✅ Remove FSRS metadata from statistics tab (state, stability, difficulty, interval) — simplify student view to: times seen, accuracy %, last answered date
- ✅ New `fetchExplanation` Server Action — fetches question explanation (text + image) before answering, shows loading state
- ✅ Update `ExplanationTab` to load explanations pre-answer — students can preview explanations in study mode before attempting questions
- ✅ Draft update support: `saveDraft` now accepts optional `draftId` to update existing draft instead of creating new one (fix: resuming draft then re-saving creates duplicate)
- ✅ Navigation guard fix: added `e.returnValue = ''` to beforeunload handler for cross-browser support

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
- Supabase magic link configured
- Email template customized
- Redirect URLs configured:
  - **Site URL:** `https://lmsplus.app` (production)
  - **Allowed redirects:** `https://lmsplus.app/auth/callback`, `http://localhost:3000/auth/callback`
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
- `/` — landing / login page
- `/auth/callback` — magic link callback handler
- `/auth/verify` — "check your email" page

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
└── reports/                ← session history with sortable columns, links to quiz reports
```

### Components (in `packages/ui/`)
- `QuestionCard` — question text + optional image
- `AnswerOptions` — 4 radio options, submit button
- `FeedbackPanel` — correct/incorrect, explanation, explanation image, LO ref
- `ProgressBar` — subject/topic completion
- `SessionSummary` — end-of-session score, time, breakdown
- `SubjectSelector` — EASA subject tree with drill-down

### FSRS integration
- `packages/db/src/fsrs.ts` — FSRS scheduling using ts-fsrs library
- On answer: update `fsrs_cards` table with new stability/difficulty values
- Statistics tab displays per-question FSRS metadata (state, stability, difficulty, interval)

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
        4. learner (haiku) — detect patterns, update rules/memory
        5. coderabbit-sync (haiku) — sync .coderabbit.yaml if rules changed
    → Fix any findings → commit again → repeat until clean

git push (only with user approval)
    → [Lefthook pre-push] security-auditor agent (sonnet) — BLOCKING on CRITICAL/HIGH
    → [Lefthook pre-push] pnpm audit — dependency vulnerabilities

GitHub PR
    → [CodeRabbit] reviews PR against .coderabbit.yaml rules
    → [GitHub Actions ci.yml] lint + types + unit tests
    → [GitHub Actions e2e.yml] integration + E2E tests (PRs + master)

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
> Read docs/plan.md and build student auth (Phase 4) — login page, magic link flow, auth callback, session middleware.

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

From setup audit (2026-03-11):
- **CI/CD:** GitHub Actions mirroring Lefthook checks (once repo goes to GitHub)
- **Error tracking:** Sentry integration after Phase 5 goes live
- **Monitoring:** Vercel Web Analytics dashboard
- **Vercel MCP:** Add after first deploy

---

*Last updated: 2026-03-13 — Sprint 1 complete (10/10 items), Sprint 2 complete (11/11 items), Sprint 3 complete (with post-sprint CodeRabbit fixes + polish)*
