# LMS Plus v2 — Claude Code Guide

EASA PPL Training Platform. Monorepo: Turborepo + pnpm.

## RULE 0 — NO PROSE (overrides everything below)

State what is true. Delete the rest.

- No justification, no precedent, no archaeology, no "why this changed". That is what `git log` is for.
- Fix the thing. Do NOT add a sentence explaining the fix.
- Every sentence is a claim that can be false and must be verified. Fewer sentences, fewer defects.
- If a fact is derivable, ship the command, not the paragraph.
- Evidence is not prose. A skip reason, an `EVIDENCE:` line, a finding's stated basis or a required status/summary stays wherever a rule asks for it.
- Applies to docs, rules, agent files, commit messages and replies. Docstrings are fine where they earn their place.

## ⚠️ PRIME DIRECTIVE — Orchestrator Protocol

**Orchestrator plans/reviews — does NOT write code directly unless < 10 lines, single file.**

### The rules, in order of priority:

1. **NEVER start without a plan** — multi-file needs Plan Mode first.
2. **NEVER explore the codebase yourself** — Explore agents (Sonnet) do it.
3. **ALWAYS delegate execution** — parallel when independent; worktree isolation for risky changes.
4. **ALWAYS read every subagent result first** — no fire-and-forget.
5. **ALWAYS run post-commit agents** — only NAMED § Post-commit review exemptions reduce the set.

### Your workflow for any non-trivial task:
```
1. Explore → subagents map code
2. Root cause → verify it's the RIGHT fix
3. Interview → surface ambiguities (skip for clear bug fixes)
4. Spec → 3+ files (spec-workflow MCP)
5. Plan
6. Validate → plan vs codebase (below)
7. Plan-critic → skip single-file <10 lines
8. Approve
9. Execute → parallel subagents
10. Impl-critic
11. Commit
12. Audit → post-commit agents
13. Fix → repeat 11-12
14. Tasks → update TaskCreate status
15. Learn
```

### Plan Validation (step 6 — MANDATORY before execution)

**Verify per file:** impact (callers/dependents via Explore agents), contract (do tests assert
behavior you're changing?), pattern (matches how similar things are done?), doc/schema (stays
accurate — database.md/decisions.md/plan.md), security surface (auth/RLS/answer data/input
validation — check `docs/security.md`).

**Plan must include:** files to change (line ranges), files affected, risks, test updates.

**Gate:** no Execute (step 9) until steps 6-8 complete.

### When NOT to use subagents:
- Reading a single known file, or a simple glob/grep for a symbol
- Single-file edits under 10 lines (post-commit agents still run)
- Git operations
- Plan-critic/implementation-critic — pipeline steps, not ad-hoc subagents

---

## Key docs (read for context)
- `docs/plan.md` — build plan | `docs/decisions.md` — confirmed decisions
- `docs/database.md` — schema + RPC (binding) | `docs/security.md` — security rules (binding)
- `.claude/rules/code-style.md` — file size limits, component rules (binding)
- `.claude/rules/agent-workflow.md` — pipeline order, orchestrator DO/NEVER (binding)
- `.claude/rules/agent-critic.md` — plan/implementation-critic rules (binding)
- `.claude/rules/agent-*.md` — per-agent DO/NEVER rules (binding)

## Stack
- Next.js App Router (`apps/web/`) + Tailwind v4 + shadcn/ui v4 (Base UI, oklch colors)
- Supabase (Postgres/Auth/Storage) — `packages/db/`
- Biome (lint/format) | Vitest (tests) | Playwright (E2E)
- Email/password auth (not magic link)

## Commands
```bash
pnpm dev # start dev server
pnpm build # build all packages
pnpm test # run all tests (Vitest)
pnpm lint # biome lint check
pnpm check # biome lint + format
pnpm check-types # tsc --noEmit all packages
```

Dep-bump commit: run `pnpm check-types --force` (bypasses turbo cache). Next.js bump: also run
`pnpm --filter @repo/web dev` once, commit whatever it rewrites (`apps/web/AGENTS.md` or
`apps/web/CLAUDE.md`) — a modified tracked file aborts `/fullpush` step 5b
(`git status --porcelain --untracked-files=all`). Check `git status` broadly, not just one path.

