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
2. **NEVER explore the codebase yourself when subagents can do it** — Explore agents (Sonnet) do it. Reading one known file or a simple symbol grep is exempt (§ When NOT to use subagents).
3. **ALWAYS delegate execution** — parallel when independent; worktree isolation for risky changes.
4. **ALWAYS read every subagent result first** — no fire-and-forget.
5. **ALWAYS run the pre-push review gate** — once per branch, all six reviewers in round 1. No exemption.

### Your workflow for any non-trivial task:
```
1. Explore → subagents map code
2. Root cause → verify it's the RIGHT fix
3. Interview → surface ambiguities (auto-skip: single-file bug w/ clear repro, zero ambiguities, or user says skip)
4. Spec → 3+ files (spec-workflow MCP)
5. Plan
6. Validate → plan vs codebase (below)
7. Plan-critic → skip single-file <10 lines
8. Approve
9. Execute → parallel subagents; commit freely, a commit triggers nothing
10. Pre-push gate → ONE loop over the branch diff (§ Pre-push review gate)
11. Fix → ONE pooled fixup commit per round → re-run → stop on first clean round
12. Learn → once per branch, after the loop
13. Conditionals → red-team / coderabbit-sync if the branch diff triggers them
14. Tasks → update TaskCreate status
15. /fullpush → push
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
- Single-file edits under 10 lines (the pre-push gate still runs on the branch)
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
- **NEVER** commit `.env*` files — `.gitignore` ignores them (except `.env.example`); no pre-commit hook scans for secrets
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
- **NEVER** skip the pre-push gate, or drop a reviewer from round 1 — branch size never exempts
- **NEVER** push with unresolved BLOCKING/CRITICAL findings from agents
- **NEVER** amend a commit after a pre-commit hook failure — create a NEW commit
- **NEVER** run a review round on an UNCHANGED artifact to chase a clean result — a round follows a FIX
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

## Pre-push review gate (MANDATORY)
ONE loop per BRANCH over `git diff origin/master...HEAD -- . ':(exclude).claude/agent-memory'`.
A commit triggers NOTHING. Full mechanics: `agent-workflow.md § Pre-Push Review Gate`.

**Round 1** — six reviewers, ONE parallel dispatch:
1. **implementation-critic** (sonnet) — branch diff vs the validated plan
2. **code-reviewer** (sonnet) — diff vs `.claude/rules/code-style.md`
3. **semantic-reviewer** (sonnet) — deep logic/security/consistency review
4. **doc-updater** (haiku) — reports doc edits; YOU apply them (no Write/Edit tool)
5. **test-writer** (sonnet) — missing tests, writes + runs them (sole agent with repo Write/Edit, scoped to test files; `memory: project` also grants each its own R/W/E memory dir)
6. **code-review (skill)** (opus) — the built-in `/code-review` skill, dispatched as a subagent in an isolated worktree, round 1 only

**Round 2+** — code-reviewer + semantic-reviewer. code-review (skill) is ROUND 1 ONLY.
doc-updater and test-writer PRODUCE rather than gate; re-run one only when the fixup added surface
it has not seen.

**Async.** WAIT for a completion notification from every agent LAUNCHED, read ALL results, validate
each finding, then ONE pooled triage table and ONE fixup commit. Never edit a file while an agent
that can write it is in flight (`agent-workflow.md § Every agent dispatch is ASYNCHRONOUS`).

**Stop on the FIRST round with no APPLY-worthy finding.** No minimum. An APPLY finding extends the
loop by one round; a skip-with-reason does not. **Ceiling 3 rounds** — at it, STOP and escalate; a
NEW critical in a section an earlier round passed means the diff is too large, so SPLIT.

Then ONCE per branch, in order:
7. **learner** (sonnet) — reads every round's findings, REPORTS proposed rule changes; you apply
   them. Writes only its own memory dir (`agent-learner.md`).

Security files touched (migrations, db/src, quiz/actions, auth, proxy.ts, security.md — full set
in `agent-workflow.md § Red-Team Agent Trigger`, +`apps/web/e2e/redteam/`) → also run:
8. **red-team** (sonnet) — maps diff to specs, flags gaps; `pnpm --filter @repo/web e2e:redteam` if affected

Rules changed (`code-style.md`, `.claude/rules/security.md`, `docs/security.md`, `biome.json`,
`CLAUDE.md`, or a new **or changed** `.claude/hooks/*.mjs` guard — see `agent-coderabbit-sync.md`) → also run:
9. **coderabbit-sync** (haiku) — keeps `.coderabbit.yaml` aligned

**Triage discipline.** Fix every validated CRITICAL and ISSUE (`agent-semantic-reviewer.md`). The
ONE bounded case: a wording REFINEMENT on prose this loop's own fixup just wrote is logged, not
chased — and a FALSE claim is never a refinement, whatever round it lands on. Every finding needs a terminal disposition per `wrapup.md`.

plan-critic is separate and unchanged: it runs ONCE per plan, before user approval, and is the one
gate no diff-based review can replace.

## QA pipeline
Lefthook enforces mechanical gates (blocking). Command list is DATA in `.claude/pipeline.json` — do
not enumerate it here (`.claude/pipeline.test.mjs` fails if it and `lefthook.yml` disagree).
- **pre-commit:** mechanical guards only; the unit suite runs at `/fullpush` step 4, the integration tier only in CI.
- **commit-msg:** conventional commit format; a cited SHA must resolve (proves only EXISTENCE — `code-style.md` §10 cl.6); a claim corrected in one file must not still stand in another (§10 cl.3) — escape hatch: `Retracted-ok: <token> — <reason>` trailer.
- **pre-push:** security-auditor + dep audit — FAIL-CLOSED: LLM audit failure/timeout or missing `run-security-auditor.sh` BLOCKS the push, no fallback approval.

Everything else (review, docs, tests) runs through subagents for visibility.

## Local migrations
`supabase db push --local` skips migrations already in the ledger — editing one in place is a
silent no-op. Run `supabase db reset` + re-seed before local integration/E2E. Only `migration-test`
CI runs `db reset`; others just `supabase start`; re-derive via
`grep -rn 'db reset\|supabase start' .github/workflows/`.

## Push protocol
Never push without explicit user approval. The pre-push gate runs first, on every branch —
`git fetch origin` (ABORT if it fails), then the loop over `git diff origin/master...HEAD`. See
`agent-workflow.md § Pre-Push Review Gate`.
