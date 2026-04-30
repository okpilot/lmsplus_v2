# Decisions & Ideas Ledger

> Running log of all decisions, ideas, and open questions.
> Sources: `app-design-document.md`, `step-zero-research.md`, conversation notes.

---

## INCIDENTS & LESSONS LEARNED

### RLS infinite recursion on remote users table (2026-03-12)
- **What happened:** Login on production (`www.lmsplus.app`) failed with "profile lookup failed". Root cause: the `tenant_isolation` RLS policy on `public.users` used a self-referencing subquery (`SELECT organization_id FROM users WHERE id = auth.uid()`), causing infinite recursion on every query to the table.
- **Why migration 004 didn't fix it:** Migration 004 was recorded as applied in Supabase's migration tracker but the SQL never actually executed on remote. The `tenant_isolation` policy remained in place.
- **Fix:** Migration `20260312000012_fix_users_rls_remote.sql` — drops `tenant_isolation`, recreates `users_select` (`id = auth.uid() AND deleted_at IS NULL`). Applied via `supabase db push` alongside 007–011.
- **Lesson:** When a migration is "applied" on remote but broken behaviour persists, check actual policies in Supabase Studio (`Authentication → Policies`) rather than trusting the migration tracker. Create a new idempotent migration to re-apply the fix — keeps git history clean and migration tracker accurate.
- **RLS rule reinforced:** Never write a policy on a table that SELECTs from the same table — always use `auth.uid()` directly.

---

## CONFIRMED DECISIONS

### Stack
- **Monorepo:** Turborepo + pnpm (Vercel-native, simpler than Nx)
- **Frontend:** Next.js + Tailwind CSS v4 + shadcn/ui
- **Backend/DB:** Supabase (Postgres + Auth + Storage + Realtime)
- **Auth:** Email + password (changed from magic link, Decision 29)
- **Hosting:** Vercel
- **Multi-tenant:** organization_id on every table, RLS policies
- **AI-to-slides:** Claude API → Structured JSON → Template Renderer (future, not MVP 2)

### UI Theme (confirmed 2026-03-11, updated 2026-03-18)

- **shadcn/ui v4** — initialized with Tailwind v4 in `apps/web/`, uses Base UI (not Radix) under the hood
- **Theme** — shadcn official "Blue" theme (oklch color space) on neutral base. CSS variables in `apps/web/app/globals.css`. Replaced earlier tweakcn/HSL themes.
- **Colors** — oklch format (not HSL). Tailwind v4 reads oklch values directly via `@theme inline` in globals.css.
- **Dark mode** — `next-themes` with `attribute="class"`, defaults to system preference, toggle in app header

### Tooling (all confirmed 2026-03-11)
- **Linting/formatting:** Biome — replaces ESLint + Prettier. 10-25x faster, single binary, one config file, 450+ rules, TypeScript-aware. Next.js 16+ no longer runs linter on build — Biome runs via Turborepo tasks.
- **Unit/integration tests:** Vitest — replaces Jest. 10x faster, official Next.js guide, official Turborepo guide. Per-package tasks for Turborepo caching.
- **E2E tests:** Playwright — beats Cypress on speed, multi-browser reliability, TypeScript support. Claude Code has official Playwright subagents (planner, generator, healer).
- **Type checking:** TypeScript strict mode — `strict: true` + `noUncheckedIndexedAccess`. Shared `@repo/typescript-config` package with `base.json`, `nextjs.json`, `react-library.json`. Per-package tsconfig (NOT project references).
- **Git hooks:** Lefthook — replaces Husky + lint-staged. One YAML file, parallel execution, native monorepo support. Biome docs officially recommend Lefthook.
- **Commit format:** Conventional Commits enforced via commitlint in Lefthook commit-msg hook.

### Git Hook Pipeline (Lefthook) — updated by Decision 20
```
pre-commit  → biome check --write + tsc --noEmit + vitest run
commit-msg  → commitlint (conventional commits)
pre-push    → security-auditor agent + pnpm audit
post-commit → reminder to run subagents (non-blocking)
```
Post-commit review agents (code-reviewer, doc-updater, test-writer) run as in-session Claude Code subagents, not Lefthook hooks. See Decision 20.

### Claude Code Automation (confirmed 2026-03-11)
- **Approach:** Cherry-pick patterns, write our own lean config (~200 lines). No bloated framework installs.
- **References:** Trail of Bits claude-code-config, tdd-guard, VoltAgent awesome-claude-code-subagents
- **Hooks:** PreToolUse (block rm-rf, block push to main, protect .env) + Stop (format + test + verify + notify) + PreCompact (HANDOVER summary before context compression)
- **Format on Stop** (not PostToolUse) — avoids "files changed" context bloat
- **Windows notifications:** PowerShell toast (not notify-send — Linux only)

### MCPs (confirmed 2026-03-11)

Configured in `.claude/settings.json` under `mcpServers`.

**Essential — active from day one:**

| MCP | Package | What it unlocks |
|-----|---------|----------------|
| **Supabase** | `@supabase/mcp-server-supabase` | Claude runs migrations, manages RLS, queries DB directly — no copy-pasting SQL into dashboard |
| **Context7** | `@upstash/context7-mcp` | Pulls live docs for Next.js, Supabase, shadcn — prevents stale API usage |
| **shadcn/ui** | `shadcn@latest mcp` | Claude auto-installs components; no manual `npx shadcn add` after every prompt |

**Add when needed (not yet configured):**

| MCP | Add at phase | Why |
|-----|-------------|-----|
| Playwright | Phase 5 (E2E tests) | Browser automation for quiz session flows |
| Vercel | After first deploy | Check build logs, deployment status without leaving Claude |

**Skipped:**
- GitHub MCP — known agent-level security vulnerability (malicious issues can leak private repo data). Use GitHub Issues in browser.
- Slack MCP — not needed at current team size. Revisit at first hire or when going live with students.

**Setup complete:** Supabase MCP configured with personal access token and `--project-ref uepvblipahxizozxvwjn`.

