# Project Structure

## Directory Organization

```
lmsplusv2/                          # Monorepo root (Turborepo + pnpm)
├── apps/
│   └── web/                        # Next.js App Router application
│       ├── app/                    # App Router pages and layouts
│       │   ├── _components/        # Shared app-level components
│       │   ├── app/                # Protected routes (auth-gated via proxy.ts)
│       │   │   ├── _components/    # Shared protected-area components
│       │   │   ├── _hooks/         # Shared protected-area hooks
│       │   │   ├── _types/         # Shared protected-area types
│       │   │   ├── admin/          # Admin features
│       │   │   │   ├── questions/  # Question editor (CRUD)
│       │   │   │   ├── students/   # Student manager (CRUD)
│       │   │   │   └── syllabus/   # Syllabus manager (CRUD)
│       │   │   ├── dashboard/      # Student dashboard
│       │   │   ├── quiz/           # Quiz trainer (core feature)
│       │   │   │   ├── _components/
│       │   │   │   ├── _hooks/
│       │   │   │   ├── actions/    # Server Actions (per-action files)
│       │   │   │   ├── report/     # Quiz report page
│       │   │   │   ├── session/    # Active quiz session page
│       │   │   │   └── types.ts    # Feature-scoped types
│       │   │   ├── progress/       # Progress tracking
│       │   │   ├── reports/        # Historical reports
│       │   │   └── settings/       # User settings
│       │   ├── auth/               # Auth pages (login, callback, password reset)
│       │   ├── consent/            # GDPR consent page
│       │   └── legal/              # Terms, privacy policy
│       ├── lib/                    # Shared logic (not components)
│       │   ├── auth/               # Auth guards (requireAuth, requireAdmin)
│       │   ├── consent/            # Consent helpers
│       │   ├── gdpr/               # GDPR utilities
│       │   ├── queries/            # Read-only query functions
│       │   ├── utils/              # General utilities
│       │   ├── supabase-rpc.ts     # RPC wrapper helpers
│       │   └── utils.ts            # Misc shared utils
│       ├── scripts/                # Import and seed scripts
│       ├── e2e/                    # Playwright E2E specs
│       │   └── redteam/            # Security red-team specs
│       └── proxy.ts                # Next.js middleware (auth/consent gating)
│
├── packages/
│   ├── db/                         # Database package
│   │   └── src/
│   │       ├── client.ts           # Anon Supabase client (browser)
│   │       ├── server.ts           # Server Supabase client (SSR)
│   │       ├── middleware.ts        # Middleware Supabase client
│   │       ├── admin.ts            # Service role client (ONLY location for service key)
│   │       ├── schema.ts           # Zod validation schemas
│   │       ├── import-schema.ts    # ECQB import schemas
│   │       └── types.ts            # Generated Supabase types
│   ├── ui/                         # Shared shadcn/ui components
│   └── typescript-config/          # Shared tsconfig presets
│
├── supabase/
│   └── migrations/                 # Forward-only SQL migrations (timestamped)
│
├── docs/                           # Project documentation
│   ├── plan.md                     # Build plan, current phase
│   ├── decisions.md                # Architecture decision ledger
│   ├── database.md                 # Full schema + RPC reference
│   └── security.md                 # Binding security rules
│
├── .claude/                        # Claude Code agent system
│   ├── agents/                     # Agent definitions
│   ├── rules/                      # Binding rules (code-style, security, workflow)
│   ├── agent-memory/               # Persistent agent pattern tracking
│   └── commands/                   # Custom slash commands
│
├── .spec-workflow/                 # Spec-driven development artifacts
│   ├── steering/                   # Steering documents (this file)
│   ├── specs/                      # Feature specifications
│   ├── approvals/                  # Approval records
│   ├── templates/                  # Document templates
│   └── user-templates/             # User-customized templates
│
├── biome.json                      # Biome lint + format config
├── turbo.json                      # Turborepo pipeline config
├── lefthook.yml                    # Git hooks (pre-commit, commit-msg, pre-push)
├── pnpm-workspace.yaml             # pnpm workspace definition
└── sonar-project.properties        # SonarCloud configuration
```

### Feature folder anatomy

Every feature under `app/app/` follows this pattern:

```
feature/
├── _components/          # Private components (underscore = not a route)
│   ├── feature-card.tsx
│   └── feature-card.test.tsx
├── _hooks/               # Private hooks
│   ├── use-feature.ts
│   └── use-feature.test.ts
├── actions/              # Server Actions (one file per action or actions.ts)
│   ├── submit.ts
│   └── submit.test.ts
├── types.ts              # Feature-scoped type definitions
├── page.tsx              # Route page (composition only, max 80 lines)
└── loading.tsx           # Suspense fallback
```

### Private directory prefix

