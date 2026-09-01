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
- **Multi-tenant:** organization_id on org-scoped tables, RLS policies (NOT every table — `quiz_session_answers` and `flagged_questions` carry no such column, and `organizations`/`users` carry a policy keyed on `id`; see Decision 59)
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
pre-commit  → biome check --write + tsc --noEmit + soft-delete guard + test-title-leakage guard
commit-msg  → commitlint (conventional commits)
pre-push    → security-auditor agent + pnpm audit
post-commit → reminder to run subagents (non-blocking)
```
Post-commit review agents (code-reviewer, semantic-reviewer, doc-updater, test-writer) run as in-session Claude Code subagents, not Lefthook hooks. See Decision 20.

> Updated 2026-07-11: pre-commit runs biome + type-check + soft-delete-column guard + test-title-leakage guard (unit tests deliberately NOT in pre-commit — they run in CI); pre-push security-auditor is now FAIL-CLOSED (LLM-audit failure or missing script blocks the push).

### Claude Code Automation (confirmed 2026-03-11)
- **Approach:** Cherry-pick patterns, write our own lean config (~200 lines). No bloated framework installs.
- **References:** Trail of Bits claude-code-config, tdd-guard, VoltAgent awesome-claude-code-subagents
- **Hooks:** PreToolUse (block rm-rf, block push to main, protect .env) + Stop (format + test + verify + notify)
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
- Function: max 30 lines, max 3 parameters (use options object beyond 3) — EXCEPTION: React render/return bodies of pure JSX composition allowed to 35 lines (see code-style.md §3)
- Max nesting: 3 levels. Early returns over nested if/else.
- Feature-based folders (not type-based). No barrel `index.ts` re-export files.
- No `useEffect` for data fetching — use Server Components.
- No `any` type. No non-null `!` without a justifying comment.
- Co-locate tests: `question-card.tsx` + `question-card.test.tsx` in same folder.
- Code reviewer agent: `.claude/agents/code-reviewer.md` (CREATED, sonnet model, runs post-commit)

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
- RLS policy coverage per permitted command (superseded 2026-08-09: the clause is PER COMMAND, not a blanket USING + WITH CHECK — see `docs/security.md` §3)
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
│                              format on Stop, test on Stop, notify on Stop
├── settings.local.json     ← local overrides (gitignored)
├── hooks/
│   ├── guard-bash.js        ← PreToolUse Bash: blocks dangerous patterns (rm-rf, push-to-main, .env)
│   ├── review-gate.js       ← PreToolUse Edit/Write: blocks edits while reviewer findings are open
│   ├── cr-local-plan-reminder.sh ← PostToolUse Bash: reminder to run crlocal
│   └── on-stop.sh           ← Stop: biome format + vitest
├── agents/
│   ├── code-reviewer.md    ← sonnet, read-only, memory: project, proactive after commits
│   ├── semantic-reviewer.md ← sonnet, deep logic/security review, memory: project
│   ├── security-auditor.md ← sonnet, CREATED, scans diffs for vulns/secrets, memory: project
│   ├── test-writer.md      ← sonnet, writes Vitest tests for new code
│   └── doc-updater.md      ← haiku, updates docs when API changes
│                              (curated subset — full roster adds plan-critic, implementation-critic,
│                              learner, red-team, coderabbit-sync; see .claude/agents/)
├── commands/
│   ├── review.md           ← /project:review
│   ├── test.md             ← /project:test
│   ├── plan.md             ← /project:plan (Plan Mode workflow)
│   └── insights.md         ← /project:insights (weekly self-review → updates memory)
├── skills/
│   ├── nextjs-patterns.md
│   └── supabase-rls.md
└── rules/
    ├── code-style.md       ← TypeScript strict, Biome, naming conventions
    └── security.md         ← no secrets in code, RLS required, input validation
CLAUDE.md                   ← root, 50-80 lines max
.claudeignore               ← node_modules, dist, .next, *.lock, coverage
```

### Self-Improving Memory System (2 layers)
1. **Auto Memory** — Claude's native MEMORY.md at `~/.claude/projects/.../memory/`. Loads first 200 lines every session. Topic files on demand.
2. **Agent memory** — each subagent has `memory: project` → writes to `.claude/agent-memory/<name>/`. Builds institutional knowledge: patterns found, recurring bugs, project conventions.

> A PreCompact "handover" hook was originally planned as a third layer but removed 2026-05-30: a shell hook has no transcript access (it could only ever write a static stub), and Claude Code's native context-summary carryover already preserves state across compaction.