Also audit `package.json` `pnpm.overrides` each dep bump: drop pins once removal conditions are
met, same commit. Verify redundancy, never infer from the resolved version:
- `pnpm -r why <pkg>` (`-r` covers every workspace package; bare `pnpm why` can false-negative).
- Read the DECLARED range of EVERY dependent (`node_modules/.pnpm/<dep>@<ver>*/node_modules/<dep>/package.json`).
- Re-audit in a scratch worktree after `pnpm install --lockfile-only` (audit reads the lockfile).
- Plain `pnpm audit`, not `--audit-level=high` (a pin may guard a LOW advisory).
- Record the exit condition in the commit message.

## Critical rules (full details in linked docs)
- page.tsx: composition only, no logic (file-size limits are data: `.claude/limits.json`)
- No `useEffect` for data fetching — Server Components only
- No hard DELETE — always soft delete (`deleted_at`)
- No `any` type — use `unknown` with narrowing
- All mutations via Server Actions, not API routes
- Correct answers stripped server-side via `get_quiz_questions()` RPC — never SELECT * for students
- Service role key: `packages/db/src/admin.ts` only, never NEXT_PUBLIC_
- Applying a defensive pattern to one location: grep sibling files with the same structure first

## NEVER DO (top-level negative constraints)

### Security — hard stops
- **NEVER** `SELECT *` from `questions` for students — use `get_quiz_questions()` RPC only
- **NEVER** prefix service role key with `NEXT_PUBLIC_` — lives in `packages/db/src/admin.ts` only
- **NEVER** hard DELETE — always `UPDATE SET deleted_at = now()`
- **NEVER** UPDATE/DELETE `audit_events`, `student_responses`, `quiz_session_answers` — immutable
- **NEVER** commit `.env*` files — pre-commit hook blocks them
- **NEVER** trust client input — Zod `.parse()` on every Server Action/API route first
- **NEVER** create SECURITY DEFINER functions without `auth.uid()` check AND `SET search_path = public`

### Code — hard stops
- **NEVER** use `any` — use `unknown` with narrowing
- **NEVER** use `useEffect` for data fetching — Server Components only (hydration guards exempt)
- **NEVER** create barrel `index.ts` files — import directly
- **NEVER** create API route handlers for mutations — Server Actions only
- **NEVER** put business logic in React components — components render, logic elsewhere
- **NEVER** create `__tests__/` folders — co-locate tests with source

### Workflow — hard stops
- **NEVER** push without explicit user approval
- **NEVER** skip post-commit review — all four core agents after every commit, except a NAMED § Post-commit review exemption; commit size ALONE never exempts
- **NEVER** push with unresolved BLOCKING/CRITICAL findings from agents
- **NEVER** amend a commit after a pre-commit hook failure — create a NEW commit
- **NEVER** skip implementation-critic, even single-file. ONE exemption: paths ALL under `.claude/agent-memory/**` (`agent-workflow.md § Pre-Commit Implementation Review`)
- **NEVER** skip plan-critic for multi-file plans — run after validation, before user approval

### Agent behavior — hard stops
- **NEVER** let agents change outside their scope (test-writer writes tests, not production code)
- **NEVER** change rules on a single occurrence — log/watch, change on 2+ repeats
- **NEVER** duplicate work between agents (code-reviewer = style, semantic-reviewer = logic, zero overlap)

## Workflow
1. Start each session: read `docs/plan.md`
2. Multi-file: draft + validate the plan (§ Plan Validation above)
3. Get user approval before executing
4. `/project:review` after feature complete
5. `/project:insights` weekly

## Post-commit review (MANDATORY)
Run these 4 subagents in parallel via the Agent tool after every `git commit`:
1. **code-reviewer** (sonnet) — diff vs `.claude/rules/code-style.md`
2. **semantic-reviewer** (sonnet) — deep logic/security/consistency review (like CodeRabbit)
3. **doc-updater** (haiku) — reports doc edits; YOU apply them (no Write/Edit tool)
4. **test-writer** (sonnet) — missing tests, writes + runs them (sole agent with repo Write/Edit, scoped to test files; `memory: project` also grants each its own R/W/E memory dir)

