# LMS Plus v2 — Claude Code Guide

EASA PPL Training Platform. Monorepo: Turborepo + pnpm.

## Key docs (read for context)
- `docs/plan.md` — build plan, current phase, what's next
- `docs/decisions.md` — all confirmed decisions
- `docs/database.md` — full schema + RPC patterns (binding)
- `docs/security.md` — security rules (binding)
- `.claude/rules/code-style.md` — file size limits, component rules (binding)

## Stack
- Next.js App Router (`apps/web/`) + Tailwind v4 + shadcn/ui
- Supabase (Postgres + Auth + Storage) — `packages/db/`
- ts-fsrs for spaced repetition
- Biome for lint/format | Vitest for tests | Playwright for E2E
- Magic link auth only

## Commands
```bash
pnpm dev          # start dev server
pnpm build        # build all packages
pnpm test         # run all tests (Vitest)
pnpm lint         # biome lint check
pnpm check        # biome lint + format
pnpm check-types  # tsc --noEmit all packages
```

## Critical rules (full details in linked docs)
- page.tsx: 80 lines max, composition only, no logic
- No `useEffect` for data fetching — Server Components only
- No hard DELETE — always soft delete (`deleted_at`)
- No `any` type — use `unknown` with narrowing
- All mutations via Server Actions (no API routes for mutations)
- Correct answers stripped server-side via `get_quiz_questions()` RPC — never SELECT * for students
- Service role key: `packages/db/src/admin.ts` only, never NEXT_PUBLIC_

## Workflow
1. Start each session: read `docs/plan.md`
2. Plan Mode for any multi-file change (Shift+Tab twice)
3. `/project:review` after feature complete
4. `/project:insights` weekly
