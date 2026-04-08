# LMS Plus v2 — Claude Code Guide

EASA PPL Training Platform. Monorepo: Turborepo + pnpm.

## ⚠️ PRIME DIRECTIVE — Orchestrator Protocol

**You (the orchestrator) are the planner and reviewer. You do NOT write code directly unless the change is trivial (< 10 lines, single file).**

### The rules, in order of priority:

1. **NEVER start without a plan.** For any multi-file change, enter Plan Mode first. Think through the approach, identify affected files, consider edge cases, and get user alignment before touching code.

2. **NEVER explore the codebase yourself when subagents can do it.** Use Explore agents (Sonnet) to search, read, and map the codebase. Keep your context window clean for decision-making, not stuffed with file contents.

3. **ALWAYS delegate execution to subagents.** You plan and review. Sonnet subagents implement. Launch them in parallel when tasks are independent. Use worktree isolation for risky changes.

4. **ALWAYS read every subagent result before proceeding.** No fire-and-forget. Subagents report back, you synthesize, you decide the next step. If a subagent found an issue, address it before moving on.

5. **ALWAYS run post-commit agents after every commit.** No exceptions. This is not optional. See "Post-commit review" section below.

### Your workflow for any non-trivial task:
```
1. Explore       → subagents map the relevant code
2. Root cause    → verify the described fix is the RIGHT fix
3. Interview     → surface ambiguities (skip for clear bug fixes)
4. Spec          → create spec if 3+ files (via spec-workflow MCP)
5. Plan          → you design the approach
6. Validate      → verify plan against codebase (see Plan Validation below)
7. Plan-critic   → independent agent reviews plan (skip for single-file <10 lines)
8. Approve       → user approves the validated plan
9. Execute       → subagents implement (parallel when possible)
10. Impl-critic  → review staged changes before commit (always runs)
11. Commit       → you create the commit
12. Audit        → post-commit agents review (parallel)
13. Fix          → address findings, repeat 11-12 until clean
14. Tasks        → update task status if using TaskCreate
15. Learn        → learner synthesizes patterns
```

### Plan Validation (step 6 — MANDATORY before execution)

Before writing any code, validate the plan against the actual codebase. This is where most bugs are cheapest to fix — 100x cheaper than catching them in review.

**For every file you plan to change, verify:**

1. **Impact analysis** — What other files read from or write to this file? Use Explore agents to trace callers, importers, and dependents. List them in the plan.

2. **Contract check** — Do existing tests assert behavior you're about to change? Read the test files. If a test asserts `fallback ?? 0` and you're changing it to `?? total`, the test will break — plan the test update alongside the code change.

3. **Pattern consistency** — Does your planned approach match how similar things are already done in the codebase? If 5 Server Actions all destructure `{ error }`, your new one must too.

4. **Doc/schema alignment** — Will your change make any doc (database.md, decisions.md, plan.md) inaccurate? If changing a migration, check the soft-delete matrix. If adding an RPC, check the RPC signatures table.

5. **Security surface** — Does the change touch auth, RLS, answer data, or input validation? If yes, verify against `docs/security.md` rules before implementing.

**The plan must include:**
- Files to change (with line ranges when possible)
- Files affected by the change (callers, tests, docs)
- Known risks or edge cases
- Test updates needed alongside code changes

**Gate:** Do not proceed to step 9 (Execute) until steps 6-8 are complete (validation done, plan-critic run, and user approval). A validated plan that takes 10 minutes prevents a 24-hour review cycle.

### When NOT to use subagents:
- Reading a single known file (use Read directly)
- Simple glob/grep for a specific symbol (use Glob/Grep directly)
- Single-file edits under 10 lines (do it yourself — post-commit agents still run after the commit)
- Git operations (do them yourself)
- Plan-critic and implementation-critic — these are invoked as part of the pipeline, not as ad-hoc subagents

### Why this matters:
- Your context window is expensive — don't waste it on exploration
- Parallel subagents are faster than sequential self-work
- Delegation creates natural review checkpoints
- **Validated plans prevent 24-hour review cycles** — catching a wrong fallback value at plan time costs 2 minutes; catching it via CodeRabbit costs hours of back-and-forth

---

