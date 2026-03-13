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
- **FSRS:** ts-fsrs (TypeScript FSRS-5 implementation)
- **Auth:** Magic link only
- **Hosting:** Vercel
- **Multi-tenant:** organization_id on every table, RLS policies
- **AI-to-slides:** Claude API → Structured JSON → Template Renderer (future, not MVP 2)

### UI Theme (confirmed 2026-03-11)
- **shadcn/ui** — initialized with Tailwind v4 in `apps/web/`
- **Theme** — tweakcn theme `cmjhgwebp000404jl22fv5sh6` applied via registry URL, tokens in `apps/web/app/globals.css` (updated 2026-03-11, was `cmlhfpjhw000004l4f4ax3m7z`)
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
| **Context7** | `@upstash/context7-mcp` | Pulls live docs for ts-fsrs, Next.js, Supabase, shadcn — prevents stale API usage |
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

- **Soft delete everywhere** — `deleted_at TIMESTAMPTZ NULL` on all mutable tables. No hard `DELETE` ever. CAA compliance requires full history. RLS policies include `AND deleted_at IS NULL` so deleted rows are invisible by default.
- **Immutable tables** — `student_responses`, `quiz_session_answers`, `audit_events`: no UPDATE, no DELETE, no soft delete. These are facts.
- **ACID via RPCs** — any operation touching 2+ tables goes in a single Postgres function. No multi-step application-level calls. Core RPCs: `get_quiz_questions`, `batch_submit_quiz` (all answers + session completion in one atomic transaction), `start_quiz_session`. Deprecated: `submit_quiz_answer`, `complete_quiz_session` (superseded by `batch_submit_quiz`).
- **Idempotency** — all INSERTs on mutable data use `ON CONFLICT DO NOTHING` or upsert. Safe to retry on network failure.
- **SECURITY DEFINER RPCs** — must always include manual `auth.uid()` check + `SET search_path = public`. Never skip these.
- **Constraints** — FK, NOT NULL, CHECK on every table. DB enforces consistency, not just app code.
- **Indexes** — FSRS due-queue index is critical hot path. Partial indexes on `deleted_at IS NULL` for active-record queries.
- **Migrations** — forward-only, numbered `NNN_description.sql`, RLS enabled in same file as CREATE TABLE.

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
2. Student dashboard (progress, per-subject, due reviews)
3. Smart Review mode (FSRS spaced repetition)
4. Quick Quiz mode (subject/topic, count/difficulty config)
5. Question display (text, image, 4 options, submit)
6. Immediate feedback (correct/incorrect, explanation + graphic, LO ref, history)
7. Progress tracking (per subject/topic/subtopic)
8. Session history (questions, scores, time)
9. Multi-tenant data model

### Fast-Follow (NOT MVP 2)
- Mock Exam mode
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
- [ ] FSRS parameters — use ts-fsrs defaults initially, tune later
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
- [ ] Add GitHub Actions CI/CD once repo goes to GitHub (mirror Lefthook checks)
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
- All FSRS updates (ts-fsrs calculation) happen client-side post-batch, with best-effort error handling (non-fatal)
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
  - Both RPCs now use `IS DISTINCT FROM` for null-safe auth check (replaces `!=`, handles NULL correctly)
- Validates at the SQL layer to prevent bypassing app-side guards, ensures consistent behavior across clients

---

## Decision 25: Post-session exception for question feedback (2026-03-13)

**Context:** `getQuizReport()` reads `questions.options` (including `correct: boolean`) server-side to build post-session feedback. The `get_quiz_questions()` RPC strips correct answers but is designed for active sessions, not completed-session reports. Semantic reviewer identified that the report page lacked an `ended_at` guard, allowing mid-session access to correct answers.

**Decided:**
- Post-session report queries MAY read `questions.correct` server-side, provided all three conditions are met:
  1. Session is verified completed (`ended_at IS NOT NULL`)
  2. `correct` boolean is stripped before returning to client (options mapped to `{ id, text }` only)
  3. Query runs in a Server Component (no raw DB rows reach the client)
- Guard implemented: `if (!session.ended_at) return null` in `quiz-report.ts`
- `.coderabbit.yaml` `no-answer-exposure` rule updated to require both conditions
- `docs/security.md` Section 4 updated with the post-session exception
- Rationale: showing correct answers after answering is the core learning loop, not a data leak

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

*Last updated: 2026-03-13 — Decision 25: post-session exception for question feedback (ended_at guard + stripping logic)*