### Notifications & Project Tracking (confirmed 2026-03-11)
- **Tech debt / features:** GitHub Issues (lives next to the code, Claude can reference issue numbers in commits)
- **Deployment notifications:** Vercel email (already built-in, no extra setup)
- **Error alerts:** Sentry → email for now; add Sentry → Slack channel when team grows
- **Slack:** Skip until first hire or first live students. Overhead isn't worth it solo.

### Code Style & Quality (confirmed 2026-03-11)
Full rules in `.claude/rules/code-style.md` — binding. Key limits:
- Component: max 150 lines | Page (`page.tsx`): max 80 lines (composition only, no logic)
- Server Action file: max 100 lines | Hook: max 80 lines | Any file: max 300 lines
- Function: max 30 lines, max 3 parameters (use options object beyond 3)
- Max nesting: 3 levels. Early returns over nested if/else.
- Feature-based folders (not type-based). No barrel `index.ts` re-export files.
- No `useEffect` for data fetching — use Server Components.
- No `any` type. No non-null `!` without a justifying comment.
- Co-locate tests: `question-card.tsx` + `question-card.test.tsx` in same folder.
- Code reviewer agent: `.claude/agents/code-reviewer.md` (CREATED, haiku model, runs post-commit)

### Database Principles (confirmed 2026-03-11)
Full reference: `docs/database.md`. Key decisions:

- **Soft delete everywhere** — `deleted_at TIMESTAMPTZ NULL` on all mutable tables. No hard `DELETE` ever (exceptions: `question_comments` — see Decision 30, and `quiz_drafts` — disposable temp storage). CAA compliance requires full history. RLS policies generally include `AND deleted_at IS NULL` so deleted rows are invisible by default — exceptions: `question_comments` (hard delete, Decision 30) and `flagged_questions` (app-side `deleted_at` filter due to `FORCE ROW LEVEL SECURITY` constraint — see database.md).
- **Immutable tables** — `student_responses`, `quiz_session_answers`, `audit_events`: no UPDATE, no DELETE, no soft delete. These are facts.
- **ACID via RPCs** — any operation touching 2+ tables goes in a single Postgres function. No multi-step application-level calls. Core RPCs: `get_quiz_questions`, `batch_submit_quiz` (all answers + session completion in one atomic transaction), `start_quiz_session`. Deprecated: `submit_quiz_answer`, `complete_quiz_session` (superseded by `batch_submit_quiz`).
- **Idempotency** — all INSERTs on mutable data use `ON CONFLICT DO NOTHING` or upsert. Safe to retry on network failure.
- **SECURITY DEFINER RPCs** — must always include manual `auth.uid()` check + `SET search_path = public`. Never skip these.
- **Constraints** — FK, NOT NULL, CHECK on every table. DB enforces consistency, not just app code.
- **Indexes** — partial indexes on `deleted_at IS NULL` for active-record queries (ensures efficient soft-delete filtering).
- **Migrations** — forward-only, named `YYYYMMDDHHMMSS_description.sql` (Supabase CLI format), RLS enabled in same file as CREATE TABLE.

### Security (confirmed 2026-03-11)
Full security reference: `docs/security.md` — binding rules, covers:
- RLS WITH CHECK requirement (not just USING)
- Correct answer stripping via `get_quiz_questions()` server-side RPC
- Service role key server-only rule
- Security headers (CSP, HSTS, X-Frame-Options, etc.)
- Zod validation on every Server Action and API route
- Audit log schema (append-only `audit_events` table)
- Exam session integrity (single-use, server-side time enforcement)
- GDPR data export + deletion endpoints required before first live student
- Dependency scanning (`pnpm audit`) in pre-push hook

### Claude Code Config Structure
```
.claude/
├── settings.json           ← hooks: block rm-rf, push-to-main, .env protection,
│                              format on Stop, test on Stop, notify on Stop, PreCompact handover
├── settings.local.json     ← local overrides (gitignored)
├── hooks/
│   └── pre-compact-handover.sh  ← saves HANDOVER-YYYY-MM-DD.md before compaction
├── agents/
│   ├── code-reviewer.md    ← haiku, read-only, memory: project, proactive after commits
│   ├── security-auditor.md ← sonnet, CREATED, scans diffs for vulns/secrets, memory: project
│   ├── test-writer.md      ← sonnet, writes Vitest tests for new code
│   └── doc-updater.md      ← haiku, updates docs when API changes
├── commands/
│   ├── review.md           ← /project:review
│   ├── test.md             ← /project:test
│   ├── plan.md             ← /project:plan (Plan Mode workflow)
│   └── insights.md         ← /project:insights (weekly self-review → updates memory)
├── skills/
│   ├── nextjs-patterns.md
│   ├── supabase-rls.md
│   └── fsrs-patterns.md
└── rules/
    ├── code-style.md       ← TypeScript strict, Biome, naming conventions
    └── security.md         ← no secrets in code, RLS required, input validation
CLAUDE.md                   ← root, 50-80 lines max
.claudeignore               ← node_modules, dist, .next, *.lock, coverage
```

### Self-Improving Memory System (3 layers)
1. **Auto Memory** — Claude's native MEMORY.md at `~/.claude/projects/.../memory/`. Loads first 200 lines every session. Topic files on demand.
2. **PreCompact Hook** — fires before context compression. Separate Claude instance reads full transcript, saves `HANDOVER-YYYY-MM-DD.md`. Nothing lost when context fills.
3. **Agent memory** — each subagent has `memory: project` → writes to `.claude/agent-memory/<name>/`. Builds institutional knowledge: patterns found, recurring bugs, project conventions.

### Code Reviewer Strategy
- **Now:** Custom local subagent (haiku, read-only, memory: project, runs proactively after commits)
- **Later:** Anthropic official Code Review (parallel Opus agents, GitHub PR inline comments) — $15-25/review, Team plan required. Add when on Team plan.

