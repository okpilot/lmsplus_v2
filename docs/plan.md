# Build Plan — LMS Plus v2

> This is the master plan. Start every new session by reading this file.
> User writes zero code. Claude plans, builds, tests, reviews, documents.
> Last updated: 2026-03-11

---

## Status: PHASE 4 COMPLETE — ready for Phase 5

**Phase 1 done (2026-03-11):** Monorepo scaffold, all Claude Code config, tooling, shadcn/ui + tweakcn theme, git init. 3 commits on `master`.

**Phase 2 done (2026-03-11):** Supabase setup complete:
- `.env.local` with all credentials (publishable key, secret key, access token)
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
- All 4 Claude agents wired to Lefthook git hooks:
  - `code-reviewer` (haiku) → post-commit, reviews diff for code style violations
  - `doc-updater` (haiku) → post-commit, updates docs when code changes
  - `test-writer` (sonnet) → post-commit, writes missing tests for new source files
  - `security-auditor` (sonnet) → pre-push, **blocking** on CRITICAL/HIGH findings
- Agent memory dirs: `.claude/agent-memory/{code-reviewer,security-auditor,doc-updater,test-writer}/`
- Nested Claude sessions: `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT` + stdin piping

**Phase 4 done (2026-03-11):** Student auth (magic link):
- Login page at `/` with email input + Zod validation
- Magic link via `supabase.auth.signInWithOtp()` → redirects to `/auth/verify`
- Auth callback at `/auth/callback` — exchanges code for session, checks `users` table exists (pre-created by admin)
- Unregistered users signed out + redirected to error page
- Proxy (`proxy.ts`, Next.js 16 convention) protects all `/app/*` routes, refreshes session tokens
- Authenticated users auto-redirected from `/` to `/app/dashboard`
- App layout with user display name + sign-out button
- Dashboard placeholder at `/app/dashboard`
- Supabase middleware client helper in `packages/db/src/middleware.ts`
- Root layout metadata updated (was "Create Next App")

**Next up: Phase 5** — Question Bank Trainer (dashboard, practice modes, FSRS, progress)

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
   Add to `.env.local`: `SUPABASE_ACCESS_TOKEN=sbp_xxxx`
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
- Redirect URLs configured for localhost + Vercel

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

### Middleware
`apps/web/middleware.ts` — protect all `/app/*` routes, redirect to login if not authenticated.

### Session
Supabase session via `@supabase/ssr` package (server-side session management for Next.js App Router).

---

## Phase 5 — Question Bank Trainer (MVP 2)

### Route structure
```
/app/
├── dashboard/              ← progress overview, due reviews, recent sessions
├── review/                 ← Smart Review (FSRS)
│   └── session/            ← active review session
├── quiz/                   ← Quick Quiz config (subject, count, difficulty)
│   └── session/            ← active quiz session
└── progress/               ← detailed progress per subject/topic/subtopic
```

### Components (in `packages/ui/`)
- `QuestionCard` — question text + optional image
- `AnswerOptions` — 4 radio options, submit button
- `FeedbackPanel` — correct/incorrect, explanation, explanation image, LO ref
- `ProgressBar` — subject/topic completion
- `SessionSummary` — end-of-session score, time, breakdown
- `SubjectSelector` — EASA subject tree with drill-down

### FSRS integration
- `packages/db/src/fsrs.ts` — FSRS review scheduling using ts-fsrs
- On answer: update `fsrs_cards` table with new stability/difficulty values
- Smart Review queue: `SELECT * FROM fsrs_cards WHERE due <= now() ORDER BY due`

---

## Automation Pipeline (runs without prompting)

```
Claude finishes responding
    → [Stop hook] biome format changed files
    → [Stop hook] vitest run affected tests
    → [Stop hook] PowerShell toast notification

git commit
    → [Lefthook pre-commit] biome check --write staged files
    → [Lefthook commit-msg] commitlint validates message format
    → [Lefthook post-commit] code-reviewer agent (haiku) — reviews diff, non-blocking
    → [Lefthook post-commit] doc-updater agent (haiku) — updates docs, non-blocking
    → [Lefthook post-commit] test-writer agent (sonnet) — writes missing tests, non-blocking

git push
    → [Lefthook pre-push] tsc --noEmit (type check all packages)
    → [Lefthook pre-push] vitest run --passWithNoTests
    → [Lefthook pre-push] pnpm audit
    → [Lefthook pre-push] security-auditor agent (sonnet) — BLOCKING on CRITICAL/HIGH

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
> Read docs/plan.md and build the Question Bank Trainer (Phase 5), starting with the dashboard and Smart Review mode.

---

## Post-Phase 5 Suggestions

From setup audit (2026-03-11):
- **CI/CD:** GitHub Actions mirroring Lefthook checks (once repo goes to GitHub)
- **Error tracking:** Sentry integration after Phase 5 goes live
- **Monitoring:** Vercel Web Analytics dashboard
- **Playwright MCP:** Add when building E2E tests (Phase 5)
- **Vercel MCP:** Add after first deploy

---

*Last updated: 2026-03-11 — Phase 2 complete, schema deployed to Supabase*