Directories prefixed with `_` (underscore) are not treated as route segments by Next.js App Router. Use `_components/`, `_hooks/`, `_types/` for feature-private code that should not create URL routes.

## Naming Conventions

### Files

| Category | Convention | Example |
|----------|-----------|---------|
| React component | `kebab-case.tsx` | `question-card.tsx` |
| Hook | `use-*.ts` | `use-quiz-session.ts` |
| Server Action | `actions.ts` or `kebab-case.ts` in `actions/` | `actions/submit.ts` |
| Utility/helper | `kebab-case.ts` | `format-score.ts` |
| Type definitions | `types.ts` | per feature folder |
| Test file | `*.test.ts` or `*.test.tsx` | `question-card.test.tsx` |
| SQL migration | `YYYYMMDDHHMMSS_description.sql` | `20260311000001_initial_schema.sql` |
| Config files | standard names | `biome.json`, `turbo.json` |

### Code

| Category | Convention | Example |
|----------|-----------|---------|
| Component export | `PascalCase` | `export function QuestionCard` |
| Function/method | `camelCase` | `submitAnswer`, `requireAuth` |
| Type/interface | `PascalCase` | `type QuizSession = ...` |
| Constants | `SCREAMING_SNAKE_CASE` | `MAX_QUIZ_QUESTIONS` |
| Variables | `camelCase` | `const studentId = ...` |
| Zod schemas | `PascalCase` + `Schema` suffix | `SubmitAnswerSchema` |
| Server Action results | `PascalCase` + `Result` suffix | `type SubmitAnswerResult` |
| DB table names | `snake_case` (plural) | `quiz_sessions`, `student_responses` |
| RPC function names | `snake_case` | `get_quiz_questions`, `submit_quiz_answer` |

### Prefer `type` over `interface`

Use `type` for all type definitions. Reserve `interface` only for objects that will be extended or implemented by classes.

## Import Patterns

### Import order

1. External packages (`react`, `next`, `@supabase/supabase-js`)
2. Internal monorepo packages (`@repo/db`, `@repo/ui`)
3. Project absolute imports (`@/lib/...`, `@/app/...`)
4. Relative imports (`./`, `../`)

### Package aliases

| Alias | Resolves to |
|-------|-------------|
| `@repo/db` | `packages/db/src/` — import specific files, not barrel |
| `@repo/ui` | `packages/ui/src/` |
| `@/` | `apps/web/` root (Next.js path alias) |

### No barrel files

Never create `index.ts` files that re-export from other modules. Import directly from the source file.

```ts
// WRONG — barrel re-export
import { QuestionCard } from '@repo/ui'

// CORRECT — direct import
import { QuestionCard } from '@repo/ui/question-card'
```

### Supabase client imports

| Context | Import from |
|---------|-------------|
| Browser/client component | `@repo/db/client` |
| Server Component / Server Action | `@repo/db/server` |
| Middleware (proxy.ts) | `@repo/db/middleware` |
| Admin operations (service role) | `@repo/db/admin` |

The service role client (`admin.ts`) must never be imported outside `packages/db/src/admin.ts` consumers on the server. Never use in client components.

## Code Structure Patterns

### Server Action file structure

```ts
'use server'

// 1. Imports
import { z } from 'zod'
import { createClient } from '@repo/db/server'
import { requireAuth } from '@/lib/auth/require-auth-user'

// 2. Validation schema
const SubmitSchema = z.object({
  questionId: z.string().uuid(),
  selectedOptionId: z.string().uuid(),
})

// 3. Result type (exported, co-located)
export type SubmitResult = { success: true; isCorrect: boolean } | { success: false; error: string }

// 4. Action function — orchestrator pattern
export async function submitAnswer(input: unknown): Promise<SubmitResult> {
  const parsed = SubmitSchema.parse(input)         // validate first
  const { user } = await requireAuth()              // auth second
  const supabase = await createClient()             // client third
  // ... core logic (delegate to helpers if > 30 lines)
  return { success: true, isCorrect: true }
}
```

### React component file structure

```tsx
// 1. 'use client' directive (only if needed — push down, not up)
'use client'

// 2. Imports
import { useState } from 'react'

// 3. Types (if small; otherwise in types.ts)
type Props = {
  question: Question
  onSubmit: (optionId: string) => void
}

// 4. Component (single export per file)
export function AnswerOptions({ question, onSubmit }: Props) {
  // ... render logic
}
```

### Page file structure (composition only)

```tsx
// 1. Imports — data fetching + components only
import { getStudentProgress } from '@/lib/queries/progress'
import { DashboardHeader } from './_components/dashboard-header'
import { SubjectGrid } from './_components/subject-grid'

// 2. Page component — fetch data, compose components, nothing else
export default async function DashboardPage() {
  const progress = await getStudentProgress()
  return (
    <main>
      <DashboardHeader />
      <SubjectGrid subjects={progress.subjects} />
    </main>
  )
}
```