### Monorepo Package Structure
```
lmsplusv2/
├── apps/
│   └── web/                ← Next.js app (MVP 2: Question Bank Trainer)
├── packages/
│   ├── db/                 ← Supabase schema, migrations, RLS policies, typed client
│   ├── ui/                 ← shadcn/ui components (shared)
│   ├── typescript-config/  ← shared tsconfig (base, nextjs, react-library)
│   └── eslint-config/      ← (empty placeholder — using Biome instead)
├── CLAUDE.md
├── .claudeignore
├── lefthook.yml
├── biome.json
├── turbo.json
└── package.json
```

### CLAUDE.md Approach
- Root CLAUDE.md: 50-80 lines max
- Per-app CLAUDE.md: app-specific conventions
- Per-package CLAUDE.md: package-specific rules
- Progressive disclosure: reference `docs/` for details
- Include: build commands, test commands, gotchas, stack, structure
- Exclude: standard conventions Claude knows, linting rules (use Biome), anything Claude can infer

### MVP Priority
- **MVP 2 first** (Question Bank Trainer) — immediate student value
- MVP 1 (Lesson Builder) comes after

### Question Schema (confirmed)
- Question text
- Question image (optional) — `question_image_url`
- 4 multiple choice options, 1 correct
- Explanation text
- Explanation image (confirmed) — `explanation_image_url`
- EASA subject / topic / subtopic hierarchy
- Learning objective reference

### MVP 2 Features (all P0)
1. Student auth (magic link)
2. Student dashboard (progress, per-subject, recent sessions)
3. Quiz mode (subject/topic drill-down, count slider, randomized questions, partial submissions allowed)
4. Question display (text, image, 4 options, submit)
5. Immediate feedback (correct/incorrect, explanation + graphic, in-session display)
6. Progress tracking (per subject/topic/subtopic)
7. Session history (questions, scores, time, sortable reports page)
8. Question statistics (per-question accuracy %, times seen, last answered date)
9. Multi-tenant data model
10. Saved quiz drafts (up to 20 per student for resume-interrupted-session workflow)