## Key docs (read for context)
- `docs/plan.md` — build plan, current phase, what's next
- `docs/decisions.md` — all confirmed decisions
- `docs/database.md` — full schema + RPC patterns (binding)
- `docs/security.md` — security rules (binding)
- `.claude/rules/code-style.md` — file size limits, component rules (binding)
- `.claude/rules/agent-workflow.md` — pipeline order, orchestrator DO/NEVER (binding)
- `.claude/rules/agent-critic.md` — plan-critic and implementation-critic rules (binding)
- `.claude/rules/agent-*.md` — per-agent handling rules with DO/NEVER (binding)

## Stack
- Next.js App Router (`apps/web/`) + Tailwind v4 + shadcn/ui v4 (Base UI, oklch colors)
- Supabase (Postgres + Auth + Storage) — `packages/db/`
- Biome for lint/format | Vitest for tests | Playwright for E2E
- Email + password auth (not magic link)

## Commands
```bash
pnpm dev          # start dev server
pnpm build        # build all packages
pnpm test         # run all tests (Vitest)
pnpm lint         # biome lint check
pnpm check        # biome lint + format
pnpm check-types  # tsc --noEmit all packages
```

After any dep-bump commit, run `pnpm check-types --force` (bypasses turbo cache) to confirm new type definitions do not introduce errors.

## Critical rules (full details in linked docs)
- page.tsx: 80 lines max, composition only, no logic
- No `useEffect` for data fetching — Server Components only
- No hard DELETE — always soft delete (`deleted_at`)
- No `any` type — use `unknown` with narrowing
- All mutations via Server Actions (no API routes for mutations)
- Correct answers stripped server-side via `get_quiz_questions()` RPC — never SELECT * for students
- Service role key: `packages/db/src/admin.ts` only, never NEXT_PUBLIC_
- When applying any defensive pattern (cast guard, null check, error destructuring) to one location, grep the same file AND sibling files with the same code structure (e.g., admin and student query paths) for all other instances of the same pattern before committing

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
- **NEVER** skip implementation-critic before any commit — run on staged changes even for single-file changes
- **NEVER** skip plan-critic for multi-file plans — run after validation, before user approval

### Agent behavior — hard stops
- **NEVER** let agents make changes outside their scope (test-writer writes tests, not production code)
- **NEVER** change rules based on a single occurrence — log and watch, change on 2+ repeats
- **NEVER** duplicate work between agents (code-reviewer does style, semantic-reviewer does logic — zero overlap)

## Workflow
1. Start each session: read `docs/plan.md`
2. For any multi-file change: draft a plan, then validate it (see **Plan Validation** above)
3. Get user approval on the validated plan before executing
4. `/project:review` after feature complete
5. `/project:insights` weekly

## Post-commit review (MANDATORY)
After every `git commit`, run these 4 subagents in parallel using the Agent tool:
1. **code-reviewer** (haiku) — review diff against `.claude/rules/code-style.md`, report findings
2. **semantic-reviewer** (sonnet) — deep logic/security/consistency review (like CodeRabbit), report findings
3. **doc-updater** (haiku) — check if docs need updates, report what changed
4. **test-writer** (sonnet) — check for missing tests, write them, run them

Read ALL agent results. Fix any issues found. Commit fixes. Repeat until clean.

Then run:
5. **learner** (sonnet) — reads all agents' findings, identifies patterns, updates rules/memory

If diff touches security files (migrations, db/src, quiz/actions, auth, proxy.ts, security.md), also run:
6. **red-team** (sonnet) — maps diff to red-team specs, flags coverage gaps. If specs are affected, run `pnpm --filter @repo/web e2e:redteam`

If rules changed (code-style.md, security.md, biome.json), also run:
7. **coderabbit-sync** (haiku) — ensures .coderabbit.yaml stays aligned with our rules

Pre-commit critics (plan-critic, implementation-critic) run BEFORE commit and do not replace post-commit agents. They are additive — catching issues earlier, not removing later review.

Never push without all agents reporting clean.

## QA pipeline
Lefthook enforces mechanical gates (blocking):
- **pre-commit:** biome lint/format + type-check + unit tests
- **commit-msg:** conventional commit format
- **pre-push:** security-auditor agent + dependency audit

Everything else (code review, docs, tests) runs through ME as subagents so findings are visible and actionable. External hooks that I can't see are useless.

## Push protocol
Never push without explicit user approval. Always ask first.
For branches with 2+ commits, run a full-diff semantic review (`git diff master...HEAD`) before pushing — see `agent-workflow.md § Pre-Push PR Sweep`.