### Function organization

1. Input validation (Zod `.parse()`)
2. Auth check (`requireAuth()` / `requireAdmin()`)
3. Core logic (delegate to named helpers if complex)
4. Error handling (log server-side, return generic message to client)
5. Return result

Use early returns to keep nesting shallow (max 3 levels).

## Code Organization Principles

### Feature-based, not type-based

Group by feature (quiz, dashboard, admin/students), not by type (components, hooks, utils). Each feature folder is self-contained with its own components, hooks, actions, and types.

### Co-located tests

Every test file lives next to its source file. No `__tests__/` directories.

```
actions/submit.ts
actions/submit.test.ts
_components/question-card.tsx
_components/question-card.test.tsx
```

### Server Components by default

All components are Server Components unless they need interactivity. Add `'use client'` at the lowest possible level in the component tree.

### Data fetching in Server Components only

No `useEffect` for data fetching. Server Components call query functions directly. The only approved `useEffect` pattern is the hydration guard:

```tsx
const [hydrated, setHydrated] = useState(false)
useEffect(() => { setHydrated(true) }, [])
```

### Mutations via Server Actions only

No API route handlers for mutations. Use `'use server'` functions. Route handlers (`route.ts`) exist only for webhooks and external consumers.

### Types exported next to their functions

Export result types alongside the function that produces them, in the same file:

```ts
export type SubmitAnswerResult = { isCorrect: boolean }
export async function submitAnswer(...): Promise<SubmitAnswerResult> { ... }
```

## Module Boundaries

### `packages/db` — Database layer

Owns all Supabase client creation, generated types, Zod schemas, and the admin (service role) client. No business logic lives here. The service role key exists **only** in `packages/db/src/admin.ts`.

**Exports:** `client.ts`, `server.ts`, `middleware.ts`, `admin.ts`, `schema.ts`, `types.ts`
**Never:** business logic, React components, Next.js imports

### `packages/ui` — Shared UI components

Owns reusable shadcn/ui components used across the app. Components here are presentational and stateless.

**Never:** data fetching, Server Actions, direct Supabase calls

### `apps/web/lib/` — Shared application logic

| Subdirectory | Responsibility |
|-------------|----------------|
| `lib/auth/` | Auth guards (`requireAuth`, `requireAdmin`) |
| `lib/queries/` | Read-only query functions (Server Component data fetching) |
| `lib/consent/` | Consent checking helpers |
| `lib/gdpr/` | GDPR utilities |
| `lib/utils/` | General-purpose utilities |

**Never:** React components, route handlers

### `apps/web/app/` — Pages and features

Owns route pages, feature components, hooks, Server Actions. Each feature folder under `app/app/` is self-contained.

**Dependency direction:** Pages import from `lib/`, `packages/db`, `packages/ui`. Never the reverse.

### `apps/web/proxy.ts` — Middleware

Owns auth session refresh, consent gating, and route protection. This is the Next.js middleware file (named `proxy.ts`, not `middleware.ts` per Next.js 16 convention).

**Never:** business logic, data mutations, direct DB queries beyond session refresh

### `supabase/migrations/` — Database migrations

Forward-only, timestamped SQL files. Never modify an existing migration. Always create a new one.

**Never:** application code, TypeScript, rollback logic

### Cross-boundary rules

- `apps/web` may import from `packages/db` and `packages/ui`
- `packages/db` and `packages/ui` must not import from `apps/web`
- `packages/db` and `packages/ui` must not import from each other
- The service role key (`SUPABASE_SERVICE_ROLE_KEY`) is accessed only via `packages/db/src/admin.ts`
- Never prefix service role key with `NEXT_PUBLIC_`

## Code Size Guidelines

### File size limits (hard — code-reviewer enforces)

| File type | Max lines | What to do if exceeded |
|-----------|-----------|----------------------|
| `page.tsx` | 80 | Extract logic to `lib/`, components to `_components/` |
| React component (`.tsx`) | 150 | Split into sub-components |
| Server Action file | 100 | Split by action into separate files in `actions/` |
| Hook (`use-*.ts`) | 80 | Extract logic to utility functions |
| Utility/helper (`.ts`) | 200 | Split by concern |
| SQL migration | 300 | Split into multiple sequential migrations |

### Function size limits

| Metric | Limit | Remedy |
|--------|-------|--------|
| Lines per function | 30 | Extract named helper functions |
| Parameters | 3 | Use an options object for 4+ params |
| Nesting depth | 3 levels | Use early returns, extract helpers |

Server Action orchestrators may stretch to 30-35 lines when each line is a single responsibility (validate, auth, RPC call, side effect). If adding a step requires scrolling, extract it.

### The golden rule

If you need to scroll to understand a file, it is too long. Split it.