### Code Reviewer Strategy
- **Now:** Custom local subagent (sonnet — bumped haiku→sonnet in PR #753; read-only, memory: project, runs proactively after commits)
- **Later:** Anthropic official Code Review (parallel Opus agents, GitHub PR inline comments) — $15-25/review, Team plan required. Add when on Team plan.

### Monorepo Package Structure
```
lmsplusv2/
├── apps/
│   └── web/                ← Next.js app (MVP 2: Question Bank Trainer)
├── packages/
│   ├── db/                 ← Supabase schema, migrations, RLS policies, typed client
│   ├── ui/                 ← shadcn/ui components (shared)
│   └── typescript-config/  ← shared tsconfig (base, nextjs, react-library)
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
- **RLS WITH CHECK** — all existing plan sketches only showed `USING`. Every table needs both USING + WITH CHECK. *(Superseded 2026-08-09: coverage is PER COMMAND — `SELECT`/`DELETE` take `USING` only, `INSERT` takes `WITH CHECK` only, `FOR ALL`/`FOR UPDATE` take both. See `docs/security.md` §3.)*
- **Audit log** — `audit_events` table is append-only (no permitting UPDATE/DELETE policies). Required for CAA compliance. *(Clarified 2026-08-09: it does carry `audit_no_update`/`audit_no_delete` `USING (false)` policies; the denial rests on the absence of a permitting policy, not on those. See `docs/security.md` §3.)*
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
- Post-commit (parallel, non-blocking): code-reviewer (sonnet), doc-updater (haiku), test-writer (sonnet)
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

> Updated 2026-07-11: run-test-writer.sh was removed — the test-writer runs as an Agent-tool subagent and verifies its own tests per .claude/rules/agent-test-writer.md; the pnpm-test safety net lives in that flow.

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

**Enhancement (2026-09-01, migration `20260824000300`):**
- Both RPCs gain the **active-user gate** (`.claude/rules/security.md` rule 12 / `docs/security.md` §11c): `PERFORM 1 FROM users u WHERE u.id = auth.uid() AND u.deleted_at IS NULL` → `RAISE 'user not found or inactive'`. Decision 24's two layers checked *who you claim to be*, never *whether that account is still active*, so a student soft-deleted via toggle-student-status kept reading their own analytics for the life of their JWT (~1h) — deactivation cascades to neither `student_responses` nor `quiz_sessions`. The gate sits after the identity guard and before the parameter clamp: an authentication outcome should precede a validation outcome.
- `get_subject_scores` additionally gains `AND qs.deleted_at IS NULL` on its `quiz_sessions` aggregate (rule 9). SECURITY DEFINER is owned by `postgres` (`BYPASSRLS`), so RLS never ran for it and a discarded session still moved the student's average. This CHANGES returned averages. Measured 2026-09-01: `get_subject_scores`'s only in-repo caller was the `getSubjectScores` helper (`apps/web/lib/queries/analytics.ts`), which nothing imported — so no page reached the RPC and the reachable surface was a direct PostgREST call. Callers are an open set; re-derive with `grep -rn "get_subject_scores\|getSubjectScores" apps packages` rather than relying on this sentence.
- Both were missed by the #883 sweep, which `docs/security.md` had recorded as complete. Neither had a test at any tier before this change — coverage is now `packages/db/src/__integration__/rpc-analytics-guards.integration.test.ts`, and both mechanisms are mutation-confirmed there.
- The defense-in-depth `WHERE auth.uid() = p_student_id` clause this decision requires is **kept** — the new gate is a third layer, not a replacement.

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
- Create red-team suite: Playwright attack specs executing exploit chains against local Supabase (same as production); 53 specs as of 2026-08-09 covering OWASP A01/A02/A03/A07/A09 and A10:2025 (exceptional-condition handling / error-path information disclosure)
- Attack vectors cover: RLS bypass (cross-tenant, question membership), RPC boundary breaches, session forgery (PKCE, replay), race conditions (concurrent discard+complete), audit log tampering and completeness, quiz draft injection, SQL/XSS injection, security-header validation
- Separate Playwright project (`e2e/redteam/`) to avoid clutter, testIgnore on normal e2e pipeline
- Red-team agent (sonnet) triggers post-commit on security-sensitive file changes (migrations, db/src, quiz/actions, auth, proxy.ts, security.md) — maps diff to affected specs, flags coverage gaps
- Attack surface memory: tracks patterns found, confirmed gaps (marked .fixme), documented gaps (marked .skip), exploitation techniques
- CI workflow `redteam.yml` runs on every PR to master (no path filter) and is a required status check — a path-filtered required check leaves PRs that don't touch those paths permanently pending
- `/redteam` skill command for on-demand execution (useful for validating fixes)
- Principle: if you can't prove the defense holds under attack, it doesn't

---

## Decision 28: Weekly CI health monitoring (2026-03-17)

- **What:** 4 new GitHub Actions workflows for automated weekly health checks
- **Why:** Agent memory, coverage baselines, bundle sizes, and issue backlogs drift silently. Manual `/insights` runs are easy to forget.
- **Workflows:**
  - `agent-health.yml` (Sun 07:00 UTC) — checks orphan specs, stale vector mappings, stuck learner patterns, agent memory staleness, CodeRabbit drift
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
- **No flag during internal exam.** `toggleFlag` Server Action rejects flagging while the student has an active `internal_exam` session (server-derived, global-per-student guard); the runner flag button is hidden by mode and the internal-exam report drops the flag UI. While an exam is live this also rejects flagging from a past practice-report tab (benign, security-positive). Outside a live internal exam, mock-exam and practice flagging are unchanged. (#908)
- **Separate reports tab.** Internal-exam sessions are excluded from existing reports/progress queries and surfaced under a dedicated "My Reports" tab on `/app/internal-exam`. Practice and internal exams are reported separately.
- **Admin-only issue/void.** Both lifecycle endpoints gate via `is_admin()` + org-scope. Voiding an active session forces `passed = false` with score computed from existing answers; voiding a finished session is refused (`cannot_void_finished_attempt`).

**Rationale**: Single-use codes prevent reuse and ensure each student gets unique exam audit records. The code-first approach validates DB design before building Server Actions and UI.

### Decision 38: E2E Spec Hermiticity — every Playwright spec restores shared seed state in afterEach (2026-04-30)

**Date**: 2026-04-30

**Context**: Issue #587 — six `internal-exam-*.spec.ts` files failed deterministically in CI with `page.waitForURL(/\/app\/quiz\/session/)` 15 s timeout. Root cause was *not* the visible symptom: `admin-questions.spec.ts` test "selects rows and performs bulk status change" flipped every visible MET question to `status='draft'` and never restored. Within Playwright's `admin-e2e` project, admin-questions runs alphabetically before `internal-exam-*`, so by the time `start_internal_exam_session` ran, its `q.status='active'` filter returned zero and the RPC raised `insufficient_questions_for_exam`. Three rounds of investigation chased the most-visible signal (stale-session cascade, selector drift, tracing visibility) before round 2 found the cross-spec coupling.

**Decision**: Every Playwright spec that mutates shared seed data must restore state in `test.afterEach` (or `afterAll` for describe-scoped fixtures). Codified as a hard rule in `code-style.md §7` "E2E Spec Hermiticity" — and its sub-rule "Multi-Step Cleanup Needs a Per-Step Error Accumulator" (≥2-step `afterEach`/`afterAll` blocks must isolate each step in try/catch + accumulate errors, promoted #794) — both mirrored in `.coderabbit.yaml`. The required shape:

1. **Stable marker constant** for test-created rows, exported from a shared helper module — never inline magic strings.
2. **Test-created rows carry the marker** in a queryable column (text prefix preferred — PostgREST `.like()` works).
3. **Single `afterEach` at describe level** invoking the cleanup helper. Runs even on test failure — that is what we want.
4. **Soft-delete, not hard-delete**, for tables with FK children. `student_responses` / `quiz_session_answers` / `flagged_questions` / `question_comments` reference `questions(id)`; hard DELETE risks 23503 violations and breaks `docs/security.md` rule 6.
5. **Zero-row no-op chain** (`.select('id')` + log gated on `data.length > 0`) per `code-style.md §5`.
6. **Cleanup helper has Vitest unit tests** covering org-lookup error, each mutation error path, no-op silence, each log path. Use the `vi.hoisted` + `buildChain` queue/shift pattern when the helper makes multiple sequential calls on the same table.

**Rationale**: Cross-spec test-state leakage produces deterministic failures that present as flakiness — by far the worst class of CI failure to debug, because the symptom and the cause are in different files and the latency between them is the entire prior spec's duration. Promoting the pattern to a rule at count=2 (`admin-students.spec.ts` precedent + `admin-questions.spec.ts` this fix) prevents the next instance from getting through review. Implementation also encodes *why* difficulty is NOT reset in `restoreSeededQuestionsState`: local dev seeds vary difficulty per question (`seed-quiz-setup-eval.ts:184`); resetting would silently mutate dev data while CI is unaffected. That trade-off is documented inline so a future reader doesn't add the reset back without understanding the constraint.

**Implementation**: Round-2 fix commits `e3a7a0b` + `7082d77` + `787b5f0` (PR #590, merged 2026-04-30 → `1eeeda6`). New helper `restoreSeededQuestionsState()` in `apps/web/e2e/helpers/supabase.ts`. Marker constant `E2E_ADMIN_Q_MARKER` exported from same module. 7 unit tests for the helper.

### Decision 39: GDPR export sub-read failure → machine-readable `warnings` field (not silent empty, not hard-fail) (2026-06-06)

**Date**: 2026-06-06

**Context**: Issue #684 (spun out of #668/#681). `collectUserData()` fetches each export section independently. When a sub-read fails, `fetchAllRows` discards partial pages and returns `{ data: [], error }`, so the section comes back empty. The prior behaviour logged the failure server-side and returned the export anyway. For a **legal** GDPR data-subject export this is risky: a transient outage could hand the requester an export that *looks* whole while silently missing a section — the server log is the only signal.

**Decision**: Add a machine-readable `warnings: GdprExportWarning[]` field to `GdprExportPayload`. Each failed sub-read appends `{ section, message }` (section = payload key; message = a fixed user-safe string — the raw DB error is logged server-side only, never surfaced to the data subject per `docs/security.md` error-sanitisation). The export is still **returned** rather than hard-failing, so a transient outage never denies the data subject their right of access (Art. 15); the warnings make any incompleteness explicit so the caller/UI can warn or retry.

- Rejected **hard-fail-and-retry**: a single section outage would block the entire export, denying access for a transient cause.
- Rejected **keep-as-is (empty + log only)**: incompleteness was invisible to the requester — unacceptable for a legal export.
- The user record itself remains a **hard fail** (`throw 'User not found'`) — without identity the export is meaningless.

**Rationale**: Preserves the right of access while making partial failure auditable and actionable, at app-layer cost only (no migration). Empty array when every section exports cleanly.

**Implementation**: `GdprExportWarning` type + `warnings` field in `apps/web/lib/gdpr/types.ts`; `collectSectionWarnings()` helper in `collect-user-data.ts`; warnings asserted in `collect-user-data.test.ts` (incl. the mandatory `fetchAllRows` page-error-after-count-success path). Both Server Action callers (`exportMyData`, `exportStudentData`) pass the payload — and its `warnings` — through unchanged.

### Decision 40: Adopt Socket.dev for supply-chain detection; remove the redundant Snyk trial (2026-06-08)

**Date**: 2026-06-08

**Context**: Issue #109 (open since 2026-03-14) asked us to evaluate Snyk, Socket.dev, and other dependency-scanning tools against our then-current `pnpm audit`-only posture. Since the issue was filed, known-CVE coverage has been layered several deep: `pnpm audit --audit-level=high` runs both in CI (`ci.yml`) and the pre-push hook (`lefthook.yml`); Dependabot opens grouped update PRs workspace-wide (`dependabot.yml`); CodeQL runs SAST on every PR and push to master plus a weekly scheduled scan; SonarCloud runs on every PR and push to master. What none of these cover is **behavioral supply-chain analysis** — a freshly published malicious, typosquatted, or hijacked package has no CVE yet, so `pnpm audit` / Dependabot / CodeQL are all blind to it.

A second finding surfaced *during* this work: **Snyk was already integrated** — the #109 "trial Snyk for 1 week" action item had been carried out (a Snyk↔GitHub App on the `okpilot` account, monitoring 5 manifests and posting the `security/snyk` PR status check) and never removed. It leaves **no files in the repo**, so a file-based tooling inventory misses it; it was only visible as a passing PR check on the Decision-40 PR itself.

**Decision**: Adopt **Socket.dev** via its **GitHub App** (free for public repos; no API key, no CI maintenance) for supply-chain / malicious-package detection. It auto-comments behavioral risk analysis (install scripts, network/filesystem/env access, obfuscation, typosquatting) on dependency PRs — exactly where Dependabot's weekly PRs land. `pnpm audit` + Dependabot + CodeQL stay as the known-CVE layer; Socket adds the previously-missing behavioral layer.

- **Remove the existing Snyk integration** as redundant: its SCA/CVE scanning duplicates `pnpm audit` + Dependabot + CodeQL and closes no gap those don't already cover. Keeping it just adds a second CVE source and an extra PR status check for no new capability. Removal de-clutters PR checks and consolidates CVE scanning on the existing layer. (Free for public repos, so cost was never the factor — redundancy is.) Disconnecting the Snyk App is a one-time repo-admin action (Snyk dashboard / GitHub App settings), documented on #109.
- Rejected **replacing `pnpm audit`**: defense-in-depth — the CI/pre-push audit is a cheap, offline, enforceable gate; Socket is an advisory PR-comment layer, not a CI blocker.
- Also enabled **Dependabot automated security fixes** (the `automated-security-fixes` repo setting; vulnerability *alerts* were already on) so vulnerable deps get auto-remediation PRs.

**Rationale**: Closes the one real gap in #109 (supply-chain behavioral detection) at zero cost and near-zero maintenance, and removes a redundant CVE scanner rather than maintaining two. Socket's PR-comment model pairs naturally with Dependabot's update cadence; an App-only integration was chosen over a CI Socket Action to avoid maintaining a workflow + API secret.

**Implementation**: Docs-only in-repo (this entry + `docs/plan.md` tooling note). Two one-time repo-admin actions are documented on issue #109: **install the Socket GitHub App** and **disconnect the Snyk App**. Dependabot security-updates toggled via `PUT /repos/okpilot/lmsplus_v2/automated-security-fixes`. No code, migration, or CI-workflow change (Snyk left no repo files to remove).

### Decision 41: Column-level privilege gate (REVOKE/GRANT) for answer-key columns on questions (2026-06-10)

**Date**: 2026-06-10

**Context**: VFR RT (Phase A) introduces three new question types alongside multiple-choice: short_answer (graded against canonical_answer + accepted_synonyms) and dialog_fill (graded against blanks_config). The four answer-key columns (canonical_answer, accepted_synonyms, dialog_template, blanks_config) must never be exposed to students before submission — only admins during authoring and SECURITY DEFINER RPCs during grading should access them.

The existing `tenant_isolation` RLS policy on questions is org-scoped, not role-scoped — a same-org student passes it. RLS cannot express column-level restrictions; Postgres privilege grants/revokes are the only enforcement mechanism.

**Decision**: Apply the #611 column-GRANT pattern (precedent: mig 20260605000001 on quiz_sessions scoring columns) to the four answer-key columns on questions (mig 094):
1. `REVOKE SELECT ON questions FROM authenticated` (blanket revocation)
2. `GRANT SELECT (id, organization_id, bank_id, subject_id, topic_id, subtopic_id, lo_reference, question_number, question_text, question_image_url, options, explanation_text, explanation_image_url, difficulty, status, version, question_type, created_by, deleted_at, deleted_by, created_at, updated_at) ON questions TO authenticated` — all columns except the four answer-keys

Consequences:
- Any direct `.select('*')` or `.select('canonical_answer, ...')` from an authenticated client returns `42501 (permission denied for column)` before RLS fires — defense-in-depth
- All SECURITY DEFINER RPCs and service-role scripts are unaffected (they run as postgres, which retains full grant)
- Admin reads of answer-key columns go through the new `get_question_authoring_fields()` RPC (mig 094b, is_admin()-gated) — asymmetry by design

**Rationale**: A single rule-level CHECK constraint (`questions_question_type_columns_check`, added alongside the columns, mig 094) ensures the DB layer prevents cross-contamination (e.g., a bug saving canonical_answer on a multiple_choice question). The privilege gate prevents *exposure* of that data to students before submission. Together they form a two-layer defense.

**Implementation**: Mig 094 (creates the four columns + type discriminator CHECK) includes the REVOKE/GRANT block. Mig 094b defines `get_question_authoring_fields()` RPC for admin reads. No other code changes needed; all existing student question reads already use explicit column lists (verified in PR #697 A.1 audit, see design.md).

---

### Decision 42: UNIQUE NULLS NOT DISTINCT for per-blank answers in quiz_session_answers + student_responses (2026-06-10)

**Date**: 2026-06-10

**Context**: VFR RT (Phase A) introduces dialog_fill questions, where one submission can write multiple answer rows — one per blank. The old one-row-per-question model (multiple_choice, smart_review, quick_quiz) enforces `UNIQUE (session_id, question_id)`. The new model must support *both* the old semantics (blank_index NULL for MC/short_answer) and the new multi-blank semantics (blank_index int for dialog_fill).

Postgres 17 (supabase/config.toml specifies PG17) introduced `UNIQUE NULLS NOT DISTINCT`, which treats `NULL = NULL` as a match (violates uniqueness) — allowing `(session_id, question_id, NULL)` to appear only once, while `(session_id, question_id, 0)` and `(session_id, question_id, 1)` can coexist.

**Decision**: Drop the old `UNIQUE (session_id, question_id)` constraints and replace with `UNIQUE NULLS NOT DISTINCT (session_id, question_id, blank_index)` (mig 095) on both `quiz_session_answers` and `student_responses`. This preserves old one-row-per-question behavior for legacy callers (blank_index omitted → NULL → single row per question) while enabling per-blank rows for new code.

**Release coupling**: Migs 095 (schema shift), 095b (update submit_quiz_answer RPC), and 095c (update batch_submit_quiz RPC) ship in the same release. The constraint change is paired with ON CONFLICT clause redefinition inside two plpgsql RPC bodies. Because ON CONFLICT inference validation is deferred to execution time (not apply time), `db reset` applies the migration cleanly but the first live submit throws `42P10 (ON CONFLICT inference target not found)` without the RPC updates. All three must ship together.

**Rationale**: Preserves idempotency and the one-row-per-question guarantee for existing study modes while cleanly extending to per-blank semantics for VFR RT without schema migration churn.

**Implementation**: Mig 095 drops and re-creates the unique constraints. Migs 095b and 095c redefine the two affected RPCs' ON CONFLICT clauses to reference the new constraint. No app-code changes; callers of `batch_submit_quiz` already omit blank_index (lands as NULL, conflicts on old semantics unchanged).

---

### Decision 43: VFR RT exam grading — per-part ≥75% pass criterion, immutable config.question_ids (2026-06-10)

**Date**: 2026-06-10

**Context**: VFR RT exams (Phase A) are structured as three parts (Part 1 acronyms, Part 2 dialog, Part 3 multiple-choice), each with its own question pool and passing threshold. Overall pass requires all three parts ≥75%. The fixed question set at session start is sampled from `exam_configs.parts_config` (mig 098) and frozen in `quiz_sessions.config.question_ids` (write-once, enforced by trigger mig 079).

**Decision**:
1. **Per-part ≥75% pass rule (migs 100, 102, 103)**: Each of the three parts must score ≥75% independently. The overall `passed` flag is true only if `v_p1 >= 75 AND v_p2 >= 75 AND v_p3 >= 75`. The aggregate score_percentage is `mean(p1, p2, p3)` — informational only, not used for pass/fail.
2. **Immutable config.question_ids (security.md §15 exception)**: The question set is sampled at session start and locked in config (frozen by trigger). Grading RPCs (`submit_vfr_rt_exam_answers`, `complete_overdue_exam_session`, `get_vfr_rt_exam_results`) read questions by this frozen ID array without `deleted_at IS NULL` filters — soft-deleted questions sampled before deletion are still graded (historical-record posture, same as batch_submit_quiz's immutable-write-once exception).

**Rationale**:
- **Per-part criterion**: mirrors the EASA regulatory exam structure (three distinct competency areas, each tested). A student weak in one area can retake focused study without failing overall due to another area's unrelated gap.
- **Immutable ID list**: avoids the race condition where a question is soft-deleted mid-exam, and its explanation becomes unavailable on the results review. The question_ids array is the immutable contract; grading must honor it.

**Implementation**: originally migs 100-103; the per-part ≥75% rule above is what binds, NOT those
migration numbers, because every one of the three RPCs has since been redefined. Do not read this
paragraph as a pointer to the current bodies: trace the latest matching definitions in
`supabase/migrations/`, which is the sole source of truth. `docs/database.md` is explanatory and
can itself lag.
Latest definitions as of 2026-08-18, by `supabase/migrations/` timestamp (the sole source of truth;
`packages/db/migrations/` is frozen and carries false history):

| RPC | Latest definition |
|---|---|
| `submit_vfr_rt_exam_answers` | `20260815000300_submit_vfr_rt_fuzzy.sql` |
| `complete_overdue_exam_session` | `20260610001200_extend_overdue_for_vfr_rt_exam.sql` |
| `get_vfr_rt_exam_results` | `20260619000500_vfr_rt_results_use_correct_option_id.sql` |

The grader in particular has moved a long way from mig 100 — it now reads the relocated
`questions.correct_option_id` (#823) and grades text answers through `answer_matches` typo
tolerance (D56), and it raises `unsupported_question_type` for anything outside
`short_answer` / `dialog_fill` / `multiple_choice`. No config or trigger changes were needed for
this decision; existing immutability (trigger mig 079) already enforces question_ids write-once.

---

### Decision 44: Transactional email provider — Resend (2026-06-18)

**Date**: 2026-06-18

**Context**: Internal Exam feature (Wave 2) adds a "Send via Email" button on the issued-code panel so an admin can email a single internal exam code to a student instead of copying it manually. This requires a transactional email provider. Supabase Auth handles its own emails (password reset, magic link era); for out-of-band operational emails (exam codes, future notifications), we need a separate provider.

**Decision**: Use **Resend** as the transactional email provider. Server-side only (RESEND_API_KEY; never NEXT_PUBLIC_). Email template is co-located in `apps/web/lib/email/templates/` (rich HTML + plain-text fallback, no external rendering service). Fallback for local dev: when no API key is set, log the email template to console (no external SMTP/Mailpit needed during dev).

- **Why Resend**: Developer-friendly API, excellent TypeScript support via their SDK, per-request template rendering (no separate service), good uptime, free tier covers dev/test, pricing scales with volume
- **Coexist with Supabase Auth emails**: No conflict; Supabase Auth uses its own configured provider (internal SMTP) and endpoint. Resend is for app-initiated operational emails only.
- **DNS TXT records (SPF/DKIM)**: Managed separately; Resend provides setup guidance per custom domain. For `lmsplus.app`, DNS records point to both Supabase Auth SMTP (existing) and Resend (new); no coordination needed at the DNS level.
- **No email queue/retry logic in app**: Resend SDK handles retries server-side. If email send fails, Server Action logs and returns a generic error to the admin — best-effort (failure does not surface as a blocking error; audit may or may not record the event depending on the failure path — see audit RFC for detail).

**Implementation**: 
- New env vars: `RESEND_API_KEY` (server-side) + `EMAIL_FROM` (e.g., `noreply@lmsplus.app`, also server-side)
- New `lib/email/resend.ts` — Resend client wrapper with a console-log fallback for missing API key (local dev)
- New `lib/email/templates/internal-exam-code.ts` — template function returning `{ subject, html, text }`
- New Server Action `sendInternalExamCodeEmail()` — Zod-validated, org-scoped, guard-gated, generic errors, best-effort audit via `record_internal_exam_code_emailed` RPC
- New RPC `record_internal_exam_code_emailed(p_code_id)` — SECURITY DEFINER audit writer (mig 110)

**Rationale**: Resend's developer experience and TypeScript-first design align with the Next.js stack. Email-send failures are non-fatal (the code is issued and visible; the admin can retry); best-effort audit captures intent. Future waves can add retry logic or an email queue if volume demands it.

**Scope**: internal-exam code delivery only. Future notifications (quiz reminders, completion alerts, etc.) are out-of-scope for this decision.

---

---

### Decision 45: VFR RT training reuses the quiz Study UI on a dedicated `/app/vfr-rt` route (2026-06-20)

**Date**: 2026-06-20

**Context**: VFR RT (radiotelephony) was originally being built as a bespoke timed mock-exam UI at `/app/vfr-rt-exam` (Phase C, parked PR #923). That approach was rejected: it duplicated the quiz Study experience (setup → runner → report) that already exists and is well-tested, and it front-loaded the timed-exam mode before students had any way to *practice* RT at all.

**Decision**: Build VFR RT **training first**, by **reusing the existing `/app/quiz` Study UI** on a separate `/app/vfr-rt` route with its own nav item. The exam mode returns later as an *exam-mode toggle on the same shared UI*, not as a parallel bespoke screen.

- **Reuse at the leaf level, not the page level**: `VfrRtConfigForm` composes the existing `TopicTree` + `QuestionCount` quiz components; the parent `QuizConfigForm` was too coupled (subject picker, quiz-specific options) to reuse wholesale. Practice runs through the standard quick-quiz study session (shared runner + report).
- **Separate route + nav item**: `/app/vfr-rt` with a `VFR RT` nav entry; RT is removed from the generic quiz subject picker (`quiz-subject-queries.ts` excludes `code === 'RT'`) so the two surfaces don't overlap.
- **Training before exam**: Phase 1 ships MC-only practice. The parked bespoke exam UI (#923) is throwaway — keep ideas, not code. The timed exam returns as an exam-mode on the shared UI in a later phase.
- **Five question types planned** (per the VictorOne briefing): `short_answer`, `dialog_fill`, `multiple_choice`, and two drag types — `ordering` (MAYDAY/position) and `diagram_label` (drag labels onto a runway pattern), the latter two via dnd-kit. Phase 1 covers `multiple_choice` only.

**Update (2026-07-02 — Phases 5–7 complete)**: All five question types now ship on the shared `/app/quiz` Study UI — `multiple_choice`, `short_answer`, `dialog_fill` (Phases 1–4), plus `ordering` and `diagram_label` via dnd-kit (Phases 5–6; Decisions 50–52). Phase 7 (cleanup) confirmed the VFR RT practice path was type-agnostic throughout — the "optional MC-only filter" in the Phase-1 plan was never wired, so there was no scaffolding to remove. #923's bespoke `/app/vfr-rt-exam` UI stays **parked/throwaway**; the timed exam will return as an **exam-mode toggle on this shared UI, inheriting all five types** — not a parallel bespoke screen. (Training go-live is still gated on RT content import + the #1045 ordering answer-key hardening.)

**Rationale**: Reusing the Study UI eliminates duplicate runner/report logic and inherits its test coverage; building training first gives students value immediately and lets the timed exam ride on a proven, shared foundation. See `feedback-reuse-quiz-ui-for-vfr-rt` memory and `.spec-workflow/specs/vfr-rt-training/`.

**Scope**: VFR RT student-facing training UI. Backend non-MC question types, the drag types, and exam-mode are later phases of the same spec.

---

### Decision 46: App-layer DB integration test tier + mechanical schema-contract guards (2026-06-21)

**Date**: 2026-06-21

**Context**: App-layer query code (`apps/web/lib/queries/**` + `apps/web/app/**` Server Actions — over 100 `.from()`/`.rpc()` sites across ~30 RPCs) was tested only with a mocked Supabase client that cannot see the real schema. `packages/db/__integration__` tests the DB layer in isolation but never the app's own queries. The gap let a schema-contract bug ship: `.is('deleted_at', null)` on `easa_subjects` (a table with no `deleted_at` column) reached production code and passed mocked unit tests, `tsc`, Biome, three plan-critic approval rounds, and both Sonnet and Opus impl-critics — caught only by semantic-reviewer reasoning (#925).

**Decision**: Add a dedicated **app-layer DB integration tier** and back it with **mechanical guards**.
- **The tier** (`apps/web/vitest.integration.config.ts`, `*.integration.test.ts`): runs the REAL `apps/web` query code against a REAL local Postgres. Only `next/headers` `cookies()` is mocked; `harness.signInAs()` seats a real session via the real `@supabase/ssr` client so every query runs authenticated under real RLS. No Supabase client / query helper / RPC wrapper is mocked. Phases 0–2 delivered read-path + full mutation-lifecycle coverage; the original RT bug now fails the tier with `column easa_subjects.deleted_at does not exist`.
- **Mechanical guard** (Phase 3, schema-derived per #933, `.claude/hooks/check-soft-delete-guard.mjs`): a chain-aware pre-commit + CI guard that parses `packages/db/src/types.ts` and blocks `.is('<column>')` on any table **modeled in those types** whose columns don't include `<column>` (a `.from()` on an unmodeled table — a view, a typo — is skipped, never flagged; a total parse failure fails closed and blocks) — so a `.is('deleted_at')` on a no-`deleted_at` table (the guard derives that set from the types file, so it needs no list here; `code-style.md` §5 names the members as of 2026-07-12 as a reading aid), and any future such table, is caught automatically without a guard update. `docs/database.md` §3 documents the fuller no-soft-delete matrix (which also includes hard-delete-exception tables that retain a `deleted_at` column). A biome `noRestrictedImports` rule blocks production code from importing `@repo/db/test-helpers` (it wraps the service-role key).
- **HARD policy** (Phase 4): every NEW `.from()`/`.rpc()` site in app-layer code ships a co-located `*.integration.test.ts`. Applies to new code; the ~40 pre-existing uncovered sites are tracked as backlog (#926).

**Rationale**: Mocked clients structurally cannot surface schema-contract, RLS-scope, or BIGINT-as-string bugs. A real-DB tier plus a **schema-derived** mechanical guard (generalized in #933) makes the worst class (filtering a non-existent column) impossible to reintroduce, and the HARD policy stops the gap from re-opening.

**Scope**: App-layer query/Server-Action testing + the mechanical guards + the new-query-site policy. Does not change runtime behavior, schema, or RPCs.

---

### Decision 47: batch_submit_quiz per-type dispatch — internal helpers gated by REVOKE EXECUTE FROM PUBLIC, anon, authenticated (2026-06-21)

**Date**: 2026-06-21

**Context**: VFR RT Training Phase 2 must let `batch_submit_quiz` record `short_answer` + `dialog_fill` answers at session end, not just `multiple_choice`. The function's MC-specific guards ran unconditionally per answer (rejecting non-MC), and the body was already 306 lines — at the `code-style.md §1` 300-line cap. Adding two more inline type branches would exceed the cap; a function is a single object, so splitting migration files cannot shrink it. The spec's original N2 plan was to extract per-type grade+record into helper functions "each SECURITY DEFINER with the same guard set." Plan-critic (security lens, Opus) found that plan unsafe: `CREATE FUNCTION` grants `EXECUTE` to `PUBLIC` by default, so a `p_student_id`-taking helper that writes to immutable answer tables would be directly callable via PostgREST by any authenticated user — a cross-user forge primitive — unless guards were duplicated into every helper.

**Decision**: Keep `batch_submit_quiz` as the **single authorization boundary** — all auth/owner/mode guards run once at entry (unchanged) — and extract per-type grade+record into three internal helper functions (`_grade_record_mc/_short_answer/_dialog_fill`), each `SECURITY DEFINER SET search_path = public` and each made genuinely internal with an explicit **`REVOKE EXECUTE ON FUNCTION <helper>(...) FROM PUBLIC, anon, authenticated`** (the postgres-owned dispatcher retains owner EXECUTE; `service_role`, the trusted backend key, is not an attacker-facing API role and keeps EXECUTE). **`FROM PUBLIC` alone is INSUFFICIENT**: Supabase additionally grants `EXECUTE` on new `public` functions to `anon`/`authenticated` via `ALTER DEFAULT PRIVILEGES` — a *separate* grant from the PUBLIC one that survives `REVOKE … FROM PUBLIC`. The first cut shipped `FROM PUBLIC` only; CI's integration test (a direct authenticated call with signature-valid args) caught the helper reaching its body, proving `authenticated` retained EXECUTE (#952). Local stacks lack this default-priv grant, so the gap is invisible locally — CI is authoritative. The REVOKE must name every API role explicitly. Helpers keep their per-type **correctness** guards (MC option-membership, short canonical-NULL, dialog blank-index) but not the auth/owner/mode guards. Additionally, the session score is rolled up over **DISTINCT question_id** (a `session_questions` CTE) with **partial credit** for `dialog_fill` (`sum(LEAST(correct_blanks/total_blanks, 1))`, divided by the relevant question count when computing the final score) — matching the VFR RT exam path (`submit_vfr_rt_exam_answers`) so the same question type is graded identically in practice and exam; this also fixes a latent score-denominator bug where per-blank rows would have inflated the raw `count(*)` answered/total.

**Rationale**: The REVOKE-internal-helper model keeps one authorization boundary (no per-answer guard re-execution, no duplicated surface) while closing the default-grant hole. This is a NEW repo pattern (no prior `REVOKE ... FROM <role>` on a helper), so an integration test asserts each helper returns `42501`/`PGRST202` to a direct authenticated PostgREST call **with signature-valid args** — an empty `{}` payload is a vacuous negative (PostgREST returns `PGRST202` from overload-resolution failure *before* the EXECUTE check, so the test passes even if the REVOKE regressed; `code-style.md §7`). The signature-valid form is what surfaced the `FROM PUBLIC`-only insufficiency above. Partial-credit scoring was chosen (over all-or-nothing) for consistency with the exam — user decision 2026-06-21.

**Scope**: `batch_submit_quiz` recording + scoring for practice modes (`smart_review`/`quick_quiz`); MC behavior is byte-equivalent (single row/question → DISTINCT count == row count). Exam modes use their own RPCs. Deviation recorded in `.spec-workflow/specs/vfr-rt-training/tasks.md` N2.

---

### Decision 48: Study Mode (Discovery) reuses the real quiz runner with answers pre-marked (2026-06-26, reworked 2026-06-27)

> **UI label:** the feature is surfaced as **Discovery** (first/default segment of the New Quiz `ModeToggle`). Internal identifiers stay `study`: RPC `get_study_questions`, action `startStudy`, hooks `use-study-*`, components `StudyConfigForm` (reuses quiz filter UI). The inline bespoke StudyRunner/StudyFlashcard were deleted; Discovery now navigates to `/app/quiz/session` and reuses the real quiz session runner wholesale.

**Date**: 2026-06-26, reworked 2026-06-27

**Context**: Study Mode is a self-paced MC feature where students practice questions and see the correct answer on-demand, with no session and no score. This is equivalent to the immediate feedback students already get in practice-mode graders (`check_quiz_answer`), except triggered on-demand rather than after submission. The feature needs an RPC to deliver MC questions with their answer keys. **Exam-integrity caveat:** mock/internal/VFR-RT exams grade from the SAME org MC pool and the exam runner hands the client each question's `id`, so an unguarded answer-key RPC would be a mid-exam answer oracle (a student could POST their live exam's IDs and read the keys). The original framing — "no exam integrity to protect" — was wrong; that property is *enforced*, not inherent.

**Decision**: Create a dedicated `get_study_questions(p_question_ids uuid[])` SECURITY DEFINER RPC (mig 135) that returns MC questions WITH the `correct_option_id` answer key and explanation in the response payload. This is a **DELIBERATE answer-key exposure** — the student-facing surface is explicitly designed to show the answer. The RPC reads by arbitrary caller-supplied question IDs (unlike session-bound queries that read via the frozen config), so `deleted_at IS NULL` + `status='active'` filters are **REQUIRED** — a caller must not be able to surface a soft-deleted/retired question's key. Options are returned in **STORED order** (not shuffled) since the answer is already visible. **Single-active-session guard:** the RPC raises `active_exam_session` when the caller has any active (`ended_at IS NULL AND deleted_at IS NULL`) exam-mode session (`mock_exam`/`internal_exam`/`vfr_rt_exam`) — Study Mode is unavailable while a graded exam is live, enforced server-side (the UI gate is bypassable). Practice modes are excluded (they already reveal answers via `check_quiz_answer`).

**Rework (2026-06-27):** The original design (inline bespoke StudyRunner/StudyFlashcard components on the setup page) was rejected in manual evaluation. Reworked to reuse the real quiz session runner. "Start discovery" now:
1. Calls `getStudyQuestions()` to fetch MC questions with answer keys
2. Builds a sessionStorage handoff via `build-discovery-handoff` (StudyQuestion[] → answers pre-marked with `selectedOptionId = correctOptionId` + MC-typed feedback state), mirroring the `use-quiz-start` pattern
3. Navigates to `/app/quiz/session` — the exact existing quiz runner, reused wholesale
4. Runner receives an ephemeral `mode: 'discovery'` session — no grading, no checkpoint persistence, header "Finish" button becomes "Exit", FinishQuizDialog returns null (no results to show). **(Amended by #1011, 2026-06-29 — see amendment below: the discovery sessionId is now a real `quiz_sessions` DB row, not a client-generated UUID.)**
5. Explanation stays behind its existing tab; correct option is green (pre-marked review state)

Ephemeral sessions are verified at the handoff validator boundary (accepts `mode: 'discovery'`) but the localStorage active-session firewall rejects persisted discovery rows (same as practice modes). Defense in depth: the persisted `ActiveSession` shape is typed resumable-only (`ResumableSessionMode = study | exam`, with `buildActiveSession` coercing the never-reached discovery→undefined), so discovery is not even representable in the stored payload — while the broad `SessionMode = QuizMode` (which `isDiscovery`, derived locally in `quiz-session.tsx`, keys off) still carries `discovery` for the runner + the sessionStorage handoff. ~~No new DB constraints or migrations beyond mig 135.~~ **Superseded by the #1011 amendment below** — Discovery became a real `mode='discovery'` `quiz_sessions` row, adding migs 136–142 (the mode CHECK widening + `uq_one_active_session_per_student` index, mig 136; `start_discovery_session`, mig 137; the per-start-RPC `another_session_active` guards, migs 138–141; the `get_study_questions` `discovery` whitelist, mig 142). See the Amendment paragraph.

**Amendment (#1011, 2026-06-29):** Discovery is no longer fully ephemeral. To enforce the single-active-session invariant (Decision 49) — which closes the answer-key oracle of running Discovery concurrently with a graded exam on the shared MC pool — `startStudy` now creates a **real ephemeral `mode='discovery'` `quiz_sessions` row** via the new `start_discovery_session(p_subject_id, p_question_ids)` RPC (mig 137), instead of a client-generated `crypto.randomUUID` sessionId. The row stays **non-resumable** (the localStorage firewall in `quiz-session-storage.ts` still rejects `discovery`, and `get_study_questions` mig 142 whitelists `discovery` so the session does not block its own key reads) and **nothing-scored** (it writes no `student_responses` / `quiz_session_answers`). It is torn down by the new `endDiscovery` Server Action (owner-scoped soft-delete) on Exit, or auto-soft-deleted by the next start RPC. Original 2026-06-27 framing ("no `quiz_sessions` DB row", "nothing persisted") is superseded for the session row; the no-grade / non-resumable properties are unchanged.

**Rationale**: Study Mode is educational feedback, not a data leak. The privilege-layer REVOKE (`SELECT correct_option_id` denied to `authenticated`) still prevents accidental client-side exposure via direct PostgREST reads (42501). The RPC is the *intended* path for answer keys in this context. Exam-integrity is preserved by the active-exam-session guard (above), which mirrors `check_quiz_answer`'s practice-only rejection — so the keys can never be read while a graded exam is in progress.

**Scope**: MC questions only; Study Mode reads questions by arbitrary p_question_ids (not immutable frozen config), so the §15 carve-out does not apply. Guard set mirrors `get_quiz_questions` + `get_report_answer_keys` per security.md rules 1, 7, 9, 11/12 / #883, plus the active-exam-session guard above. Red-team coverage: Vector EO (EO1–EO6; EO6 = mid-exam oracle).

**Honest MC selection**: `get_random_question_ids` + `_filtered_question_pool` + `get_filtered_question_counts` gained an optional `p_question_type` (migs 134 + 157, DEFAULT NULL = unrestricted for existing quiz/exam callers); Study Mode passes `'multiple_choice'` to all three, so both the fetched set AND the pre-start *count display* (slider max) are MC-only on mixed-type subjects — structurally guaranteeing count == quiz. Delivered by **#1008** (closed **#1003**).

---

### Decision 49: At most one active quiz_sessions row per account, across all modes (2026-06-29)

**Date**: 2026-06-29

**Context** (#1011): Discovery and practice surfaces deliberately reveal answer keys (`get_study_questions` mig 135, `check_quiz_answer` mig 117). Exams grade from the SAME org MC pool, and the exam runner hands the client each question's `id`. The per-RPC mid-exam guards already deny answer reveal *while an exam is active* (`get_study_questions` raises `active_exam_session`; `check_quiz_answer` raises while an exam session exists), but the cleanest structural defense is to make answer-revealing and graded sessions **unable to coexist at all**: a student may hold at most ONE active (`ended_at IS NULL AND deleted_at IS NULL`) session across every mode.

**Decision**: Enforce the single-active-session invariant at three layers:
1. **Schema backstop** — global partial unique index `uq_one_active_session_per_student (student_id) WHERE ended_at IS NULL AND deleted_at IS NULL` (mig 136). Subsumes the three per-mode partial indexes (left in place so per-RPC `unique_violation` handlers keep their friendly messages). The `quiz_sessions` mode CHECK is widened to add `'discovery'`, and a one-time dedup soft-deletes any pre-existing multi-active rows (keeping the highest-priority/newest, exams never sacrificed) so the index can build.
2. **Per-start-RPC guard** — each start RPC (`start_exam_session` mig 138, `start_internal_exam_session` mig 139, `start_vfr_rt_exam_session` mig 140, `start_quiz_session` mig 141, and `start_discovery_session` mig 137) first soft-deletes the caller's own abandoned `discovery` row, then `RAISE EXCEPTION 'another_session_active'` if any *other*-mode active session exists. All five start Server Actions map the token to a sanitized message.
3. **Discovery as a real row + recovery** — Discovery becomes a real ephemeral `mode='discovery'` session (Decision 48 amendment) so it participates in the invariant; the `endDiscovery` action tears it down on Exit; and `getActivePracticeSession` + the `ActivePracticeBanner` give a server-backed Discard for an abandoned practice session (previously detectable only via localStorage; exams already had server-backed resume banners).

**Behavior change**: a student can no longer run a practice/Discovery quiz and an exam simultaneously — starting either while the other is active raises `another_session_active`. This is the structural complement to the mid-exam answer-reveal guards.

**Scope**: `quiz_sessions` (all modes). Security cross-ref: `docs/security.md` answer-exposure rules + the new single-active-session rule. Red-team note: starting a second concurrent session is now denied by the index + per-RPC guard.

**Amendment (#1085, 2026-07-03):** Saved practice drafts are parked state with no active session. App-layer save/resume implements Decision 49 for drafts:
- **Save** — `saveDraft` Server Action soft-deletes the underlying practice `quiz_sessions` row after the draft is persisted (via `closePracticeSessionForDraft`, best-effort, scoped to `mode IN ('quick_quiz', 'smart_review')` so graded exams cannot be accidentally abandoned).
- **Resume** — `resumeQuizSession` Server Action mints a FRESH practice session via `start_quiz_session(p_mode, p_subject_id, p_topic_id, p_question_ids)` with the draft's exact questions, reads mode/subject/topic from the (now soft-deleted) original session row, auto-heals legacy pre-fix drafts by closing their stale sessions, and repoints the draft's `session_config.sessionId` to the new session. The draft is left intact and navigation occurs only on success.

This prevents orphaned practice sessions from blocking new quiz starts (prior bug: save → session left open → next quiz start tripped `another_session_active` guard → student blocked). Exam-mode guarding remains unchanged: `resumeQuizSession` rejects non-practice modes with a distinct error. One-time cleanup `cleanup-orphaned-draft-sessions.ts` clears the pre-fix backlog.

---

### Decision 50: dnd-kit for drag-and-drop question types (`ordering`, `diagram_label`) (2026-06-25)

**Date**: 2026-06-25

**Context**: VFR RT Training Part 3 (Phases 5–6) introduces two drag-and-drop question types — `ordering` (sequence phraseology steps: MAYDAY call, position-report) and `diagram_label` (map zones → labels). The quiz Study runner reused for VFR RT has no drag primitive; React's native HTML5 drag-and-drop is unreliable on iOS Safari / iPad, the primary device for the EASA exam cohort.

**Decision**: Adopt **`@dnd-kit`** (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`) in `apps/web` for these types. Configure the `DndContext` sensors as `[PointerSensor, TouchSensor({ activationConstraint: { delay: 250, tolerance: 5 } }), KeyboardSensor]` — `PointerSensor` alone fails to start a drag on iOS Safari (spec note N8); the `TouchSensor` delay distinguishes a drag from a scroll, and `KeyboardSensor` keeps the interaction accessible. The drag UI is isolated in the per-type input/report sub-components (`OrderingInput`/`OrderingReport`, later `DiagramLabel*`) — no other surface depends on dnd-kit.

**Rationale**: dnd-kit is the de-facto accessible, touch-capable React DnD library (keyboard + pointer + touch sensors, no HTML5 DnD quirks), actively maintained, and tree-shakeable. The sensor config is the load-bearing choice for the iPad target — verify drag-start on a real iPad at the manual-eval checkpoint.

**Scope**: `apps/web` only; first use is `OrderingInput` (Phase 5). `pnpm check-types --force` confirmed clean after the bump (the Sentry/vite peer warning is pre-existing, unrelated).

---


---

### Decision 51: `ordering` question type stores PER-SLOT answer rows (deviates from spec N7's single-JSON-row) (2026-06-25)

**Date**: 2026-06-25

**Context**: VFR RT Training Phase 5 adds the `ordering` type — a shuffled list the student drags into the canonical sequence (MAYDAY call, position-report). The canonical order is the array order of a new REVOKE-gated `questions.ordering_items JSONB` (`[{id,text}...]`); `get_quiz_questions` delivers it shuffled (mig 145). Two binding-but-conflicting spec notes: **N7** said ordering stores ONE JSON row per question (not per-element rows); the **Phase-4 scoring callout** (Decision 47 extended) requires **partial credit** (items in correct position / N) in the session score. The score is rolled up in `batch_submit_quiz` by `count(correct rows) / total_blanks` per question — a single binary `is_correct` row CANNOT express a fraction, so single-row storage cannot yield partial credit through that rollup.

**Decision**: Store `ordering` as **per-slot rows — exactly like `dialog_fill`**: one `quiz_session_answers` row per sequence slot (`blank_index` = slot, `response_text` = the item text the student placed there, `is_correct` per slot, `selected_option_id` NULL). This reuses the ENTIRE proven dialog_fill pipeline — the DISTINCT-question partial-credit rollup (only its `total_blanks` CASE gains `WHEN ordering THEN jsonb_array_length(ordering_items)`, mig 148), the report builder, `get_report_answer_keys` (mig 149), pagination — adding the least new code in the highest-risk (SECURITY DEFINER scoring) surface. The mig-131 blank_index⇔dialog_fill write-invariant trigger was widened to `question_type IN ('dialog_fill','ordering')` (mig 144) to admit ordering's non-null blank_index. The new internal helper `_grade_record_ordering` (mig 147) follows the Decision-47 model: SECURITY DEFINER + `REVOKE EXECUTE FROM PUBLIC, anon, authenticated`, with the dispatcher as the single authz boundary. Immediate feedback (`check_non_mc_answer` + `p_order`, mig 146) returns binary correctness + the revealed canonical order (practice-mode whitelist unchanged).

**Rationale**: This is a **documented deviation from N7**. N7's single-row storage actively makes BOTH scoring (needs a fraction the row can't carry) and the report (needs an id→text map the single row doesn't provide) harder; per-slot rows make both trivial by reuse. The user's partial-credit decision (2026-06-24, more recent + more user-facing) outranks the implementation note. No data cost: no live RT data on prod (the page is dormant until RT import), so the storage shape can still change cheaply if the user objects at the manual-eval gate. Validated against two Opus plan-critic rounds (security/scoring + contract lenses) which ratified the deviation as sound; the mig-131 trigger blocker was caught there and fixed (mig 144).

**Scope**: practice modes (`smart_review`/`quick_quiz`) on `/app/vfr-rt`; first of the two Part-3 drag types (`diagram_label` follows in Phase 6 and will reuse this per-slot model). Deviation recorded in `.spec-workflow/specs/vfr-rt-training/tasks.md` Phase 5.

---

### Decision 52: `diagram_label` question type — inline SVG registry + distractor labels + per-zone answer rows (2026-07-02)

**Date**: 2026-07-02

**Context**: VFR RT Training Phase 6 adds the second Part-3 drag type — `diagram_label`, a runway traffic-pattern diagram where the student drags text labels onto drop zones (e.g. the RWY 27/09 left-hand circuit: 5 legs + 4 turns). Four design questions needed resolving before the migration set: how the diagram artwork is delivered, whether the label pool must exactly match the zone count, how many zones the first seed fixture covers, and how general the storage schema should be.

**Decision (user-confirmed 2026-07-02):**
1. **`image_ref` is a logical key into an in-code SVG component registry, NOT a static image asset.** The diagram is rendered as inline SVG artwork (`_components/diagrams/rwy-2709-lh-pattern.tsx`, resolved via `_components/diagrams/registry.ts`); drop zones are `%`-fraction overlays (`{x,y,w,h}` in `[0,1]`, responsive/iPad-safe) positioned on top of the SVG, not baked into a bitmap.
2. **The label pool includes distractors.** `labels.length` MAY exceed `zones.length`; every zone is covered exactly once by the canonical `answer` array, but unused labels are expected and left in the pool after submission — `is_valid_diagram_config()` (mig 150) does not require every label to appear in `answer`.
3. **The first seed fixture uses 9 zones** — 5 legs (upwind/crosswind/downwind/base/final) + 4 turns (crosswind-turn/downwind-turn/base-turn/final-turn) for the RWY 27/09 left-hand traffic pattern, plus ~2-3 distractor labels.
4. **`diagram_config`'s schema is kept fully general** (arbitrary zone/label counts and coordinates); only the seed data is specific to the 27/09 pattern — a future diagram (different runway, different chart type) needs no schema change, only a new fixture + registry entry.

Storage follows the same per-zone-row model Decision 51 already reused from `dialog_fill`: one `quiz_session_answers` row per zone (`blank_index` = the zone's 0-based ordinal position within `diagram_config.zones`, derived **server-side** by `_grade_record_diagram_label`, mig 154 — the single ordinal authority also used by `get_report_answer_keys`, mig 156 — never client-supplied), `response_text` = the placed label's display text, `selected_option_id` NULL. This reuses the DISTINCT-question partial-credit rollup (`batch_submit_quiz`'s `total_blanks` CASE gains `WHEN diagram_label THEN greatest(jsonb_array_length(diagram_config->'zones'), 1)`, mig 155), the report pipeline, and pagination — the same reuse rationale as Decision 51.

**Self-defence deviates from `ordering` (INVERTED, deliberate):** `ordering` requires a complete permutation (`count(*) = N AND count(DISTINCT selected_option) = N`) because a partial ordering submission is meaningless. `diagram_label` explicitly allows **partial submission** (unanswered zones score like a skipped MC question) and **unused distractor labels** (design decision 2 above), so cardinality cannot be the integrity check. Instead `batch_submit_quiz` (mig 155) verifies: every submitted zone_id references a real zone, no zone_id is submitted twice, and no label_id is submitted twice (a chip cannot occupy two zones at once — "consume on place"). A submitted label_id that doesn't reference a real label is rejected downstream by the per-zone grader (mig 154), which `RAISE`s and aborts the whole batch.

**Security invariant (seed-enforced, not DB-enforced):** zone ids and label ids must use unrelated random id schemes. If zone and label ids shared a naming pattern, the zone_id/label_id pairing visible in the answer-stripped delivery payload (`get_quiz_questions`, mig 152) could leak the answer via correlation even with `diagram_config.answer` omitted. The seed script asserts id-scheme disjointness at seed time.

**Rationale**: Inline SVG (not a static PNG) keeps zone coordinates and diagram artwork co-versioned in code, avoids an image-upload/CDN dependency for a small fixed set of training diagrams, and lets zone overlays scale responsively with the SVG viewBox instead of pixel-anchoring to a raster image. Distractors make the exercise harder to game by elimination, mirroring real EASA-style pattern-recognition drills. Reusing the per-slot/per-zone row model (rather than inventing a third storage shape) keeps the third drag-type addition low-risk in the same SECURITY DEFINER surface that Decision 51 already validated through two Opus plan-critic rounds.

**Scope**: practice modes (`smart_review`/`quick_quiz`) on `/app/vfr-rt`; third of the app's non-MC question types, second of the two Part-3 drag types. Migrations 150–156 (dual-authored `packages/db/migrations/` ≡ `supabase/migrations/`, byte-identical). No live RT diagram_label data on prod prior to this change (the page is dormant until RT content import), so the schema can still change cheaply if the user objects at the manual-eval gate.

> **Annotation 2026-07-11:** the dual-authoring convention referenced above is retired — `packages/db/migrations/` was frozen 2026-07-11 and `supabase/migrations/` is the sole source of truth (the only dir CI tests and `db-deploy.yml` deploys). The historical decision text above is unchanged.

---

### Decision 53: `tenant_isolation` is `FOR SELECT` on any table that also has role-gated write policies (2026-08-09)

**Date**: 2026-08-09

**Context**: `docs/security.md` §3 prescribes a `tenant_isolation` policy template with no `FOR` clause — which in Postgres means `FOR ALL`, governing SELECT, INSERT, UPDATE and DELETE. `public.questions` received that template in `20260311000001_initial_schema.sql:329` and later gained role-gated write policies (`admin_insert_questions` / `admin_update_questions`, `20260324000052`, org-scoped in `20260324000054`). Postgres ORs permissive policies together, so a write on `questions` passes if *either* policy allows it; the unqualified tenant policy requires only same-org + `deleted_at IS NULL`, so the `is_admin()` gate did not in fact bind. `20260324000054`'s own header reasons about permissive-OR semantics for cross-org scoping but did not account for the same mechanism dissolving the role gate.

**Decision (user-confirmed 2026-08-09):**
1. **`tenant_isolation` on `questions` is re-emitted as `FOR SELECT`** (`20260809000100_questions_tenant_isolation_select_only.sql`) with a byte-identical `USING` predicate. `WITH CHECK` is dropped because a `FOR SELECT` policy cannot carry one; nothing depended on it.
2. **The prescriptive rule generalises:** on any table that also has role-gated write policies, `tenant_isolation` must be `FOR SELECT`, leaving the role-gated policies as the only write path. Mirrored into `docs/security.md` §3, `.claude/rules/security.md` rule 2, and the `.coderabbit.yaml` `supabase/migrations/**` block, each of which previously read "policies need BOTH `USING` and `WITH CHECK`" without the carve-out. *(Superseded 2026-08-20 by Decision 59: the rule is TWO independent grounds — role-gated writes, OR no intended user-scoped write path — not the single role-gated case stated here.)*
3. **`questions` DELETE is left with no permissive policy**, so hard DELETE is blocked at the RLS layer. That is intended and matches security rule 6 (never hard DELETE; always `UPDATE SET deleted_at`); no production path hard-deletes a question.
4. **Sibling tables are out of scope — and are a separate open item, not a clean bill of health.** `organizations`, `question_banks`, `courses` and `lessons` carry `tenant_isolation` in the same unqualified (`FOR ALL`) form — the shape is what is shared, not the predicate (`organizations` keys on `id` with no `deleted_at` conjunct). This carve-out does not apply to them only because they have no role-gated write policy for it to override — which is a narrower statement than "they are fine", and they should not be treated as reviewed-and-safe on the strength of it. Deliberately not addressed in this migration: it needs its own change and its own verification. Tracked privately in `GHSA-hjp9-x868-7wgw` (security rule 12, sibling parity). *(Superseded 2026-08-20 by Decision 59: all four were narrowed in mig `20260820000100`; they are no longer `FOR ALL` and no longer an open item. Read the present tense below as of 2026-08-09.)*

**Rationale**: The `FOR SELECT` narrowing is the minimal change that makes the existing `is_admin()` policies authoritative — it adds no new policy and alters no predicate. The `USING` clause is reproduced verbatim because six SECURITY INVOKER functions (`_filtered_question_pool`, `get_random_question_ids`, `get_filtered_question_counts`, `get_question_counts`, `get_student_mastery_stats`, `get_student_last_practiced`) depend on this policy for their org and `deleted_at` scoping, and the policy is left with no `TO` clause (PUBLIC, as the original was) so `anon` stays on the same default-deny path the unauthenticated red-team specs assert. Admin authoring is unaffected: all four user-scoped write paths (`insert-question.ts`, `upsert-question.ts`, `bulk-update-status.ts`, `bulk-update-calculations.ts`) run behind `requireAdmin()`, whose predicate matches `is_admin()` (role = 'admin' AND `deleted_at IS NULL`). Instructors lose question-write access, which is the intended tightening — all authoring UI is admin-gated, so no instructor path exists. Fixing the doc template alongside the migration is the load-bearing half: the template is what propagated the shape in the first place, and `question_banks` / `courses` / `lessons` would acquire the same defect the day either gains a role-gated write policy.

**Scope**: `public.questions` only (migration `20260809000100`); plus the rule mirrors in `docs/security.md`, `.claude/rules/security.md`, `.coderabbit.yaml` and the generic examples in `docs/database.md` §3. No application code changes — `soft-delete-question.ts` keeps its service-role client (#1166), whose blocker is the `RETURNING` row failing the SELECT policy's `deleted_at IS NULL` qualifier, not the write grant.

---

### Decision 54: VFR RT content lives in the org's existing question bank; the licence/course model stays deferred (2026-08-11)

**Date**: 2026-08-11

**Context**: Importing VFR RT Part 1 content required resolving a `question_banks` row. `question_banks` carries `UNIQUE (organization_id)` (mig `20260327000062`), so the target org's single bank is the PPL one (`EASA PPL(A) QDB`). The question raised was whether to drop that constraint and give VFR RT — and later ATPL and IR — its own bank.

**Decision (user-confirmed 2026-08-11):** No schema change. RT questions go into the org's existing bank, and the 1:1 org↔bank invariant stays. The course/enrolment model is deferred until ATPL or IR is real content, not built speculatively.

**Rationale**:

1. **A second bank would separate nothing.** `bank_id` is vestigial: `question_banks` appears in **zero** SECURITY DEFINER function bodies, and no RPC anywhere filters on it. Student-facing content selection narrows by `organization_id` (RLS) + `subject_id` (+ `topic_id`/`question_type`) — verified against the latest definitions of `_filtered_question_pool`, `get_quiz_questions`, `get_study_questions`, `start_discovery_session`, `start_exam_session` and `start_vfr_rt_exam_session`. Two banks sharing a subject would pool together in every quiz, exam sample, discovery set and count, with no query able to tell them apart.
2. **Making bank a real boundary is expensive and touches a flagged surface.** It would mean threading a bank parameter through ~13 RPCs and adding a bank conjunct to the `questions` RLS predicate — the exact change mig `20260809000100` warns against, since six SECURITY INVOKER functions depend on that predicate byte-for-byte (Decision 53).
3. **It would not answer the actual ATPL/IR question anyway.** What breaks on a second licence is not the bank constraint: `easa_subjects` is a GLOBAL table (no `organization_id`) with `code` UNIQUE, so ATPL Air Law cannot coexist with PPL Air Law under code `010`; and there is no enrolment concept at all (`users` has no course/licence column). A bank solves neither, and would end up needing `users.bank_id` — i.e. a badly-named course table.
4. **RT already has the separation it needs.** It is its own global subject (`code = 'RT'`, mig `20260610000600`), so content isolation works today with no schema change.

**What was deferred**: the course/enrolment refactor already sketched in `.spec-workflow/specs/vfr-rt-slovenia-mock-exam/tasks.md` ("Out of scope for v1 … Recorded for v2") — `courses.course_code` + `jurisdiction`, a course↔subject link, and `users.course_id`. The `courses` table exists from mig `20260311000001` with `organization_id`, soft-delete and a working `tenant_isolation` policy, and has **zero** call sites in app code, so it is a clean starting point when ATPL/IR content is real. `courses.jurisdiction` was reserved for the Slovenia/France/UK RT variants.

**Consequence accepted**: RT shares a bank with the org's 2151 PPL questions, so the importer's `bank_id + question_number` idempotency key now spans the whole org rather than an RT-only bank. The `VRT-P1-ACR-*` prefix keeps collisions implausible, and the importer validates `num` uniqueness across all loaded files before writing.

---

### Decision 55: Part 2 blanks are pinned by the DIALOGUE, never by a scene line (2026-08-15)

**Context**: The VictorOne Part 2 task sheet shows nothing above the exchange, so the scene prompt
was removed from the student view (`quiz-main-panel.tsx` skips `QuestionCard` for `dialog_fill`;
`question_text` still carries the scene for the admin list). That exposed a defect the prompt had
been hiding: a `recall` blank that OPENS an exchange has no controller line above it, so nothing on
screen pins which phrase is wanted. Five questions were rejected on eval one after another.

**Decision**: A blank must be answerable from the dialogue alone. Where it is not, **add
transmissions until it is** — do not add a scene line, and do not delete the question. Testing a
basic phrase is legitimate; the briefing lists it as Part 2's FIRST competency ("radio check,
request departure information, traffic in sight, looking out"). Enforced as authoring rule **R7**
in `apps/web/scripts/dialog-fill-content.ts`: a recall blank needs an `[atc]` line above it — ignoring blank
separator lines, which `apps/web/app/app/quiz/session/_utils/parse-dialog-display.ts` filters out before rendering, so the anchor is
directly above ON SCREEN even when the template array separates them — or an `unanchored`
declaration. What the VALIDATOR enforces is the anchor scan and that `unanchored` is a non-empty
string; the requirement that the declaration NAME the competing phrase and show what visible text
excludes it is an authoring obligation carried by review, not by the gate — no check can decide
whether a sentence excludes a phrase. Do not read a passing gate as evidence an unanchored blank
was justified. (The anchor scan originally read exactly `lines[i - 1]` and so rejected an anchor a
blank line had pushed up; #1198.)

**Consequence accepted**: Three transcripts now carry transmissions the guide's compressed examples
omit (DLG-01, 34, 35), disclosed in the content file's `source` block — constructed transcripts
four → seven. Adding a correct, standard transmission and disclosing it is distinct from asserting
the guide contains something it does not, which stays forbidden. DLG-21 and DLG-22 were dropped as
single-line tasks with no exchange to reason from; pool 52 → 50.

---

### Decision 56: grading tolerates spelling slips, never digits (2026-08-15, migs 158–160)

**Context**: Grading compared normalized strings for exact equality, so `crossing of airfiled
approved` scored zero against `crossing of airfield approved`. A student who knows the phrase should
not lose the mark to a keystroke.

**Decision**: New `public.answer_matches(text, text)` (mig 158) replaces the equality test in all
four text graders. It normalizes **both** arguments itself (`normalize_answer` is idempotent), so
neither side has a pre-normalization precondition. Bounded spelling tolerance — Levenshtein ≤1 for
candidate words of 5+ characters (the floor reads the candidate, so a shorter student token can
still match a longer candidate), single adjacent transposition counted as one edit,
whole-answer budget 2 (at most two single-edit words). There is deliberately no wider tier for long
words: 2 edits at length ≥8 is exactly prefix negation (`serviceable`/`unserviceable`,
`northbound`/`southbound`, `increase`/`decrease`), which is live ICAO phraseology, not a typo.
**Any token containing a digit must match exactly.** See `docs/database.md` for the full rule and
the measurements behind each threshold.

**Consequence accepted**: All four graders changed together (sibling-parity), so a typo cannot score
in practice and fail in the exam. The change ships as **three** migrations (158 helper +
`_grade_record_short_answer`/`_grade_record_dialog_fill`, 159 `check_non_mc_answer`, 160
`submit_vfr_rt_exam_answers`) purely to stay inside the `code-style.md` §1 size caps; they must be
applied as a set, since a partial application is exactly the practice/exam split this decision
forbids. Validated by replaying 23 closed-book eval failures through the new
matcher: zero flipped to correct. Adds a `fuzzystrmatch` dependency. Separately, verb-form tolerance
was widened in content (`lining up` and `line up` both score) after finding the corpus already
inconsistent; 42 plain-form synonyms were added to close the drift. (An earlier "4 of 18 … 13 did not" is withdrawn — it does not partition and was not reproducible.)


### Decision 57: the authoring gate R3 stays EXACT-match while the grader is typo-tolerant (2026-08-18)

**Context**: Decision 56 made the DB graders typo-tolerant via `public.answer_matches` (mig 158).
The Part 2 authoring gate rule R3 (`anyLineContainsWordRun`/`containsWordRun` in
`apps/web/scripts/dialog-fill-content.ts`) rejects a `recall` blank whose canonical appears
verbatim as a word-run within a single transmission of the visible dialogue —
the point being that a student could read the answer off the screen instead of recalling it. R3 is
still an exact per-word comparison, so it is now **looser than the thing it protects**: a canonical
one typo away from visible text passes R3 while `answer_matches` would score it correct, i.e. it is
readable off-screen and still credited. Raised as #1194.

**Decision**: Keep R3 exact. Do NOT port the `answer_matches` tolerance into TypeScript.

**Why**, in order of weight:
1. **No live signal.** A typo-tolerant `containsWordRun` simulated at the final (1-edit) tier over
   every `shape: 'recall'` blank in the shipped 50-question corpus newly fails **zero** canonicals.
   Measured twice, independently: once by plan-critic on `chore/proportionate-review-gates`, and
   again by a from-scratch reimplementation of the `answer_matches` tiers during #1194's triage.
2. **It would contradict an instruction the same branch wrote.** `apps/web/lib/grading/normalize-answer.ts`
   states that the comparison lives in `public.answer_matches` and that matching must NOT be
   reimplemented in TypeScript — that copy exists for the authoring gate alone. Porting is a
   deliberate reversal of a documented decision, not a patch to an oversight.
3. **It would create a second untested SQL↔TS parity contract.** Doing it properly means porting
   the per-word threshold, the adjacent-swap reduction, the digit-exactness rule and the
   whole-answer budget, then pinning all four to the SQL with a parity test — a second thing that
   can silently drift, guarding a hazard with no instances.

**Scope note**: the same commit that recorded this decision also scoped R3 to ONE transmission
(#1198) — previously the comparison ran over the whole template flattened, so a canonical whose
words straddled two transmissions was falsely rejected even though neither line printed it. That
narrows what R3 rejects but does not disturb the argument above: the tolerant-R3 simulation
returns zero newly-failing canonicals on BOTH bases — the current per-line one and the old
flattened one. (No count is given here on purpose: the two independent runs are the ones
enumerated in point 1, and re-running the same simulation on a second basis is not a third
independent measurement.)

**Consequence accepted**: the gap is real and stays open — a canonical within the edit budget of
visible text passes R3 today. It is bounded by the corpus being small and hand-reviewed, and it
widens as Parts 2/3 grow. The trigger to revisit is the first canonical that actually lands in the
gap: re-run the simulation when the Part 2 pool grows materially, and reopen #1194 if the count
stops being zero. Recorded rather than silently left divergent, which is what #1194 asked for.


### Decision 58: post-commit proportionality — drop count-chasing; no no-executable-change oracle (2026-08-19)

**Context.** Issue #1222: *"are we nitpicking or actually solving something? are we using the full circus for 3 lines?"* and *"circus for md files, counts — is nonsense."* Two remedies were considered.

**DROP the repeated-numeric-literal sub-rules** in `.claude/rules/agent-doc-updater.md`. doc-updater no longer chases a stale count literal across `.spec-workflow/steering/tech.md` ×3, `docs/decisions.md` or `docs/plan.md`. A stale count in a steering doc misleads nobody who can run `ls`, and chasing one has cost real review rounds and fixup commits. **Accepted consequence:** those literals will drift and stay drifted; a stale count is no longer a DRIFT finding. The drop is enforced on both reviewers, not just the local one: `.coderabbit.yaml`'s comment-accuracy block now flags only counts that are INTERNALLY inconsistent (an "N + M" that no longer sums, a count contradicting a list in the same block) and explicitly does not flag a standalone inventory count for having drifted. Silencing doc-updater while cloud CodeRabbit kept raising the same nit would have moved the cost to the more expensive reviewer rather than removing it.

**Do NOT add a no-executable-change post-commit exemption.** A working oracle was built (TypeScript-parser based, 44 tests, 100% of tracked files parseable) and then **reverted**, because it was finally measured rather than assumed: across the last 300 commits on master it would have fired **once** — 0.33%. Of those 300, **204 touched at least one `.md` file** but only **37 were `.md`-only**, and just **17** of those qualify for the docs-only exemption, which is narrower than `.md`-only — it excludes `docs/security.md`, `CLAUDE.md`, and every `.md` outside `docs/`, root, `.claude/agent-memory/` and the run log (measured 2026-08-19 against `origin/master`; re-derive with `git log origin/master -300 --format=%H` and classify each commit by whether EVERY path ends in `.md`). So the exemption covers under half the `.md`-only class, not all of it. 230 of the 300 contained at least one path the oracle could not classify — that figure is the reverted oracle's own classifier output and is no longer reproducible, the implementation having never been committed; it is recorded as history, not as a re-derivable measurement. **The 204 was twice mislabelled here as the `.md`-only count** — first by the original entry, then by a "fix" that derived a further figure from it and stamped it "measured"; re-derived by counting per commit whether EVERY path ends in `.md`. (The first draft of this decision said "230 `.md`-only", conflating the two; re-derived.) When it did fire it skipped only test-writer and the learner (code-reviewer, doc-updater and semantic-reviewer still run), so the feature was worth roughly 0.1% of review effort. It also still carried an open defect: a pre-order AST walk without a close delimiter is not injective, so ordinary refactors — moving a statement into a block, moving an argument into a nested call — fingerprinted as unchanged.

**The lesson, recorded because it cost most of a day.** The firing-frequency check is one command and it was run LAST. Run it FIRST for any mechanism whose purpose is to skip work: if the class it targets is rare, no amount of correctness makes the mechanism worth its maintenance. Nine false-EXEMPT vectors were found and fixed by three reviewers across four rounds before anyone asked how often the thing would fire. Rigour applied to the wrong target is still waste.

**Surviving from #1222:** the round bound on comment-accuracy **refinements**, in `.claude/rules/agent-critic.md` — a finding that the prose states something FALSE is never bounded, whatever round it lands on. That is about the FINDING, which stays actionable and still needs a terminal disposition; what `CLAUDE.md` caps at three commits is the follow-up CHAIN, after which the residue is escalated rather than committed. The two are not in tension. That part of the complaint is real and is addressed separately.

### Decision 59: every `tenant_isolation` policy is `FOR SELECT` — two independent grounds (2026-08-20)

**Date**: 2026-08-20

**Context**: `CREATE POLICY` without a `FOR` clause is `FOR ALL`. Six tables were created that way
in `20260311000001_initial_schema.sql`. Decision 53 closed `questions`; `users` had been closed
earlier (`20260311000004`, `20260312000012`). The remaining four — `organizations`,
`question_banks`, `courses`, `lessons` — were left open and tracked privately in
`GHSA-hjp9-x868-7wgw` §2.

**Measured on production 2026-08-20, before the change** (read-only Management API probe; possible
only because the dead access token was rotated the same day, #1183): `pg_policies` returned exactly
one `FOR ALL` policy per table and no others, and `information_schema.role_table_grants` showed
`authenticated` holding INSERT, UPDATE and DELETE on all four. RLS was the only gate. Decision 53
derived that grant premise from the migration tree because prod could not be reached; it is now
confirmed by observation rather than inference.

**Decision (user-approved 2026-08-20):**

1. **All four are re-emitted as `FOR SELECT`** with byte-identical `USING` predicates in
   `20260820000100_tenant_isolation_select_only_four_tables.sql`. `WITH CHECK` is dropped because a
   `FOR SELECT` policy cannot carry one. INSERT/UPDATE/DELETE are left with no permissive policy,
   so they are denied by default, matching rule 6.
2. **The prescriptive rule generalises — this supersedes Decision 53 point 2.** `tenant_isolation`
   must be `FOR SELECT` on either of two INDEPENDENT grounds, and the first is not a precondition
   for the second: **(a)** the table also has role-gated write policies, so the OR-ed `FOR ALL`
   dissolves the role gate; **(b)** the table has no intended user-scoped write path, so the
   unqualified policy *is* the entire access control. Stating this as a single "carve-out for
   role-gated tables" was actively harmful: it would have made six enforcer files, including the
   blocking pre-push `security-auditor`, assert a precondition that is false for these four.
3. **Invariant, stated separately from both grounds:** no table in `public` carries an unqualified
   `tenant_isolation` policy. A new one is a defect on sight. `docs/security.md`'s template now
   leads with the `FOR SELECT` form and demotes `FOR ALL` to a commented-out, justify-first
   exception — that template is what propagated the shape in the first place.
4. **This supersedes Decision 53 point 4**, which recorded the four as "a separate open item, not a
   clean bill of health". They are closed. GHSA-hjp9-x868-7wgw §2 is closed with them; the advisory
   as a whole can be published or closed once this deploys.
5. **No role-gated write policies are added.** No admin UI writes these tables; all writes are
   service-role. The deliberate consequence, pinned as a tested contract rather than left as prose:
   an authenticated **admin** is denied too, because `requireAdmin()` returns an RLS-bound client
   and there is no `is_admin()` policy to fall back on. A future user-scoped write path must add
   its own role-gated policy — and re-carry `AND deleted_at IS NULL` in its `WITH CHECK`, since the
   dropped clause was what blocked user-scoped soft-delete UPDATEs on three of the four.
6. **`organizations`' predicate asymmetry is preserved, SKIPPED with reason.** It keys on `id` with
   no `deleted_at` conjunct. Byte-identity is #1175's acceptance criterion and adding the filter
   would be a read-behaviour change. As of 2026-08-20 it is therefore the only table carrying a
   `tenant_isolation` policy whose predicate has no soft-delete filter — it already was — so a
   SECURITY INVOKER reader must filter explicitly, as `lib/queries/profile.ts` already does. That
   set is open: any migration adding or replacing a policy can change it. It is
   not the only org-scoped table whose sole SELECT policy lacks one: `internal_exam_codes` is the
   same shape. `docs/database.md` §3 carries the query that derives the current set.

**Rationale**: the exposure was real but narrower than "any write". Measured per verb: UPDATE was
reachable on all four (including `UPDATE organizations SET deleted_at = now()`, since that table's
`WITH CHECK` keys on `id` alone — tenant-root tampering, though only one production read gates on
that column and it degrades gracefully); INSERT was reachable on `courses`, `lessons`, and on
`question_banks` in an org that had no bank yet, `UNIQUE (organization_id)` being **per org** — it
was rejected by a constraint only on `organizations` (a PK collision) and on a second bank in an org
that already had one; hard DELETE was reachable on `lessons`, childless `courses` and childless
`question_banks`.
Recording it at that resolution matters because the regression spec's arms are derived from it — a
cell where a constraint rejects first cannot prove the gate closed, only that its error code
changed.

**Scope**: `organizations`, `question_banks`, `courses`, `lessons` (migration `20260820000100`);
red-team Vector FJ (`apps/web/e2e/redteam/tenant-tables-direct-write.spec.ts`); and the rule mirrors
in `docs/security.md` §3, `docs/database.md` §3/§7, `.claude/rules/security.md` rule 2,
`.coderabbit.yaml`, `.claude/agents/security-auditor.md`, `.claude/agents/semantic-reviewer.md`,
`.claude/agents/coderabbit-sync.md`, `.claude/skills/supabase-rls.md` and `app-design-document.md`.

## Decision 60: The report "Correct" fraction is item/item in every mode; Skipped carries the paper size (2026-08-24)

**Reverses** the exam half of the Phase 4 header split (Decision-era note in `docs/plan.md`, VFR RT
Training Phase 4): the exam summary header used to render `correctCount / totalQuestions`.

**Problem**: `quiz_sessions.correct_count` is written **item-level** (or zero) by every writer that
touches it — derive the set with `grep -rn "correct_count *=" supabase/migrations/`, tracing each
function to its latest definition; examples include: `batch_submit_quiz` sums per-blank
`correct_rows`
(`supabase/migrations/20260702000600_batch_submit_quiz_diagram_label.sql`),
`submit_vfr_rt_exam_answers` (`20260815000300`) and `complete_overdue_exam_session`
(`20260610001200`) both `count(*) FILTER (WHERE is_correct)` over `quiz_session_answers`.
`total_questions` is **question-level**. Dividing one by the other mixes scales, so a perfect
25-question VFR RT exam (short_answer + dialog blanks + MC) renders **"29 / 25"** — more correct
answers than there were questions. Scope of the claim, stated precisely: the defective expression is
DEPLOYED on production and production carries the VFR RT content that triggers it (all three parts
live since 2026-08-18), and the same `ResultSummary` serves both the student report and the admin
session report via `admin-report-card.tsx`. The item/question mismatch was reproduced locally; no
production render was observed, and this entry does not claim one.

**Decision**:
1. **One expression, no mode branch** — `correctCount / answeredItems` in both the desktop and the
   mobile layout. Both operands are item-level, so this removes the question/item scale mismatch.
   Be precise about the upper bound, because item-level UNITS do not establish it on their own and
   `ResultSummary` performs no cardinality check: the fraction stays at most 1 only while upstream
   writers preserve `correctCount <= answeredItems`. They do today — every writer counts
   `is_correct` over the same `quiz_session_answers` rows the denominator counts, so the numerator
   is a subset by construction — but that is a property of the writers, not of this expression.
2. **`answeredItems === 0` renders an em dash**, not `0 / 0`.
3. **`Skipped` now renders for exams too, and in the mobile layout** (which never had it; its grid
   goes `grid-cols-3` → `grid-cols-2`, a 2x2). This is not cosmetic: the old exam denominator
   `totalQuestions` was what carried the "out of the whole paper" signal. Moving to `answeredItems`
   removes it, so `Skipped` is what now ties the fraction back to the PAPER SIZE. Be precise about
   what that does and does not buy: `Skipped` + the fraction reconstructs the score ring only when
   every question contributes exactly one item. It does NOT in general — `batch_submit_quiz` scores
   `sum(LEAST(correct_rows / total_blanks, 1.0))`, so a question with 3 of 5 blanks right adds 0.6
   to the ring but 3 to the fraction, and `submit_vfr_rt_exam_answers` scores `(p1+p2+p3)/3`, a mean
   of three per-part percentages that no triple of (correct items, answered items, skipped
   questions) can reconstruct.
   Without the mobile cell, mobile would ship a fraction with no reconciler — strictly worse than
   before for an MC exam.
4. **`Skipped` renders an em dash when its inputs are incoherent** (`answeredQuestions >
   totalQuestions`). An earlier draft clamped to 0; that was rejected on review because a 0 reads as
   authoritative while being wrong in the direction that flatters the student, whereas "—" states
   that the number is not known. At the time this decision
   was written the admin session route FED `answeredQuestions` a raw answer-ROW count
   (`admin-quiz-report.ts`, whose own comment admitted it — #991), so a non-MC session overshot the
   question total and a live repro of that page showed **"SKIPPED -2"** (local repro). #991 has since
   fixed that; see the end of this item. The em dash is a PARTIAL guard, not a fix — be precise
   about its limit: it only fires when rows EXCEED `totalQuestions`. When a non-MC session's row
   count happens to land at or below the question total (3 questions answered across 6 rows in a
   10-question session), no guard fires and `Skipped` renders 4 where the truth is 7 — silently
   wrong, and still #991. That underlying wrong number was PR 3b's scope, and #991 is now FIXED:
   the admin route derives a true distinct-question count. Note the mechanism is NOT the SQL
   `COUNT(DISTINCT question_id)` anticipated here — `getAdminQuizReportSummary` pages the answer
   rows and takes a `Set` over `question_id` in the query helper. Decision 60's own change only
   removed the absurd rendering (a negative); the em-dash guard is retained as defence for any
   caller that passes inconsistent values.

**Rationale for not trusting the caller**: `ResultSummary` is shared across several routes with two
different summary builders. Derive the current set with
`grep -rl "ResultSummary" apps/web/app --include="*.tsx"` rather than trusting this list — as of
2026-08-24 it was four: the student report (`report-card.tsx`), the admin session report
(`admin-report-card.tsx`), and both internal-exam reports
(`app/app/admin/internal-exams/report/page.tsx`, `app/app/internal-exam/report/page.tsx`). The last
two are exam-mode-only, so both the denominator switch and the newly-appearing `Skipped` cell land
there; `internal_exam` permits partial submits, which is exactly where fraction and ring diverge. A presentational component that renders a
count cannot assert its inputs are coherent, and a negative "Skipped" is a worse failure than a
zero — it reads as a data-corruption bug to the admin looking at it.

**Scope**: `apps/web/app/app/quiz/report/_components/result-summary.tsx`, the NEW
`result-summary-stats.tsx` (82 lines: `Stat`, `DesktopStats`, `MobileStats` and both formatters,
extracted in the same commit per `code-style.md` §1), their tests, and the `report-card.test.tsx`
assertion that read the now-duplicated `Skipped` label. One query line also changed:
`admin-quiz-report.ts`'s null-count fallback went from `?? session.total_questions` to `?? 0`,
because falling back to a QUESTION-level value reinstated the very scale mix this decision removes.
No migration and no RPC change — `correct_count` and `total_questions` keep their semantics; only
the presentation stops mixing them.

**Known divergence until #990 lands**: as of 2026-08-24, list surfaces still rendering
`correctCount / totalQuestions` — derive the current set with
`grep -rn "correctCount}/{.*totalQuestions\|{correct}/{total}" apps/web/app --include="*.tsx"` —
were these two, both of which link straight to a report this decision changed:
`admin/dashboard/students/[id]/_components/clickable-session-row.tsx` and
`admin/internal-exams/_components/attempts-table.tsx`. Until they are fixed an admin can see
"29 / 25" in a list and "29 / 29" one click later. That is a deliberate split, not an oversight.


*Last updated: 2026-08-24 — Decision 60: the report "Correct" fraction is item/item in every mode (`correctCount / answeredItems`, em dash when nothing was answered) — the exam branch divided an ITEM-level `correct_count` by a QUESTION-level `total_questions` and can render "29 / 25" for live VFR RT exams (reproduced locally; no production render observed); `Skipped` now renders for exams and in the mobile layout (2x2) because it is what carries the paper-size signal the old denominator used to, and renders an em dash when `answeredQuestions` overshoots the question total — a clamped 0 would read as authoritative while being wrong in the student's favour. The admin route's raw answer-ROW `answeredQuestions`, which first exposed this, was fixed in #991; the guard stays as defence for any caller passing inconsistent values. Note the fix derives the distinct count in the query helper (a `Set` over the fetched answer rows), NOT via a SQL `COUNT(DISTINCT ...)`. Prior: 2026-08-20 — Decision 59: EVERY `tenant_isolation` policy is `FOR SELECT` (the policy exists only on org-scoped tables; it is not added to every table), on either of two INDEPENDENT grounds (role-gated writes, or no intended user-scoped write path) — supersedes Decision 53 points 2 and 4; `organizations`/`question_banks`/`courses`/`lessons` narrowed in mig `20260820000100`, closing GHSA-hjp9-x868-7wgw §2, with the exposure verified against production for the first time since the access token was rotated (#1183); invariant recorded that no table in `public` carries an unqualified `tenant_isolation` (#1175). Prior: 2026-08-19 — Decision 58: post-commit proportionality — the repeated-numeric-literal sub-rules are DROPPED (doc-updater no longer chases a stale count across tech.md/decisions.md/plan.md; those literals will drift and stay drifted), and NO no-executable-change exemption is added — an oracle was built and reverted after measuring that it would have fired on 1 of the last 300 commits (#1222, #1232, #1231, #1164). Prior: 2026-08-18 — Decision 57: the authoring gate R3 stays exact-match while the grader is typo-tolerant; the divergence is recorded rather than closed, because a simulated tolerant R3 newly fails zero of the 50 shipped questions and porting would reverse `normalize-answer.ts`'s own instruction and add a second untested SQL↔TS parity contract (#1194). Prior: 2026-08-15 — Decisions 55 & 56: Part 2 blanks pinned by dialogue not a scene line (authoring rule R7); grading tolerates typos but never digits (`answer_matches`, mig 158; graders repointed across migs 158–160). Prior: 2026-08-11 — Decision 54: VFR RT content lives in the org's existing question bank; the licence/course model stays deferred. Prior: 2026-08-09 — Decision 53: `tenant_isolation` must be `FOR SELECT` on any table that also has role-gated write policies (unqualified = `FOR ALL`, and permissive policies OR together, so the `is_admin()` gate never binds); `questions` narrowed in mig `20260809000100`, DELETE left with no permissive policy; carve-out mirrored into `docs/security.md` §3, `.claude/rules/security.md` rule 2 and `.coderabbit.yaml` | Earlier 2026-07-03 — Decision 49 amended: save-for-later drafts now close their practice sessions on save + resume mints fresh sessions (#1085) | Earlier 2026-07-02 — Decision 52: `diagram_label` question type — inline SVG component registry keyed by `image_ref` (not a static image), distractor labels allowed, 9-zone RWY 27/09 LH pattern seed, general `diagram_config` schema; per-zone answer rows reusing the Decision-51 model; INVERTED self-defence vs `ordering` (distinct zone_id/label_id is the integrity key, partial submission + unused labels explicitly allowed); migs 150–156 (VFR RT Phase 6) | Earlier 2026-06-30 — Decision 51: `ordering` question type stores PER-SLOT answer rows (dialog_fill-clone) for partial credit, deviating from spec N7's single-JSON-row; mig-144 trigger widening; `_grade_record_ordering` REVOKE-gated per-slot helper (mig 147); get_quiz_questions shuffled delivery (mig 145); batch_submit_quiz ordering dispatch + partial-credit rollup (mig 148) (VFR RT Phase 5) | Earlier 2026-06-30 — Decision 50: dnd-kit (core/sortable/utilities) for drag-and-drop question types (ordering, diagram_label); sensors [Pointer, Touch(delay250/tol5), Keyboard] for iPad (VFR RT Phase 5) | Earlier 2026-06-29 — Decision 49: single active quiz_sessions row per account across all modes (#1011) — global partial unique index `uq_one_active_session_per_student` + per-start-RPC `another_session_active` guard + Discovery-as-real-row + `endDiscovery` + `ActivePracticeBanner` recovery; Decision 48 amended (Discovery now a real ephemeral `mode='discovery'` DB row, still non-resumable + nothing-scored). | Earlier 2026-06-27 — Decision 48 reworked: Discovery reuses the real quiz runner via an ephemeral pre-marked sessionStorage handoff (navigate to `/app/quiz/session`, correct option pre-marked, explanation behind its tab, Exit not Finish, nothing persisted; persisted `ActiveSession` typed resumable-only). | Earlier 2026-06-26 — Decision 48 UI label: Study Mode surfaced as Discovery (first/default segment of New Quiz ModeToggle; internal identifiers remain `study`) | Decision 48: Study Mode `get_study_questions` RPC returns MC answers on-demand (deliberate exposure; exam-integrity enforced by the active-exam-session guard — raises `active_exam_session` mid-exam, red-team EO6) | Earlier 2026-06-21 — Decision 47: batch_submit_quiz per-type dispatch via internal helpers gated by REVOKE EXECUTE FROM PUBLIC, anon, authenticated (single authz boundary in the dispatcher) + DISTINCT-question partial-credit scoring matching the exam (VFR RT Phase 2.3) | Earlier 2026-06-21 — Decision 46: app-layer DB integration test tier (`apps/web/vitest.integration.config.ts`, real-DB under RLS) + mechanical schema-contract guards (soft-delete column guard, test-helpers import ban) + HARD new-query-site integration-test policy (#925) | Earlier 2026-06-20 — Decision 45: VFR RT training reuses the quiz Study UI on a dedicated `/app/vfr-rt` route (training before exam; bespoke exam UI parked) | Earlier 2026-06-19 — Internal Exam code email feature (mig 110): Decision 44 on Resend transactional email provider + `record_internal_exam_code_emailed()` RPC | Earlier 2026-06-10 — Phase A (migs 094–104): Decisions 41–43 on column REVOKE/GRANT privilege gate, UNIQUE NULLS NOT DISTINCT per-blank answers, and per-part VFR RT grading (≥75% per part, immutable config.question_ids); 6 new RPCs documented*
