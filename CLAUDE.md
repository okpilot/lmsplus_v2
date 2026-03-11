# LMS Plus v2 — Claude Code Guide

EASA PPL Training Platform. Monorepo: Turborepo + pnpm.

## ⚠️ PRIME DIRECTIVE — Orchestrator Protocol

**You (Opus) are the orchestrator. You do NOT write code directly unless the change is trivial (< 10 lines, single file).**

### The rules, in order of priority:

1. **NEVER start without a plan.** For any multi-file change, enter Plan Mode first. Think through the approach, identify affected files, consider edge cases, and get user alignment before touching code.

2. **NEVER explore the codebase yourself when subagents can do it.** Use Explore agents (Sonnet) to search, read, and map the codebase. Keep your context window clean for decision-making, not stuffed with file contents.

3. **ALWAYS delegate execution to subagents.** You plan and review. Sonnet subagents implement. Launch them in parallel when tasks are independent. Use worktree isolation for risky changes.

4. **ALWAYS read every subagent result before proceeding.** No fire-and-forget. Subagents report back, you synthesize, you decide the next step. If a subagent found an issue, address it before moving on.

5. **ALWAYS run post-commit agents after every commit.** No exceptions. This is not optional. See "Post-commit review" section below.

### Your workflow for any non-trivial task:
```
1. Explore  → subagents map the relevant code
2. Plan     → you design the approach, user approves
3. Execute  → subagents implement (parallel when possible)
4. Review   → you read results, verify correctness
5. Commit   → you create the commit
6. Audit    → post-commit agents review (parallel)
7. Fix      → address findings, repeat 5-6 until clean
```

### When NOT to use subagents:
- Reading a single known file (use Read directly)
- Simple glob/grep for a specific symbol (use Glob/Grep directly)
- Single-file edits under 10 lines (do it yourself)
- Git operations (do them yourself)

### Why this matters:
- Your context window is expensive — don't waste it on exploration
- Parallel subagents are faster than sequential self-work
- Delegation creates natural review checkpoints
- Plans prevent wasted effort on wrong approaches

---

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

## NEVER DO (top-level negative constraints)

### Security — hard stops
- **NEVER** `SELECT *` from `questions` for students — use `get_quiz_questions()` RPC only
- **NEVER** prefix service role key with `NEXT_PUBLIC_` — service key lives in `packages/db/src/admin.ts` only
- **NEVER** hard DELETE — always `UPDATE SET deleted_at = now()`
- **NEVER** UPDATE or DELETE on `audit_events`, `student_responses`, or `quiz_session_answers` — these are immutable
- **NEVER** commit `.env*` files — pre-commit hook blocks them
- **NEVER** trust client input — Zod `.parse()` on every Server Action and API route before using data
- **NEVER** create SECURITY DEFINER functions without `auth.uid()` check AND `SET search_path = public`

### Code — hard stops
- **NEVER** use `any` type — use `unknown` with narrowing
- **NEVER** use `useEffect` for data fetching — Server Components only (hydration guards are exempt)
- **NEVER** create barrel `index.ts` files — import directly from source
- **NEVER** create API route handlers for mutations — Server Actions only
- **NEVER** put business logic in React components — components render, logic lives elsewhere
- **NEVER** create `__tests__/` folders — co-locate tests with source files

### Workflow — hard stops
- **NEVER** push without explicit user approval — always ask first
- **NEVER** skip post-commit agent review — launch all 4 agents immediately after every commit
- **NEVER** push with unresolved BLOCKING or CRITICAL findings from agents
- **NEVER** amend a commit after a pre-commit hook failure — create a NEW commit instead

### Agent behavior — hard stops
- **NEVER** let agents make changes outside their scope (test-writer writes tests, not production code)
- **NEVER** change rules based on a single occurrence — log and watch, change on 2+ repeats
- **NEVER** duplicate work between agents (code-reviewer does style, semantic-reviewer does logic — zero overlap)

## Workflow
1. Start each session: read `docs/plan.md`
2. Plan Mode for any multi-file change (Shift+Tab twice)
3. `/project:review` after feature complete
4. `/project:insights` weekly

## Post-commit review (MANDATORY)
After every `git commit`, run these 4 subagents in parallel using the Agent tool:
1. **code-reviewer** (haiku) — review diff against `.claude/rules/code-style.md`, report findings
2. **semantic-reviewer** (sonnet) — deep logic/security/consistency review (like CodeRabbit), report findings
3. **doc-updater** (haiku) — check if docs need updates, report what changed
4. **test-writer** (sonnet) — check for missing tests, write them, run them

Read ALL agent results. Fix any issues found. Commit fixes. Repeat until clean.

Then run:
5. **learner** (sonnet) — reads all agents' findings, identifies patterns, updates rules/memory

If rules changed (code-style.md, security.md, biome.json), also run:
6. **coderabbit-sync** (haiku) — ensures .coderabbit.yaml stays aligned with our rules

Never push without all agents reporting clean.

## QA pipeline
Lefthook enforces mechanical gates (blocking):
- **pre-commit:** biome lint/format + type-check + unit tests
- **commit-msg:** conventional commit format
- **pre-push:** security-auditor agent + dependency audit

Everything else (code review, docs, tests) runs through ME as subagents so findings are visible and actionable. External hooks that I can't see are useless.

## Push protocol
Never push without explicit user approval. Always ask first.
