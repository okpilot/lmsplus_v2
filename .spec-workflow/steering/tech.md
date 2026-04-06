# Technology Stack

## Project Type

Multi-tenant SaaS web application for EASA PPL aviation training. Serves Approved Training Organisations (ATOs) with a question bank trainer, quiz engine, progress tracking, admin tools, and regulatory audit trail. Deployed as a monorepo with shared packages.

## Core Technologies

### Primary Language(s)

- **Language**: TypeScript (strict mode: `strict: true` + `noUncheckedIndexedAccess`)
- **Runtime**: Node.js (via Next.js on Vercel serverless)
- **SQL**: plpgsql for Postgres RPCs and migrations
- **Package manager**: pnpm (workspace protocol for monorepo)

### Key Dependencies/Libraries

- **Next.js (App Router)**: Full-stack React framework. Server Components for data fetching, Server Actions for mutations, `proxy.ts` for route protection (Next.js 16 convention).
- **Tailwind CSS v4**: Utility-first CSS with oklch color space. `@theme inline` in `globals.css`.
- **shadcn/ui v4**: Component library built on Base UI (not Radix). Official "Blue" theme on neutral base.
- **Supabase JS (`@supabase/supabase-js`, `@supabase/ssr`)**: Typed Postgres client, auth helpers, storage SDK.
- **Zod**: Runtime input validation on every Server Action and API route.
- **next-themes**: Dark mode via `attribute="class"`, system preference default.
- **@sentry/nextjs v10**: Error tracking with source maps, 10% trace sampling, tunnel route.
- **Turborepo**: Monorepo orchestration with task caching and dependency graphs.

### Application Architecture

**Monorepo structure (Turborepo + pnpm workspaces):**
```
lmsplusv2/
  apps/web/           -- Next.js App Router application
  packages/db/        -- Supabase schema, migrations, typed clients, admin client
  packages/ui/        -- Shared shadcn/ui components
  packages/typescript-config/  -- Shared tsconfig (base, nextjs, react-library)
```

**Key architectural patterns:**
- **Server Components by default** -- data fetching happens server-side, no `useEffect` for data loading.
- **Server Actions only for mutations** -- no API route handlers for mutations. Route handlers (`route.ts`) reserved for webhooks and external consumers.
- **ACID via Postgres RPCs** -- any multi-table operation runs in a single Postgres function (`batch_submit_quiz`, `start_quiz_session`, `record_consent`, etc.). No multi-step application-level transactions.
- **Deferred quiz writes** -- answers accumulate in client state, then `batch_submit_quiz()` RPC submits atomically on finish.
- **Feature-based folder organisation** -- co-located `_components/`, `_hooks/`, `actions.ts`, `types.ts` per route segment.
- **Defense in depth** -- proxy guard + Server Action guard + RLS + DB triggers + RPC auth checks. No layer trusts another.

### Data Storage

- **Primary storage**: Supabase (managed Postgres). 17+ tables with RLS on every table. Soft delete (`deleted_at`) on all mutable tables.
- **File storage**: Supabase Storage (`question-images` bucket) with org-scoped path isolation.
- **Client-side persistence**: localStorage for quiz session recovery (7-day staleness, private-mode safe).
- **Caching**: Turborepo build cache. Vercel edge cache for static assets. No application-level Redis.
- **Data formats**: JSON/JSONB (question options, session config, audit metadata), SQL for all persistence.

### External Integrations

- **Supabase Auth**: Email + password authentication. JWT sessions (1hr expiry, 7-day sliding refresh). PKCE flow for password recovery.
- **Supabase Storage**: Image upload for question images. Org-scoped path enforcement via storage policies.
- **Sentry**: Error tracking and performance monitoring. Source map upload during build.
- **Vercel**: Hosting with Skew Protection (4hr max age). Serverless functions for Server Actions.
- **SonarCloud**: Static analysis with 80% new-code coverage gate.
- **Codecov**: Coverage reporting with per-package flags (web, db).

### Monitoring & Dashboard Technologies

