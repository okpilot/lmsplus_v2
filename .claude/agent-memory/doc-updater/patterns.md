# Doc Updater — Patterns Log

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