### Fast-Follow (NOT MVP 2)
- ~~Mock Exam mode~~ → **ACTIVE** (PR1: admin config merged, PR2: student exam #514)
- Improvement trend charts
- AI tutor ("Explain this question" via Claude API)
- Weak area recommendations
- Offline mode
- Anthropic Code Review integration (Team plan)

---

## UX REFERENCES

### Closest Competitors
- **Nearpod** — closest UX reference for live session model
- **Aviationexam** — what students currently use, baseline to beat
- **ATPLQuiz.ai** — spaced repetition + AI tutor reference
- **Notion** — slash command block insertion UX
- **Rise 360** — vertical block flow lesson builder

### Key UX Patterns to Adopt
1. Vertical block flow (Rise 360, Notion)
2. Slash command insertion (Notion)
3. Drag-and-drop reordering
4. Preview mode ("play" lesson as student)
5. Immediate feedback with explanations (not just correct/incorrect)
6. Progress dashboard with weak areas highlighted
7. Topic/subtopic drill-down filtering

### Our Competitive Gap
One app, one window, one login. Builder + Player + LMS backbone + question bank + video — purpose-built for regulated aviation training. Nobody does all of this.

---

## OPEN QUESTIONS

### Blocking (cannot build without these)
- [x] **Supabase project** — created, ref: `uepvblipahxizozxvwjn`, schema deployed, RLS verified
- [x] **Question import JSON format** — resolved in Decision 14: matches QDB folder structure, `question_number` for dedup
- [x] **Image handling** — resolved in Decision 14: Supabase Storage `question-images` bucket (public)
- [ ] **EASA subject/topic seed data** — do we have the full taxonomy tree or just sample data?

### Non-blocking
- [ ] Student onboarding — how does a student get invited to an org? (email invite flow)
- [ ] API pattern — Server Actions for mutations, direct Supabase client for reads (confirm when building)

---

## SECURITY DECISIONS (confirmed 2026-03-11)

- **Correct answer exposure risk** — `options[].correct` in JSONB must be stripped server-side via `get_quiz_questions()` RPC. Never `SELECT *` questions for student-facing endpoints.
- **RLS WITH CHECK** — all existing plan sketches only showed `USING`. Every table needs both USING + WITH CHECK.
- **Audit log** — `audit_events` table is append-only (no UPDATE/DELETE policies). Required for CAA compliance.
- **Security review agent** — `security-auditor.md` created. Runs on `git push` via Lefthook pre-push hook. Blocking on CRITICAL and HIGH findings.
- **Service role key** — must live in `packages/db/src/admin.ts` with a runtime browser guard. Never `NEXT_PUBLIC_` prefix.

---

## SETUP AUDIT (2026-03-11)

Full audit completed — 46 files reviewed. Score: 9.5/10. Full report: `docs/setup-audit.md`.

### Minor items to address (non-blocking)
- [ ] Update `apps/web/app/layout.tsx` metadata (still says "Create Next App") — do in Phase 4
- [x] Add security headers to `apps/web/next.config.ts` — done in Phase 2
- [ ] Consider `git diff --check` in Lefthook pre-commit for whitespace issues
- [x] Add GitHub Actions CI/CD — `ci.yml`, `e2e.yml`, `codeql.yml`, `redteam.yml` complete; `dependabot.yml` auto-update config added (2026-03-16)
- [ ] Add Sentry error tracking after Phase 5 goes live

---

## Decision 14: Question import format (2026-03-11)

**Context:** Need to import ~3,000 EASA PPL questions from JSON into Supabase.

**Decided:**
- JSON format matches existing QDB folder structure (one file per subtopic)
- `question_number` field added to `questions` table for external ID tracking and dedup
- Unique index `(bank_id, question_number)` — same question can't appear twice per bank
- Topic/subtopic metadata derived from folder path when JSON fields are null
- Images uploaded to Supabase Storage `question-images` bucket (public)
- Difficulty defaults to `"medium"` when null in source data
- EASA PPL(A) has 9 subjects (not 14 ATPL): ALW, AGK, FPP, HPL, MET, NAV, OPS, POF, COM
- Bootstrap script creates org, admin user, and question bank inline (no separate seed)

---

## Decision 15: Wire all 4 Claude agents to Lefthook (2026-03-11)

**Context:** Agent .md files existed but were never hooked to anything.

**Decided:**
- All 4 agents wired via Lefthook shell scripts in `.claude/hooks/run-*.sh`
- Post-commit (parallel, non-blocking): code-reviewer (haiku), doc-updater (haiku), test-writer (sonnet)
- Pre-push (blocking): security-auditor (sonnet) — exits non-zero on CRITICAL/HIGH
- Nested session fix: `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT` + pipe prompt via stdin
- Agent memory persists in `.claude/agent-memory/*/`

---

## Decision 16: Student auth — pre-created users only (2026-03-11)

**Context:** Multi-tenant platform where ATOs manage their own students. Need to decide how users get created.

**Decided:**
- Admins must pre-create user records in the `users` table before students can sign in
- Auth callback checks if `users` row exists for the authenticated `auth.uid()`
- If no `users` row → sign out + redirect to "not registered" error page
- No self-registration flow — students must contact their flight school admin
- Magic link flow: login page → Supabase OTP → email → callback → dashboard
- Next.js 16 uses `proxy.ts` (not `middleware.ts`) — renamed accordingly

---

## Decision 17: Test-writer agent must verify its own tests (2026-03-11)

**Context:** Test-writer agent wrote 31 tests post-commit but 2 were broken. Nobody caught them because: (a) agent had no `Bash` tool so couldn't run tests, (b) Stop hook swallowed test output with `--silent`, (c) no verification step after writing.

**Decided:**
- Test-writer `--allowedTools` now includes `Bash` — agent can run `vitest` to verify
- `run-test-writer.sh` runs `pnpm test` after agent finishes as a safety net
- `test-writer.md` prompt updated: "Always run tests you wrote. Never leave broken tests."
- `on-stop.sh` removed `--silent` flag — test failures are now visible in Claude output

---

## Decision 18: Local Supabase for development (2026-03-11)

**Context:** Remote Supabase rate-limited magic link emails during dev. Developing against remote DB is risky (data corruption, rate limits, latency).

**Decided:**
- All development against local Supabase (`supabase start`, requires Docker)
- `.env.local` → local keys (`http://localhost:54321`), `.env.remote` → backup of remote/production keys
- Mailpit at `http://localhost:54324` catches all auth emails locally
- Local Studio at `http://localhost:54323` for DB inspection
- `scripts/dev-login.ts` — generates magic link via admin API (bypasses email entirely)
- CSP `connect-src` and `img-src` updated to allow `http://localhost:*` for local dev
- Migration 003 (`question_number`) added to `supabase/migrations/` so it auto-applies on `supabase start`
- Remote DB only used for staging/production deployments

---

## Decision 19: Fix immutable table RLS — scope policies to SELECT+INSERT (2026-03-11)

**Context:** Integration tests (Phase 5B-3) discovered that `quiz_session_answers` and `student_responses` could be updated and deleted despite having explicit `no_update`/`no_delete` policies. Root cause: the `students_own_answers` and `students_own_data` policies had no `FOR` clause, making them apply to ALL operations (SELECT, INSERT, UPDATE, DELETE). PostgreSQL OR's permissive policies, so the ALL-scope policy overrode the `FOR UPDATE USING (false)` / `FOR DELETE USING (false)` policies.

**Fixed in:** Migration `20260311000005_fix_immutable_rls.sql`
- Dropped the ALL-scope policies
- Replaced with explicit `FOR SELECT` + `FOR INSERT` policies
- `no_update` and `no_delete` policies now work as intended
- Verified by 6 integration tests in `rls-immutable-tables.integration.test.ts`

## Decision 20: Post-commit agents — external hooks → in-session subagents (2026-03-11)

**Context:** Code-reviewer, doc-updater, and test-writer agents were wired to Lefthook post-commit hooks as external nested Claude sessions. Their output went to `.claude/agent-memory/` files that never got read. The feedback loop was broken — agents ran but findings were invisible.

**Decided:**
- Remove post-commit hooks from Lefthook (mechanical blocking gates only)
- Code-reviewer, doc-updater, and test-writer now run as Claude Code subagents (Agent tool) after each commit
- Agent output flows back into the conversation — findings are immediately visible and actionable
- Lefthook reduced to 3 layers: pre-commit (biome + types + tests), commit-msg (commitlint), pre-push (security-auditor + dep audit)
- Never push without explicit user approval

**Principle:** If the main Claude session can't see the output, it doesn't exist.

---

## Decision 21: Deferred tech debt → GitHub Issues with `tech-debt` label (2026-03-11)

**Context:** CodeRabbit and post-commit agents surface low-priority findings (test renames, DRY violations, doc polish) that aren't worth fixing in the current PR but shouldn't be forgotten.

**Decided:**
- All deferred tech debt is tracked as GitHub Issues with the `tech-debt` label
- Issues created immediately when the decision to defer is made (not "someday")
- Each issue gets a conventional commit prefix in the title (`refactor:`, `test:`, `fix:`, `chore:`, `docs:`)
- Sprint planning pulls from `tech-debt` label alongside `docs/backlog.md`
- No Slack, no spreadsheets, no TODO comments in code — GitHub Issues is the single source of truth for deferred work

**Why GitHub Issues:** Lives next to the code, Claude can reference issue numbers in commits (`fixes #5`), filterable by label, visible in PRs.

---

## Decision 22: Production domain + Supabase auth redirects (2026-03-11)

**Context:** App deployed to `lmsplus.app`. Supabase remote auth config still pointed at `localhost:3000` — magic link emails would redirect to localhost in production.

**Decided:**
- **Site URL:** `https://lmsplus.app` (set via Supabase Management API)
- **Allowed redirects:** `https://lmsplus.app/auth/callback` + `http://localhost:3000/auth/callback`
- `config.toml` is local dev only — production auth config managed via Management API, not CLI
- Login form uses `window.location.origin` for `emailRedirectTo`, so it works on any domain automatically

---

## Decision 23: Atomic batch quiz submission (2026-03-12)

**Context:** Sprint 2 deferred writes feature accumulates quiz answers in client state, then submits all at once on finish. Original design used per-answer `submit_quiz_answer()` loop + separate `complete_quiz_session()` call — vulnerable to partial failures (e.g., 3 of 5 answers submitted, then network error).

**Decided:**
- New `batch_submit_quiz(p_session_id, p_answers)` RPC processes all answers, calculates score, completes session in a single Postgres transaction
- If any answer fails, entire batch rolls back — no orphaned answers or incomplete sessions
- Replaces `submit_quiz_answer()` (per-answer) and `complete_quiz_session()` (separate call) for new code
- Old RPCs deprecated but kept for backwards compatibility
- Updates `fsrs_cards.last_was_correct` atomically within the RPC transaction (migration 022, then fully atomic in migration 040 for `submit_quiz_answer`)
- Audit event type: `quiz_session.batch_submitted` (distinct from per-answer audit)

---

## Decision 24: Analytics RPCs — explicit auth guards via plpgsql (2026-03-12)

**Context:** Sprint 3 analytics RPCs (`get_daily_activity`, `get_subject_scores`) were initially implemented as `LANGUAGE sql` SECURITY DEFINER functions, relying on the `p_student_id` parameter boundary and WHERE clause checks to enforce single-tenant isolation. This is fragile — easy to miss a check or add a query that bypasses the parameter.

**Decided:**
- Convert both analytics RPCs from `LANGUAGE sql` to `LANGUAGE plpgsql` (migration `20260312000014_analytics_rpcs_plpgsql.sql`)
- Add explicit `IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'` guard at the start of each function
- Keep the redundant `WHERE auth.uid() = p_student_id` check in the query itself for defense-in-depth
- Both checks are required: explicit guard is auditable security, WHERE clause is fallback isolation
- Principle: never trust parameter boundaries alone. Explicit auth checks are cheaper to verify and review.

**Enhancement (2026-03-12, post-CodeRabbit PR #57):**
- Migration `20260312000016_analytics_rpcs_param_clamp.sql` adds parameter validation:
  - `get_daily_activity` p_days clamped to [1, 365] — raises exception if out of range (prevents negative days, year+ span queries)
  - `get_subject_scores` p_limit clamped to [1, 100] — raises exception if out of range (prevents unbounded result sets, matches app-side limit)
  - Migration 16 replaces `!=` with `IS DISTINCT FROM` in the identity check (layer 2, alongside the `IS NULL` guard from migration 14). In SQL, `NULL != value` evaluates to NULL (not TRUE), silently passing the guard. `IS DISTINCT FROM` treats NULL as a concrete value, closing that gap.
- Validates at the SQL layer to prevent bypassing app-side guards, ensures consistent behavior across clients

---

## Decision 25: Post-session exception for question feedback (2026-03-13, updated 2026-03-16)

**Context:** `getQuizReport()` reads `questions.options` (including `correct: boolean`) server-side to build post-session feedback. The `get_quiz_questions()` RPC strips correct answers but is designed for active sessions, not completed-session reports. Semantic reviewer identified that the report page lacked an `ended_at` guard, allowing mid-session access to correct answers.

**Decided:**
- Post-session report queries use the `get_report_correct_options()` RPC to obtain correct option IDs. The TypeScript layer never reads the raw `correct` boolean from options JSONB. Conditions:
  1. Session is verified completed (`ended_at IS NOT NULL`) — checked both in TypeScript and inside the RPC
  2. Options returned to the client are stripped to `{ id, text }` only (explicit `map()` projection)
  3. Query runs in a Server Component (no raw DB rows reach the client)
- **Implementation (2026-03-16):** `get_report_correct_options(p_session_id)` RPC derives the question set from `quiz_session_answers`, validates session ownership and completion, and returns only `(question_id, correct_option_id)`. `getQuizReport()` merges RPC results with question data to build the report.
- Guard implemented: `if (!session.ended_at) return null` in `quiz-report.ts`; RPC second-checks on the server
- `.coderabbit.yaml` `no-answer-exposure` rule updated to require both conditions
- `docs/security.md` Section 4 updated with the post-session exception
- Rationale: showing correct answers after answering is the core learning loop, not a data leak

## Decision 26: Server Action session ownership validation (2026-03-13)

**Context:** CodeRabbit PR #74 identified that `checkAnswer` and `fetchExplanation` accepted any questionId from any authenticated user — no session ownership check. Any student could check answers for questions outside their active session.

**Decided:**
- All Server Actions operating on quiz sessions must verify four conditions before proceeding: session belongs to user (`student_id`), session is active (`ended_at IS NULL`), session is not discarded (`deleted_at IS NULL`), and question is in the session's config (`question_ids`)
- Pattern implemented inline in each action (not extracted to shared helper) to keep actions self-contained
- `Array.isArray()` runtime guard required before `.includes()` on config data — `as unknown as` casts provide no runtime safety
- Error recovery: if `checkAnswer` fails, the UI reverts the answer and unlocks the question for retry (synchronous ref clear + reactive useEffect drain)
- `docs/security.md` Section 11a documents the pattern as binding

---

## Decision 27: Red-team adversarial security testing (2026-03-14)

**Context:** Static code review and unit tests miss real exploit chains and race conditions. Need active adversarial testing against a running app to prove defenses hold.

**Decided:**
- Create red-team suite: 9 Playwright attack specs executing exploit chains against local Supabase (same as production)
- Attack vectors cover: RLS bypass (cross-tenant, question membership), RPC boundary breaches, session forgery (PKCE, replay), race conditions (concurrent discard+complete), audit log tampering, quiz draft injection
- Separate Playwright project (`e2e/redteam/`) to avoid clutter, testIgnore on normal e2e pipeline
- Red-team agent (sonnet) triggers post-commit on security-sensitive file changes (migrations, db/src, quiz/actions, auth, proxy.ts, security.md) — maps diff to affected specs, flags coverage gaps
- Attack surface memory: tracks patterns found, confirmed gaps (marked .fixme), documented gaps (marked .skip), exploitation techniques
- CI workflow `redteam.yml` auto-runs on branches touching security paths
- `/redteam` skill command for on-demand execution (useful for validating fixes)
- Principle: if you can't prove the defense holds under attack, it doesn't

---

## Decision 28: Weekly CI health monitoring (2026-03-17)

- **What:** 4 new GitHub Actions workflows for automated weekly health checks
- **Why:** Agent memory, coverage baselines, bundle sizes, and issue backlogs drift silently. Manual `/insights` runs are easy to forget.
- **Workflows:**
  - `agent-health.yml` (Sun 07:00 UTC) — checks orphan specs, stale vector mappings, stuck learner patterns, agent memory staleness, security checklist alignment, CodeRabbit drift
  - `coverage-trend.yml` (Sun 07:30 UTC) — runs test suite, compares coverage to baseline, flags > 2% drops
  - `bundle-size.yml` (Sun 08:00 UTC) — runs Next.js build, tracks shared bundle size, flags > 10% growth
  - `stale-issues.yml` (Sun 08:30 UTC) — labels issues inactive 30 days, closes at 60 days
- **Baselines:** Stored as workflow artifacts (90-day retention), not git commits. Avoids branch protection issues. Seed files in `.github/` for first run.
- **Reporting:** Each workflow creates/updates/closes a single GitHub Issue (same pattern as `dead-code.yml`)
- **`/insights` expanded:** Now reads all 7 agent memory files + outputs structured agent health table alongside project health bullets
- **Principle:** Mechanical checks in CI, AI-powered analysis stays local in `/insights`

---

## IDEAS / NOTES
- ~3,000 existing questions in mixed formats (Excel, Word, PDF) — need import pipeline
- Students currently use Aviationexam — UX must feel at least as smooth
- Class size up to 10 — no massive scale needed initially
- Compliance is key: attendance, progress tests, final exams must be auditable
- Hooks are guardrails not security walls — prompt injection can bypass them (Trail of Bits)
- Windows: no Seatbelt/bubblewrap sandbox available — rely on hook guardrails only
- Windows notifications: PowerShell toast, not notify-send

---

## Decision 29: Auth method switch — magic link → email + password (2026-03-17, refined 2026-03-18)

**Context:** Magic link auth caused friction in development (Mailpit setup, rate limits, PKCE code forwarding complexity in proxy) and in production (email deliverability, user confusion with magic link flow). Email + password is simpler for an internal training platform.

**Decision:**
- Switch from `signInWithOtp` (magic link) to `signInWithPassword` (email + password)
- Add forgot password flow using PKCE pattern: `resetPasswordForEmail` → recovery email with token_hash → `/auth/confirm` (server-side verifyOtp) → `/auth/reset-password`
- Remove `/auth/verify` page (no longer needed — no email confirmation step)
- Remove PKCE code forwarding from `proxy.ts` (no longer needed)
- Auth callback error redirects changed from `/auth/verify?error=X` to `/?error=X`
- Login page now handles error display via `searchParams`
- Existing magic-link-only users can use "Forgot password?" to set their initial password
- Font changed from Geist to Inter across the app

**Refinement (2026-03-18):**
- Password reset was using implicit flow (hash fragment redirect `type=recovery`) which proxies/servers never see
- Replaced with PKCE pattern: new `/auth/confirm` route validates token_hash server-side via `verifyOtp()`, then redirects
- Recovery email template updated with `/auth/confirm?token_hash=...&type=recovery&next=/auth/reset-password` format
- Removed AuthListener (implicit flow guard no longer needed)

**Files changed:** `login-form.tsx`, `page.tsx`, `auth/callback/route.ts`, `auth/confirm/route.ts` (new), `supabase/templates/recovery.html` (new), `forgot-password-form.tsx`, proxy.ts, forgot-password and reset-password pages. Verify page deleted.

---

### Decision 30: question_comments hard-delete exception

**Date**: 2026-03-20
**Context**: Comments on quiz questions have very low audit value — they're discussion threads, not compliance data.
**Decision**: `question_comments` table uses hard DELETE instead of soft-delete. RLS DELETE policies allow own-row deletion and admin deletion. The `deleted_at` column is retained as a defensive safety net but the primary path is hard DELETE.
**Rationale**: Avoids accumulating deleted comment rows that serve no audit or compliance purpose. The soft-delete matrix in `docs/database.md` documents this exception.

### Decision 31: org-wide comment visibility

**Date**: 2026-03-20
**Context**: This is a single-org EASA PPL training product. Comments on questions are a shared discussion feature.
**Decision**: All authenticated users can see all non-deleted comments on any question. No org-scoping or "questions I've answered" restriction on comment visibility.
**Rationale**: Simplifies RLS and encourages knowledge sharing across the student cohort. If multi-tenancy is added later, comments will be scoped at that point.

### Decision 32: GDPR consent gate — append-only user_consents table + version-based re-consent

**Date**: 2026-03-27
**Context**: Legal compliance (CAA, GDPR) requires tracking when users accept Terms of Service and Privacy Policy. Must support document versioning so that releasing new ToS/Privacy terms triggers re-consent for all users.
**Decision**:
- `user_consents` table: immutable append-only (identical pattern to `audit_events`). Stores every consent decision with document type, version, accepted flag, timestamp, IP, and user agent.
- Two SECURITY DEFINER RPCs: `record_consent()` (append only, called by `/consent` Server Action) and `check_consent_status()` (query acceptances for current versions).
- Consent gate in `proxy.ts` (middleware): cookie-based check (`__consent = "v1.0:v1.0"`). No DB hit per request. Token format: `tos_version:privacy_version` (both required).
- First-login redirect: `/auth/login-complete` calls `check_consent_status()` → if missing or versions stale → redirect to `/consent`.
- `/consent` page: two checkboxes (TOS required, privacy required). Continue button disabled until both boxes checked. Server Action calls `record_consent()` twice (one per document), sets cookie with current versions, redirects to `/app/dashboard`.
- Re-consent trigger: bump version in `lib/consent/versions.ts` (CURRENT_TOS_VERSION, CURRENT_PRIVACY_VERSION) → cookie mismatch → `/consent` redirect on next request.
- Legal pages: `/legal/terms` (plain-language ToS) and `/legal/privacy` (plain-language GDPR privacy policy) linked from login/consent/forgot-password footers and consent form.
**Rationale**: Audit trail for legal compliance. Append-only table prevents accidental history loss. RPCs enforce single path for writes. Middleware cookie check avoids DB load per request. Version strings in cookie allow fast re-consent detection without JOIN.

### Decision 33: GDPR data subject rights — export only, no deletion (EASA Part ORA)

**Date**: 2026-03-27
**Context**: GDPR Articles 15/17/20 require data export and right to erasure. However, EASA Part ORA mandates retention of identified training records for regulatory auditing. Anonymising or deleting training records would break the audit trail required by aviation authorities.
**Decision**:
- **Right of access / data portability** (Art. 15 & 20): Self-service JSON export from `/app/settings`. Admin can also export any student's data from the students management page. Export includes all user-related tables (profile, sessions, answers, responses, FSRS state, flags, comments, consents, audit events).
- **Right to rectification** (Art. 16): Already implemented — edit profile on `/app/settings`.
- **Right to restrict processing** (Art. 18): Already implemented — account deactivation via `toggle-student-status` (soft-delete + auth ban).
- **Right to erasure** (Art. 17): **Declined** under Article 17(3)(b) — processing is necessary for compliance with a legal obligation (EASA Part ORA). No deletion, no anonymisation of training records. Documented in the privacy policy.
- No migration required — pure application-layer change.
**Rationale**: EASA Part ORA is a binding aviation regulation that requires identified training records for regulatory auditing. GDPR Article 17(3)(b) explicitly exempts erasure when processing is necessary for compliance with a legal obligation. Anonymisation would defeat the audit purpose. The privacy policy documents this exemption transparently.

### Decision 34: Server-side pagination with server-side sort/filter

**Date**: 2026-04-04
**Context**: Adding pagination to the reports listing and quiz report pages. The reports page had client-side sorting (date/score/subject) on all sessions loaded at once. With server-side pagination (only 10 rows per page), client-side sorting would only sort the current page's rows — not the full dataset. For example, sorting page 1's 10 rows by score would not surface the student's actual top scores.
**Decision**:
- All paginated lists use Supabase `.range(from, to)` with `{ count: 'exact' }` for server-side offset/limit pagination.
- URL-driven state: `?page=N&sort=field&dir=asc|desc`. Sort/filter state is bookmarkable and shareable.
- **Sorting and filtering MUST be server-side** when combined with server-side pagination. Client-side sort/filter on a paginated subset returns incorrect results.
- Changing sort or filter resets pagination to page 1 and re-fetches from the server.
- Shared `PaginationBar` component with `buildPageNumbers` algorithm (compact with ellipsis for large page counts).
- Page sizes: 10 for student-facing pages, 25 for admin pages.
- Out-of-range page numbers redirect to the last valid page.
- This applies to all current and future paginated pages in the application.
**Rationale**: Server-side pagination is necessary for performance (quiz sessions can have up to 500 questions, reports list grows unbounded). Once pagination is server-side, sort/filter must also be server-side for correctness — sorting a subset gives misleading results. The pattern was first established in the admin question list (PR #463) and is now standardized across the app.

---

### Decision 35: 0-answer expired Practice Exam → results page (not discard)

**Date**: 2026-04-27
**Context**: When a `mock_exam` session countdown reaches zero and the student has not answered any questions, the system must decide what to do with the session.
**Decision**: Call `complete_empty_exam_session` RPC to record `score_percentage = 0`, `passed = false`, `correct_count = 0`, then redirect the student to `/app/quiz/report?session=<id>`. If that RPC fails, fall back to discard + redirect to `/app/quiz`.
**Rationale**: Silent discard gives the student no feedback and no record of the attempt. An explicit 0% / FAIL result on the report page is better UX — the student knows what happened and the attempt is recorded for compliance purposes. The fallback-to-discard path exists so the student is never stuck on an un-submittable session.
**Implementation**: Migration 049 (`complete_empty_exam_session` RPC), Server Action `submitEmptyExamSession`, `handleSubmitSession` in `quiz-submit.ts`.

---

### Decision 36: Practice Exam resume = sessionStorage handoff + server-side question IDs

**Date**: 2026-04-27
**Context**: When a student resumes an interrupted Practice Exam from the dashboard banner (cold start — no active session page in memory), the session page needs the question IDs to rehydrate state. Previously the banner wrote `questionIds: []` to the sessionStorage handoff, which the validator (`isValidSessionData`) unconditionally rejects, silently redirecting the student back to `/app/quiz` instead of resuming.
**Decision**: `getActiveExamSession` reads `quiz_sessions.config.question_ids` from the database (RLS-scoped, no SECURITY DEFINER needed — the student can only see their own rows), validates the JSONB array shape at the server, and returns the IDs in `ActiveExamSession`. The `ResumeExamBanner` writes those real IDs into the handoff payload. Rows with malformed config are skipped with a server-side log and do not appear in the banner.
**Rationale**: The handoff format already requires non-empty `questionIds` (established in Phase 1). Reading them server-side at resume time is the simplest correct approach — no new RPC, no extra table, no client-side secret exposure. Cold-start and cross-tab recovery both work through this path.
**Implementation**: `getActiveExamSession` + `ResumeExamBanner` updated; round-trip test in `resume-exam-banner.test.tsx` pins the validator contract.

### Decision 37: Internal Exam Mode foundation — single-use code-based exam access (2026-04-29)

**Date**: 2026-04-29

**Context**: Official exam delivery (separate from Practice Exam) requires instructor-controlled student access. Single-use 8-character codes ensure one-off exam sessions with controlled demographics and audit trails.

**Decision — Wave 1 (DB + RPCs only, code-first)**:
- New `internal_exam_codes` table with 8-char unique codes (alphabet: A-Z minus O/I, digits 2-9), issued_by/consumed_by/voided_by audit columns, 24h expiry, immutable per RLS
- `quiz_sessions.mode` CHECK extended: `'smart_review' | 'quick_quiz' | 'mock_exam' | 'internal_exam'`
- New admin-only RPC `issue_internal_exam_code()`: generate code, 5-retry collision handling, audit `internal_exam.code_issued`
- New student RPC `start_internal_exam_session()`: validate code, consume atomically via WHERE-clause race guard, auto-complete overdue prior session, build question set from exam config (identical to `start_exam_session`), return sessionId
- New admin RPC `void_internal_exam_code()`: three branches (unconsumed, active-void→session.passed=false, finished), audit event
- Extended `batch_submit_quiz()`: `internal_exam` mode allows partial submissions (no all-answered guard), score = correct/total (unanswered = wrong, same as mock_exam), audit event branched on mode
- Extended `complete_overdue_exam_session()`: same RPC signature, now handles both `mock_exam` and `internal_exam` modes
- `is_admin()` RPC: added `deleted_at IS NULL` filter (closes soft-delete bypass for admin checks, regression from soft-delete matrix)

**Waves 2–7**: UI and integration tests follow.

**Product decisions (locked):**

- **Crockford-style 8-character code.** Alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — excludes `0/O/I/1` to avoid mis-reads when the admin verbally relays a code. 8 chars × 32 symbols = 32^8 ≈ 1.1 trillion entropy; a 5-retry collision loop is sufficient.
- **24-hour validity, single-use.** Codes expire 24h after issue and are single-use only. No extension, no re-redeem. A student needing a retake gets a new code.
- **Plaintext storage.** Codes are stored unhashed in `internal_exam_codes.code`. Justified by short window (24h) + admin's need to re-display a freshly issued code. Read-path queries never return the value to students.
- **Code never displayed in student lists.** The student "Available" tab shows subject + expiry only. Code value is shown to the student exactly once, by the admin, out-of-band.
- **No discard for internal-exam sessions.** `discardSession` Server Action rejects `mode = 'internal_exam'`; the in-session discard button is hidden by mode. Internal-exam attempts are auditable artefacts.
- **Separate reports tab.** Internal-exam sessions are excluded from existing reports/progress queries and surfaced under a dedicated "My Reports" tab on `/app/internal-exam`. Practice and internal exams are reported separately.
- **Admin-only issue/void.** Both lifecycle endpoints gate via `is_admin()` + org-scope. Voiding an active session forces `passed = false` with score computed from existing answers; voiding a finished session is refused (`cannot_void_finished_attempt`).

**Rationale**: Single-use codes prevent reuse and ensure each student gets unique exam audit records. The code-first approach validates DB design before building Server Actions and UI.

### Decision 38: E2E Spec Hermiticity — every Playwright spec restores shared seed state in afterEach (2026-04-30)

**Date**: 2026-04-30

**Context**: Issue #587 — six `internal-exam-*.spec.ts` files failed deterministically in CI with `page.waitForURL(/\/app\/quiz\/session/)` 15 s timeout. Root cause was *not* the visible symptom: `admin-questions.spec.ts` test "selects rows and performs bulk status change" flipped every visible MET question to `status='draft'` and never restored. Within Playwright's `admin-e2e` project, admin-questions runs alphabetically before `internal-exam-*`, so by the time `start_internal_exam_session` ran, its `q.status='active'` filter returned zero and the RPC raised `insufficient_questions_for_exam`. Three rounds of investigation chased the most-visible signal (stale-session cascade, selector drift, tracing visibility) before round 2 found the cross-spec coupling.

**Decision**: Every Playwright spec that mutates shared seed data must restore state in `test.afterEach` (or `afterAll` for describe-scoped fixtures). Codified as a hard rule in `code-style.md §7` "E2E Spec Hermiticity" and mirrored in `.coderabbit.yaml`. The required shape:

1. **Stable marker constant** for test-created rows, exported from a shared helper module — never inline magic strings.
2. **Test-created rows carry the marker** in a queryable column (text prefix preferred — PostgREST `.like()` works).
3. **Single `afterEach` at describe level** invoking the cleanup helper. Runs even on test failure — that is what we want.
4. **Soft-delete, not hard-delete**, for tables with FK children. `student_responses` / `quiz_session_answers` / `flagged_questions` / `question_comments` reference `questions(id)`; hard DELETE risks 23503 violations and breaks `docs/security.md` rule 6.
5. **Zero-row no-op chain** (`.select('id')` + log gated on `data.length > 0`) per `code-style.md §5`.
6. **Cleanup helper has Vitest unit tests** covering org-lookup error, each mutation error path, no-op silence, each log path. Use the `vi.hoisted` + `buildChain` queue/shift pattern when the helper makes multiple sequential calls on the same table.

**Rationale**: Cross-spec test-state leakage produces deterministic failures that present as flakiness — by far the worst class of CI failure to debug, because the symptom and the cause are in different files and the latency between them is the entire prior spec's duration. Promoting the pattern to a rule at count=2 (`admin-students.spec.ts` precedent + `admin-questions.spec.ts` this fix) prevents the next instance from getting through review. Implementation also encodes *why* difficulty is NOT reset in `restoreSeededQuestionsState`: local dev seeds vary difficulty per question (`seed-quiz-setup-eval.ts:184`); resetting would silently mutate dev data while CI is unaffected. That trade-off is documented inline so a future reader doesn't add the reset back without understanding the constraint.

**Implementation**: Round-2 fix commits `e3a7a0b` + `7082d77` + `787b5f0` (PR #590, merged 2026-04-30 → `1eeeda6`). New helper `restoreSeededQuestionsState()` in `apps/web/e2e/helpers/supabase.ts`. Marker constant `E2E_ADMIN_Q_MARKER` exported from same module. 7 unit tests for the helper.

---

*Last updated: 2026-04-30 — Decision 38: E2E Spec Hermiticity rule promotion (count=2)*