- **Error tracking**: Sentry (`@sentry/nextjs` v10) with error boundaries and 10% trace sampling.
- **CI dashboards**: GitHub Actions for all pipelines. Codecov and SonarCloud dashboards for coverage/quality.
- **Lighthouse CI**: Performance/accessibility audits on PRs (min scores: a11y 0.9, best-practices 0.9, SEO 0.85).
- **State management**: React Server Components (server state) + React hooks (client state). No Redux or external state library.

## Development Environment

### Build & Development Tools

- **Build system**: Turborepo (`turbo.json`) with task graph: `build` depends on `^build`, `test` depends on `^build`, `e2e` depends on `build`. Outputs cached: `.next/**`, `dist/**`, `coverage/**`.
- **Package management**: pnpm workspaces. `pnpm dev` for hot-reload, `pnpm build` for production.
- **Development workflow**: `pnpm dev` starts Next.js dev server with hot reload. Local Supabase via `supabase start` (Docker). Mailpit at `localhost:54324` for auth emails. Supabase Studio at `localhost:54323`.

### Code Quality Tools

- **Lint & format**: Biome v2.4.8 (`biome.json`). Single binary replacing ESLint + Prettier. Rules: `noUnusedVariables`, `noUnusedImports`, `noExplicitAny`, `noVar` (all error). Formatting: 2-space indent, 100-char line width, single quotes, no semicolons, trailing commas.
- **Static analysis**: SonarCloud (CI), GitHub CodeQL (weekly + on PRs), Biome's 450+ built-in rules.
- **Testing**:
  - **Unit/integration**: Vitest with v8 coverage provider. 2000+ tests across 165+ files. Co-located with source files (no `__tests__/` directories).
  - **E2E**: Playwright (10 specs covering login, quiz flow, admin tools, settings, consent).
  - **Red-team**: 9 Playwright attack specs for adversarial security testing (`e2e/redteam/`).
- **Type checking**: `tsc --noEmit` per package via `pnpm check-types`. Strict mode with `noUncheckedIndexedAccess`.

### Version Control & Collaboration

- **VCS**: Git on GitHub (`okpilot/lmsplus_v2`). Public repository.
- **Branching strategy**: Feature branches + PRs to `master`. Branch protection: PRs required, 5 required checks (Lint & Format, Type Check, Unit Tests, E2E Tests, CodeQL), strict mode (branch must be up-to-date), no force push, enforce admins.
- **Commit format**: Conventional Commits enforced via commitlint in Lefthook `commit-msg` hook.
- **Code review**: CodeRabbit (automated on PRs) + 4 post-commit Claude Code subagents (code-reviewer, semantic-reviewer, doc-updater, test-writer) run in-session after every commit.
- **Git hooks (Lefthook v2, `lefthook.yml`)**:
  - `pre-commit` (parallel): Biome check + type-check
  - `commit-msg`: commitlint
  - `pre-push` (parallel): security-auditor agent + `pnpm audit --audit-level=high`
  - `post-commit`: agent reminder (non-blocking)

## Deployment & Distribution

- **Target platform**: Vercel Pro (serverless, edge network). Skew Protection enabled with 4-hour max age.
- **Distribution**: SaaS -- users access via `https://lmsplus.app`.
- **CI/CD pipelines** (GitHub Actions):
  - `ci.yml`: lint, type-check, coverage (Vitest + v8), Codecov upload, dependency audit -- every PR + push to master
  - `e2e.yml`: migration test (`supabase db reset --no-seed`), integration tests, Playwright E2E -- PRs + master + nightly
  - `sonarcloud.yml`: SonarCloud static analysis -- PRs + master
  - `lighthouse.yml`: Lighthouse CI audits (3 runs, min scores enforced) -- PRs + master
  - `redteam.yml`: red-team security tests -- branches touching security-sensitive paths
  - `codeql.yml`: GitHub CodeQL for JS/TS -- PRs + master + weekly Monday 05:30 UTC
  - `dependabot.yml`: weekly dependency updates (Actions + npm), `tech-debt` label, conventional commit prefixes
