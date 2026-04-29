# Tasks Document — Internal Exam Mode

> Order matters: schema → RPCs → server actions → UI → tests → docs. Many tasks block downstream tasks (e.g. UI work cannot start until RPCs return the right shape). Each task lists files touched, acceptance, and the requirement(s) it satisfies.

## 1. Constants & types (foundation, unblocks everything)

- [x] **1.1 Add `MODE_LABELS` constant + `isExamMode` helper**
  - File: `apps/web/lib/constants/exam-modes.ts` (new)
  - File: `apps/web/lib/constants/exam-modes.test.ts` (new)
  - Replace at least one hardcoded `"Practice Exam"` site (e.g. `quiz/session/_components/exam-session-header.tsx`) to prove the constant is wired (closes #544).
  - _Requirements: 6.3_
  - _Acceptance: type-level test asserts every value of `quiz_sessions.mode` CHECK has a label; `isExamMode('mock_exam')` and `isExamMode('internal_exam')` both true._

## 2. Database — schema + RPCs (each migration is one task; SQL ≤ 300 lines per file)

- [x] **2.0 Migration `057a` — extend `is_admin()` with `deleted_at IS NULL` filter**
  - File: `packages/db/migrations/057a_is_admin_softdelete_filter.sql` + supabase mirror
  - `CREATE OR REPLACE FUNCTION public.is_admin()` body becomes `SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin' AND deleted_at IS NULL);`
  - Plan-critic surfaced this as a real soft-delete bypass for admins; fixing it before adding new admin RPCs that depend on it.
  - _Acceptance: an admin user with `deleted_at IS NOT NULL` returns `false` from `is_admin()`._
  - _Requirements: NFR-Security_

- [x] **2.1 Migration `057` — `internal_exam_codes` table + RLS + indexes**
  - File: `packages/db/migrations/057_internal_exam_codes.sql`
  - File: `supabase/migrations/<ts>_internal_exam_codes.sql` (mirror)
  - Includes: table, FK constraints, both CHECKs from design, partial index for active codes, UNIQUE on `code`, RLS enabled, student SELECT policy (own + active), admin RLS via `is_admin()` org-scoped.
  - _Requirements: 1, 4, NFR-Security_

- [x] **2.2 Migration `058` — extend `quiz_sessions.mode` CHECK**
  - File: `packages/db/migrations/058_extend_quiz_sessions_mode_check.sql` + supabase mirror
  - Use the `DO $$` lookup-by-pg_constraint pattern from design.md (the original CHECK in `001_initial_schema.sql:185` is inline/unnamed so the auto-generated name varies by Postgres version).
  - Add the new constraint with explicit name `quiz_sessions_mode_check`.
  - _Requirements: 2, 3_

- [x] **2.3 Migration `059` — `issue_internal_exam_code()` RPC**
  - SECURITY DEFINER, search_path=public, admin gate, deleted_at filters everywhere (including audit subquery), 8-char code generation with retry, `internal_exam.code_issued` audit.
  - File: `packages/db/migrations/059_issue_internal_exam_code_rpc.sql` + mirror
  - _Requirements: 1.1–1.5_

- [x] **2.4 Migration `060` — `start_internal_exam_session()` RPC**
  - Validates code (5 enumerated error strings), auto-completes overdue same-subject session, builds question_ids from `exam_config_distributions`, atomic code consumption via WHERE-clause race guard.
  - File: `packages/db/migrations/060_start_internal_exam_session_rpc.sql` + mirror
  - _Requirements: 2.1–2.5_

- [x] **2.5 Migration `061` — `void_internal_exam_code()` RPC**
  - Three branches (unconsumed / active / finished), force `passed=false` on active-void, dual audit events on active branch.
  - File: `packages/db/migrations/061_void_internal_exam_code_rpc.sql` + mirror
  - _Requirements: 4.1–4.4_

- [x] **2.6 Migration `062` — extend `batch_submit_quiz` for `internal_exam`**
  - `CREATE OR REPLACE FUNCTION` from latest body in `056`. All-answered guard restricted to `mock_exam` only. Pass computation extended to `internal_exam`. Audit event_type branched.
  - File: `packages/db/migrations/062_extend_batch_submit_for_internal_exam.sql` + mirror
  - _Requirements: 3.3, 5.4_

- [x] **2.7 Migration `063` — extend overdue + empty completion RPCs for `internal_exam`**
  - `CREATE OR REPLACE FUNCTION complete_overdue_exam_session(...)` based on the latest body in `052_align_overdue_threshold_grace.sql` (NOT 054 — 054 only revises `start_exam_session`).
  - `CREATE OR REPLACE FUNCTION complete_empty_exam_session(...)` based on `055_align_complete_empty_audit_metadata.sql`.
  - Both widened to `mode IN ('mock_exam', 'internal_exam')`. Audit event_type branched.
  - Split into `063` + `064` if combined SQL > 300 lines.
  - File: `packages/db/migrations/063_extend_overdue_for_internal_exam.sql` + mirror
  - _Requirements: 3.4_

- [x] **2.8 Apply migrations + regenerate TS types**
  - `npx supabase db push` (or equivalent) → `npx supabase gen types typescript --linked > packages/db/src/types.ts`
  - _Acceptance: type for `quiz_sessions.mode` includes `'internal_exam'`; new RPCs appear in generated types._

- [ ] **2.9 SQL integration tests for new + extended RPCs**
  - File: `packages/db/tests/internal-exam-mode.spec.ts` (or wherever existing SQL tests live — check first)
  - Coverage: every RPC error path, race conditions for code consumption, RLS enforcement (student cannot SELECT others' codes; cannot INSERT directly).
  - _Requirements: NFR-Reliability, NFR-Security_

## 3. Server actions

- [x] **3.1 Admin: `issueCode` action + queries**
  - Files: `apps/web/app/app/admin/internal-exams/actions/issue-code.ts` + `.test.ts`
  - File: `apps/web/app/app/admin/internal-exams/queries.ts` + `.test.ts`
  - Zod parse, `requireAdmin()`, RPC call, sanitized errors per `code-style.md` §5.
  - _Requirements: 1.1–1.5, NFR-Security_

- [x] **3.2 Admin: `voidCode` action**
  - File: `apps/web/app/app/admin/internal-exams/actions/void-code.ts` + `.test.ts`
  - _Requirements: 4.1–4.3_

- [x] **3.3 Student: `startInternalExam` action + queries**
  - Files: `apps/web/app/app/internal-exam/actions/start-internal-exam.ts` + `.test.ts`
  - File: `apps/web/app/app/internal-exam/queries.ts` + `.test.ts` — list available (subject + expiry only, NO code value), list student's history.
  - URL-redirect destination asserted in tests (per agent-test-writer rule 2026-04-27).
  - _Requirements: 2.1–2.5_

- [x] **3.4 Extend `discard.ts` to reject `internal_exam`**
  - File: `apps/web/app/app/quiz/actions/discard.ts` + existing `discard.test.ts` updated
  - Add test for the new rejection branch.
  - _Requirements: 3.1, 3.2_

- [x] **3.5 Fork `getActiveInternalExamSession()` (do NOT widen the practice version)**
  - File: `apps/web/app/app/internal-exam/actions/get-active-internal-exam-session.ts` + `.test.ts`
  - Mirrors `apps/web/app/app/quiz/actions/get-active-exam-session.ts` but `.eq('mode', 'internal_exam')` and reuses `_overdue-helpers` unchanged.
  - **Do NOT modify** `quiz/actions/get-active-exam-session.ts` — keeps practice-exam recovery banner copy clean.
  - _Requirements: 3.4 (recovery), NFR-Reliability_

- [x] **3.6 Reports filter — exclude `internal_exam` from existing reports**
  - File: `apps/web/lib/queries/reports.ts` + existing `reports.test.ts`
  - Add `.neq('mode', 'internal_exam')` to the session list query (verify whether the RPC `get_session_reports` already accepts a mode param; if not, filter in TS).
  - Update test to assert internal-exam rows are excluded.
  - _Requirements: 5.1_

## 4. Frontend — admin

- [x] **4.1 Extend nav-items icon union + add admin "Internal Exams" entry**
  - File: `apps/web/app/app/_components/nav-items.ts`
  - The current icon union is closed (`home | file-question | bar-chart | book-open | list | users | settings | clipboard-check`). Add new icon `'shield-check'` (or equivalent) to the union; both new nav items will use it.
  - Locate the icon-render switch in the sidebar component and add the matching case.
  - Add `{ href: '/app/admin/internal-exams', label: 'Internal Exams', icon: 'shield-check' }` to `ADMIN_NAV_ITEMS` after Exam Config.
  - _Requirements: 6.2_

- [x] **4.2 Admin page shell `/app/admin/internal-exams/page.tsx`**
  - File: `page.tsx` (≤ 80 lines, composition only)
  - Tabs: Codes / Attempts.
  - _Requirements: 6.2_

- [x] **4.3 Issue-code form + result panel**
  - Files: `_components/issue-code-form.tsx` + `.test.tsx`, `_components/issued-code-panel.tsx` + `.test.tsx`
  - Student picker (existing pattern from admin/students), subject picker (existing pattern). After issue: show code in copy-to-clipboard panel with "won't be shown again" notice.
  - _Requirements: 1.1, 1.4, NFR-Usability_

- [x] **4.4 Codes table + void dialog**
  - Files: `_components/codes-table.tsx` + `.test.tsx`, `_components/void-code-dialog.tsx` + `.test.tsx`
  - Status badges (active / consumed / expired / voided / finished). Void disabled for finished.
  - _Requirements: 1, 4_

- [x] **4.5 Attempts table (admin view)**
  - File: `_components/attempts-table.tsx` + `.test.tsx`
  - Lists `mode='internal_exam'` sessions across org, drilldown to existing `/app/quiz/report?id=...`.
  - _Requirements: 5.3_

## 5. Frontend — student

- [x] **5.1 Student nav item "Internal Exam"**
  - File: `apps/web/app/app/_components/nav-items.ts`
  - Add `{ href: '/app/internal-exam', label: 'Internal Exam', icon: 'shield-check' }` to `NAV_ITEMS` between Quiz and Reports (icon already added in 4.1).
  - _Requirements: 6.1_

- [x] **5.2 Student page shell `/app/internal-exam/page.tsx`**
  - File: `page.tsx` (≤ 80 lines, composition only)
  - Tabs: Available / My Reports.
  - _Requirements: 6.1_

- [x] **5.3 Available tab + code-entry modal**
  - Files: `_components/available-tab.tsx` + `.test.tsx`, `_components/code-entry-modal.tsx` + `.test.tsx`
  - List rows show subject + relative + absolute expiry. Click "Start" opens modal. Modal validates code, calls action, redirects to `/app/quiz/session?id=...` on success.
  - **MUST NOT** display code value anywhere in the list.
  - _Requirements: 2.1, 2.2, 2.3, NFR-Security_

- [x] **5.4 My Reports tab**
  - File: `_components/my-reports-tab.tsx` + `.test.tsx`
  - List sessions with attempt number (1-indexed by started_at per subject), pass/fail badge, link to existing report page.
  - _Requirements: 5.2, 5.4_

- [x] **5.5 Hide Discard button when `mode='internal_exam'`**
  - File: locate the discard button in `quiz/session/_components/...` (Explore agent), gate render.
  - _Requirements: 3.1_

- [x] **5.6 Update `exam-session-header` to use `MODE_LABELS`**
  - Already done in 1.1; verify badge renders "INTERNAL EXAM" for the new mode.
  - _Requirements: 6.3_

## 6. Submission UX — partial-answer warning

- [x] **6.1 Confirm modal warns when answered < total at submit time**
  - File: locate the existing exam-submit confirm component, add the conditional warning string for `internal_exam` mode.
  - Test the warning string appears given a partial buffer.
  - _Requirements: 3.3, NFR-Usability_

## 7. Recovery + auto-submit verification (lifecycle E2E)

- [ ] **7.1 Playwright: full lifecycle**
  - File: `apps/web/e2e/internal-exam.spec.ts`
  - admin issues → student starts → answers some → submits → report shows "Internal Exam" badge + pass/fail → My Reports lists it.
  - _Requirements: 1, 2, 3.3, 5.2_

- [ ] **7.2 Playwright: refresh-resume mid-session**
  - File: `apps/web/e2e/internal-exam-resume.spec.ts`
  - Per `agent-test-writer.md` rule 2026-04-27.
  - _Requirements: 3.4, NFR-Reliability_

- [ ] **7.3 Playwright: discard blocked + void mid-session**
  - File: `apps/web/e2e/internal-exam-no-discard-and-void.spec.ts`
  - _Requirements: 3.1, 4.2_

- [ ] **7.4 Playwright: reports separation**
  - File: `apps/web/e2e/internal-exam-reports-separation.spec.ts`
  - Practice reports exclude internal; My Reports shows only internal.
  - _Requirements: 5.1, 5.2_

## 8. Red-team specs (security defense)

- [ ] **8.1 Cross-student code-use rejection**
  - File: `apps/web/e2e/redteam/internal-exam-cross-student.spec.ts`
  - Student B attempts to start with code issued to student A.
  - _Requirements: 2.4, NFR-Security_

- [ ] **8.2 Cross-org admin void rejection**
  - File: `apps/web/e2e/redteam/internal-exam-cross-org-void.spec.ts`
  - _Requirements: 4.4, NFR-Security_

- [ ] **8.3 Direct table-write attempts blocked by RLS**
  - File: `apps/web/e2e/redteam/internal-exam-rls-writes.spec.ts`
  - Student tries direct INSERT on `internal_exam_codes`; UPDATE to clear `consumed_at`. Both must fail.
  - _Requirements: NFR-Security_

## 9. Docs + memory

- [x] **9.1 Update `docs/database.md`**
  - New table row, new RPCs, mode CHECK extension, mode-discriminated audit events, soft-delete matrix update.
- [x] **9.2 Update `docs/security.md`**
  - Note `internal_exam` in the RPC inventory; cross-student code rejection rule.
- [x] **9.3 Update `docs/decisions.md`**
  - Decision: code stored plaintext (rationale per requirements NFR-Security).
  - Decision: each code = one attempt; retake = new code.
- [x] **9.4 Update `MEMORY.md`**
  - Brief project-memory entry pointing to this spec; list new RPCs and tables.

## 10. Closing

- [ ] **10.1 Run `pnpm check`, `pnpm check-types`, `pnpm test`, `pnpm e2e:redteam` — all green**
- [ ] **10.2 PR-level semantic review against full diff (`git diff master...HEAD`)** before push, per `agent-workflow.md § Pre-Push PR Sweep`.
- [ ] **10.3 Update spec `tasks.md` checkboxes `[x]` after each completed task** — per `feedback_update_spec_tasks` rule.

---

**Estimated scope:** ~7 new migrations, ~14 new TS files, ~6 extend-in-place, ~12 new tests + 4 Playwright + 3 red-team specs. Medium-XL.
