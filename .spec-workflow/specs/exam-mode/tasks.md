# Tasks — Exam Mode

## PR1: Admin Exam Config (Phases A + B + D)

### Phase A: Database Migrations

- [x] A1. Create `exam_configs` + `exam_config_distributions` tables with RLS
  - File: `supabase/migrations/20260411000001_exam_configs.sql`
  - File: `packages/db/migrations/038_exam_configs.sql`
  - Tables: exam_configs (id, organization_id, subject_id, enabled, total_questions, time_limit_seconds, pass_mark, created_at, updated_at, deleted_at) + exam_config_distributions (id, exam_config_id FK, topic_id FK, subtopic_id FK nullable, question_count)
  - UNIQUE(organization_id, subject_id) on exam_configs
  - UNIQUE(exam_config_id, topic_id, subtopic_id) on distributions
  - ON DELETE CASCADE from exam_configs to distributions
  - RLS: admin full CRUD via is_admin(), students NO access to either table
  - _Requirements: R1_

- [x] A2. Add `time_limit_seconds` and `passed` columns to `quiz_sessions`
  - File: `supabase/migrations/20260411000002_quiz_sessions_exam_columns.sql`
  - File: `packages/db/migrations/039_quiz_sessions_exam_columns.sql`
  - `time_limit_seconds INT NULL` (null for study mode)
  - `passed BOOLEAN NULL` (null for study mode or incomplete)
  - _Requirements: R3, R4, R6_

- [x] A3. Create `start_exam_session` RPC
  - File: `supabase/migrations/20260411000003_start_exam_session_rpc.sql`
  - File: `packages/db/migrations/040_start_exam_session_rpc.sql`
  - SECURITY DEFINER with auth.uid() check + SET search_path = public
  - Reads exam_config + distributions for the subject
  - Randomly selects questions per distribution (topic/subtopic counts)
  - Creates quiz_session with mode='mock_exam', time_limit_seconds, question_ids in config JSONB
  - Returns session_id + question_ids
  - RAISE EXCEPTION if any topic has fewer active questions than distribution requires
  - _Requirements: R2_

- [x] A4. Add exam guard to `batch_submit_quiz` + `passed` computation
  - File: `supabase/migrations/20260411000004_batch_submit_exam_guard.sql`
  - File: `packages/db/migrations/041_batch_submit_exam_guard.sql`
  - IF mode = 'mock_exam' AND answer count != total_questions THEN RAISE EXCEPTION
  - After scoring: if mode = 'mock_exam', read pass_mark from exam_configs, set passed = (v_score >= pass_mark)
  - Note: because exam guard requires all questions answered, score_percentage (correct/answered) = correct/total. Compare v_score >= pass_mark directly.
  - _Requirements: R5, R6_

- [x] A5. Regenerate TypeScript types
  - Run: `npx supabase gen types typescript --linked > packages/db/src/types.ts`
  - _Requirements: all_

### Phase D: Zod Schemas

- [x] D1. Create Zod schemas for exam config
  - File: `packages/db/src/schema.ts`
  - ExamConfigSchema: { subjectId, enabled, totalQuestions, timeLimitSeconds, passMark }
  - ExamConfigDistributionSchema: { topicId, subtopicId?, questionCount }
  - UpsertExamConfigSchema: config + distributions[] array
  - _Requirements: R1, R2_

### Phase B: Admin UI

- [x] B1. Add nav item + icon for Exam Config
  - File: `apps/web/app/app/_components/nav-items.ts` — add `'clipboard-check'` to icon union + add exam-config entry to ADMIN_NAV_ITEMS
  - File: `apps/web/app/app/_components/nav-icon.tsx` — add `case 'clipboard-check'` with SVG
  - File: `apps/web/app/app/_components/sidebar-nav.test.tsx` — add test for new nav entry
  - _Requirements: R1_

- [x] B2. Create admin exam-config page structure
  - File: `apps/web/app/app/admin/exam-config/page.tsx` — RSC, Suspense
  - File: `apps/web/app/app/admin/exam-config/loading.tsx` — skeleton
  - File: `apps/web/app/app/admin/exam-config/types.ts` — ExamConfig, ExamConfigDistribution, SubjectWithConfig types
  - File: `apps/web/app/app/admin/exam-config/queries.ts` — getExamConfigs() joins subjects + configs + distributions + question counts
  - _Requirements: R1_

- [x] B3. Create exam config Server Actions
  - File: `apps/web/app/app/admin/exam-config/actions/upsert-exam-config.ts` — Zod parse, requireAdmin(), upsert config row + delete/re-insert distributions
  - File: `apps/web/app/app/admin/exam-config/actions/toggle-exam-config.ts` — validate distribution completeness before enabling
  - _Requirements: R1_

- [x] B4. Create exam config components
  - File: `apps/web/app/app/admin/exam-config/_components/exam-config-content.tsx` — RSC, calls queries, passes to shell
  - File: `apps/web/app/app/admin/exam-config/_components/exam-config-page-shell.tsx` — client, manages dialog state
  - File: `apps/web/app/app/admin/exam-config/_components/subject-config-card.tsx` — per-subject card (code, name, params, status)
  - File: `apps/web/app/app/admin/exam-config/_components/config-form-dialog.tsx` — dialog with form fields + distribution editor
  - File: `apps/web/app/app/admin/exam-config/_components/distribution-editor.tsx` — topic/subtopic question count inputs with sum validation
  - _Requirements: R1_

### Phase E: Docs + Types

- [x] E1. Update docs
  - File: `docs/database.md` — add exam_configs + exam_config_distributions tables, modified quiz_sessions columns
  - File: `docs/decisions.md` — record exam mode as admin-configurable (moved from fast-follow to active)
  - _Requirements: all_

---

## PR2: Student Exam Mode (#514) — DEFERRED

- [ ] C1. Enable exam mode toggle + subject filtering
- [ ] C2. Exam setup UI (parameters display + start)
- [ ] C3. Countdown timer component
- [ ] C4. Exam session behavior (no feedback, confirm answer, auto-submit)
- [ ] C5. Exam results (pass/fail)

---

## Risks

- FK from `exam_config_distributions.subtopic_id` → `easa_subtopics` blocks hard-delete of referenced subtopics. Acceptable — admin must fix exam config first.
- `start_exam_session` RPC must RAISE EXCEPTION if topic has fewer active questions than distribution requires (clear error, not silent short-fill).
- Score semantics: exam guard ensures answered == total, so score_percentage is safe to compare directly against pass_mark.