- **Database migrations**: Forward-only SQL files in `supabase/migrations/` (timestamped) and `packages/db/migrations/` (numbered, source of truth). Applied via Supabase CLI.
- **Secret management**: `.env.local` (gitignored) for local dev, Vercel Environment Variables (encrypted) for production, GitHub Actions secrets for CI.

## Technical Requirements & Constraints

### Performance Requirements

- Lighthouse CI gates: accessibility >= 0.9, best-practices >= 0.9, SEO >= 0.85, performance >= 0.6 (warn)
- Quiz question serving must strip correct answers server-side via RPC (no client-side filtering)
- Batch quiz submission must be atomic (single Postgres transaction)
- Consent gate checks cookie only (no DB hit per request)

### Compatibility Requirements

- **Browser support**: Modern browsers (Chrome, Firefox, Safari, Edge). No IE support.
- **Platform**: Responsive web (desktop + mobile frames designed). No native mobile app.
- **Node.js**: Version per Vercel's Next.js runtime requirements.
- **Supabase**: Managed Postgres. Local dev via Docker (`supabase start`).
- **Standards**: EASA Part ORA compliance for training record retention. GDPR compliance (with Article 17(3)(b) exemption for erasure).

### Security & Compliance

- **Authentication**: Email + password via Supabase Auth. JWT sessions (1hr expiry, 7-day sliding refresh with rotation). Pre-created users only (no self-registration).
- **Authorization**: RLS on every table with both `USING` and `WITH CHECK` policies. Admin routes require proxy guard + `requireAdmin()` Server Action guard.
- **Correct answer protection**: `get_quiz_questions()` RPC strips `correct` field from options JSONB. `get_report_correct_options()` RPC for post-session feedback (completed sessions only).
- **Service role key**: Server-only in `packages/db/src/admin.ts` with runtime browser guard. Never `NEXT_PUBLIC_`.
- **Input validation**: Zod `.parse()` / `.safeParse()` on every Server Action. LIKE metacharacter escaping. Free-text ILIKE fields capped at 200 chars.
- **Security headers**: CSP, HSTS (2yr + preload), X-Frame-Options (SAMEORIGIN), X-Content-Type-Options (nosniff), Referrer-Policy, Permissions-Policy.
- **Immutable tables**: `student_responses`, `quiz_session_answers`, `audit_events`, `user_consents` -- no UPDATE, no DELETE, ever. RLS policies block all writes; inserts only via SECURITY DEFINER RPCs.
- **Soft delete**: All mutable tables use `deleted_at TIMESTAMPTZ NULL`. No hard DELETE (exception: `question_comments`, Decision 30).
- **SECURITY DEFINER RPCs**: Always include `auth.uid()` IS NULL check + `SET search_path = public`. Must manually filter `deleted_at IS NULL` on soft-deletable tables (RLS bypassed).
- **Audit trail**: Append-only `audit_events` table for CAA compliance. `user_consents` append-only for GDPR proof.
- **GDPR**: Consent audit trail with versioned re-consent. Data export (self-service + admin). Erasure declined under EASA Part ORA (Article 17(3)(b) exemption).
- **Threat model**: exam answer exposure, cross-tenant data access, PII leaks, audit record tampering, service role key exposure, session replay.
- **Red-team testing**: 9 adversarial Playwright specs covering RLS bypass, RPC boundary breach, session forgery, race conditions, audit tampering, draft injection.

### Scalability & Reliability

- **Expected load**: Class sizes up to 10 students per ATO. Multi-tenant but not high-scale initially.
- **Availability**: Vercel serverless with edge network. Supabase managed Postgres with daily backups (7-day retention).
- **Idempotency**: All INSERTs use `ON CONFLICT DO NOTHING` or upsert. Safe to retry on network failure.
- **Session recovery**: localStorage checkpoints with 7-day staleness. Recoverable on page refresh or deployment.

## Technical Decisions & Rationale

### Decision Log