**Async.** WAIT for a completion notification from every agent LAUNCHED, read ALL results, then fix.
Never edit a file while an agent that can write it is in flight (`agent-workflow.md § Every agent
dispatch is ASYNCHRONOUS`). Fix, commit, repeat until clean. Then run:
5. **learner** (sonnet) — reads all findings, REPORTS proposed rule changes; you apply them. Writes
   only its own memory dir. Hand it a `/crlocal` fixup's CR-local triage table too — counts drive
   rule promotion (`agent-learner.md`).

Security files touched (migrations, db/src, quiz/actions, auth, proxy.ts, security.md — full set
in `agent-workflow.md § Red-Team Agent Trigger`, +`apps/web/e2e/redteam/`) → also run:
6. **red-team** (sonnet) — maps diff to specs, flags gaps; `pnpm --filter @repo/web e2e:redteam` if affected

Rules changed (`code-style.md`, `.claude/rules/security.md`, `docs/security.md`, `biome.json`,
`CLAUDE.md`, or a new **or changed** `.claude/hooks/*.mjs` guard — see `agent-coderabbit-sync.md`) → also run:
7. **coderabbit-sync** (haiku) — keeps `.coderabbit.yaml` aligned

**Docs-only exemption:** touches ONLY `docs/**/*.md` (not `docs/security.md`), root `*.md` (not
`CLAUDE.md`), or `.claude/agent-memory/**` → doc-updater only.

**Review-follow-up exemption:** applies ONLY findings from its own parent's post-commit cycle →
semantic-reviewer only. ALL must hold:
- the PARENT ran the FULL cycle and claimed no exemption itself;
- every hunk traces to a finding from that cycle;
- touches only files the parent touched, adds no new file;
- <= 20 changed lines outside tests, <= 60 inside them;
- no security path, rules file, migration, or CI/hook/config.

If any condition fails, run the full cycle. Neither exemption gets a learner pass.

**A `/crlocal` fixup commit NEVER qualifies for review-follow-up** — hunks trace to CR-LOCAL
findings, not the parent's cycle, the ONLY place a CR-local finding is counted (`agent-learner.md §
DO`). Neither exemption is a "small commit" exemption.

**Stop rule.** On a review-follow-up, act only on CRITICAL/ISSUE findings naming a runtime defect
or a FALSE prose claim. Log and stop on everything else. A false claim is never bounded out — cap
the chain at 3 consecutive commits applying only the previous commit's findings, then escalate;
every finding needs a terminal disposition per `wrapup.md`.

Pre-commit critics (plan-critic, implementation-critic) are additive — never push until every agent
on the selected path reports clean.

## QA pipeline
Lefthook enforces mechanical gates (blocking). Command list is DATA in `.claude/pipeline.json` — do
not enumerate it here (`.claude/pipeline.test.mjs` fails if it and `lefthook.yml` disagree).
- **pre-commit:** mechanical guards only; unit tests run only in CI.
- **commit-msg:** conventional commit format; a cited SHA must resolve (proves only EXISTENCE — `code-style.md` §10 cl.6); a claim corrected in one file must not still stand in another (§10 cl.3) — escape hatch: `Retracted-ok: <token> — <reason>` trailer.
- **pre-push:** security-auditor + dep audit — FAIL-CLOSED: LLM audit failure/timeout or missing `run-security-auditor.sh` BLOCKS the push, no fallback approval.

Everything else (review, docs, tests) runs through subagents for visibility.

## Local migrations
`supabase db push --local` skips migrations already in the ledger — editing one in place is a
silent no-op. Run `supabase db reset` + re-seed before local integration/E2E. Only `migration-test`
CI runs `db reset`; others just `supabase start`; re-derive via
`grep -rn 'db reset\|supabase start' .github/workflows/`.

## Push protocol
Never push without explicit user approval. 2+ commits: full-diff semantic review first —
`git fetch origin` (ABORT if it fails), then `git diff origin/master...HEAD`. See
`agent-workflow.md § Pre-Push PR Sweep`.
