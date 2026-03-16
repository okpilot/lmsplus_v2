# Doc Updater — Patterns Log

## Migration Pattern Documentation (2026-03-12)

When a migration reveals a structural constraint or pattern that wasn't documented:
1. **Update `docs/database.md` § Migration Rules**
   - Add the pattern as a numbered rule with clear explanation
   - Include example syntax when relevant (e.g., DROP FUNCTION IF EXISTS)
   - Reference the commit that discovered the issue
2. **No changes needed to** `plan.md`, `decisions.md`, or `security.md` if the migration itself was already documented as complete
3. **Update timestamp** in database.md footer

Example: Commit 6128e52 (migration 008 required DROP FUNCTION before CREATE OR REPLACE to change return type) → Added rule 6 to Migration Rules section.

## RPC Deprecation Pattern (2026-03-12)

When an RPC is superseded by a newer one (e.g., `batch_submit_quiz` replaces `submit_quiz_answer` + `complete_quiz_session`):
1. **Update `docs/database.md` § RPC summary table** (line ~395):
   - Mark old RPC with `(DEPRECATED — use <new_rpc>)`
   - List new RPC separately with clear purpose
2. **Update RPC detail sections**:
   - Add deprecation header to old RPC section (e.g., "#### `submit_quiz_answer` — (deprecated: use `batch_submit_quiz`)")
   - Document the new RPC in full detail (parameters, behavior, atomicity guarantees)
3. **Update `docs/decisions.md`**:
   - Document the decision to deprecate in a CONFIRMED DECISION section (e.g., "Decision 23: Atomic batch quiz submission")
   - Explain the problem the new RPC solves (atomicity, partial failure risk, etc.)
4. **Update timestamps**: `docs/database.md` and `docs/decisions.md` footers with current date and reason for update

Example: Commit a269284 (batch_submit_quiz introduced, supersedes submit_quiz_answer + complete_quiz_session) → Updated RPC table with deprecation notes, documented in Decision 23, updated footer timestamps.

## Hook/Utility Extraction Refactor Pattern (2026-03-12)

When internal hooks or utilities are extracted (not a breaking API change):
- No documentation updates needed if they are internal implementation details
- Only document if the hook/utility becomes part of the public API or is used across multiple features
- Document patterns in `.claude/agent-memory/` for future reference (e.g., `clamp-index.ts` utility pattern)

Example: Commit a269284 (extracted `use-quiz-config.ts` from `quiz-config-form.tsx`, created `clamp-index.ts` utility) → No docs/plan.md updates needed (internal refactor). Patterns logged here for learner reference.

## E2E Test Documentation (2026-03-11 Playwright commit)

When Playwright E2E tests are added:
1. **Update `docs/plan.md`**:
   - Mark Phase 5B-4 as complete
   - Add details of E2E test specs (auth.setup.ts, login, protected routes, quiz, progress)
   - List helpers (Mailpit, Supabase) and scripts (pnpm e2e, e2e:ui, e2e:headed)
   - Update "Last updated" line and status section

2. **Update `MEMORY.md`**:
   - Expand Tests section with: "Phase 5B complete: X unit + Y integration + Z E2E tests"
   - Update MCPs section to note Playwright (@playwright/test) configured
   - Keep test summary count accurate

3. **Files to check after E2E tests added**:
   - `apps/web/playwright.config.ts` — new file
   - `apps/web/e2e/` directory — new test files and helpers
   - `apps/web/package.json` — new scripts (e2e, e2e:ui, e2e:headed)
   - `pnpm-lock.yaml` — @playwright/test dependency

4. **Sections in docs/plan.md that change**:
   - Status line (top)
   - Phase 5B section (mark 5B-4 done, list completed work)
   - "Next up" section (update to what's next)
   - "Last updated" footer