1. **Turborepo + pnpm over Nx** (Decision: Stack): Vercel-native, simpler configuration, built-in caching. Single `turbo.json` for task graph.

2. **Biome over ESLint + Prettier** (Decision: Tooling): 10-25x faster, single binary, one config file, 450+ rules, TypeScript-aware. Officially recommended with Lefthook.

3. **Email + password over magic link** (Decision 29): Magic link caused friction in dev (Mailpit, rate limits, PKCE complexity) and production (email deliverability, user confusion). Simpler for internal training platform.

4. **Pre-created users only, no self-registration** (Decision 16): ATOs manage their own students. Auth callback checks for `users` row; missing row -> sign out + "not registered" error.

5. **Post-commit agents as in-session subagents, not Lefthook hooks** (Decision 20): External hooks wrote to memory files nobody read. Subagents flow output into the conversation for immediate action.

6. **Analytics RPCs in plpgsql, not sql** (Decision 24): Explicit `auth.uid()` guard at function start is auditable. Parameter validation (days clamped to [1,365], limit to [1,100]). `IS DISTINCT FROM` instead of `!=` for NULL safety.

7. **Atomic batch quiz submission** (Decision 23): `batch_submit_quiz()` processes all answers + score + session completion in one Postgres transaction. Prevents orphaned answers from partial failures.

8. **question_comments hard DELETE exception** (Decision 30): Comments have low audit value. Primary path is hard DELETE, not soft-delete. Documented in database.md soft-delete matrix.

9. **GDPR erasure declined under EASA Part ORA** (Decision 33): Training records retained with full identity per Article 17(3)(b) exemption. Data export provided (self-service + admin). No deletion, no anonymisation.

10. **Post-session correct answer feedback via dedicated RPC** (Decision 25): `get_report_correct_options()` returns only `(question_id, correct_option_id)` for completed sessions. TypeScript layer never touches raw `correct` boolean.

11. **Server Action session ownership validation** (Decision 26): Four mandatory checks before operating on a quiz session: ownership (`student_id`), active (`ended_at IS NULL`), not discarded (`deleted_at IS NULL`), question membership (`config.question_ids`). `Array.isArray()` runtime guard required.

12. **GDPR consent gate with version-based re-consent** (Decision 32): Append-only `user_consents` table. Cookie-based middleware check (no DB hit per request). Version bump in `lib/consent/versions.ts` triggers re-consent.

13. **Red-team adversarial security testing** (Decision 27): 9 Playwright attack specs in `e2e/redteam/`. Separate CI workflow on security-sensitive paths. Red-team agent maps diffs to affected specs.

14. **Server-side pagination with server-side sort/filter** (Decision 34): All paginated lists use Supabase `.range()` with `{ count: 'exact' }`, URL-driven `?page=N&sort=field&dir=asc|desc`, and the shared `PaginationBar` component. Sorting and filtering MUST be server-side when combined with pagination — client-side sort on a paginated subset returns incorrect results. Page sizes: 10 for student-facing pages, 25 for admin pages. Out-of-range pages redirect to the last valid page. First established in admin questions (PR #463), now standardized app-wide.

## Known Limitations

- **No real-time features**: No WebSocket/Realtime subscriptions. All data fetching is request-response via Server Components or Server Actions.
- **Single-org assumption**: Comment visibility and some RLS policies assume single-org deployment. Multi-tenancy scoping deferred.
- **No offline mode**: Quiz progress persists to localStorage for recovery, but the app requires an internet connection.
- **jsdom limitation**: Pre-hydration state (disabled button, skeleton) is not testable in jsdom -- `useEffect` runs synchronously in `act()`.
- **No rate limiting at application layer**: Relies on Supabase Auth rate limits and `record_login()` RPC 60s rate limit. No Vercel/upstash rate limiting on API or auth routes yet.
- **EASA subject seed data**: Full taxonomy tree completeness unconfirmed -- currently 9 PPL(A) subjects imported.
- **eslint-config package**: Empty placeholder in `packages/eslint-config/` -- Biome is the sole linter. Package exists for monorepo structure compatibility.
