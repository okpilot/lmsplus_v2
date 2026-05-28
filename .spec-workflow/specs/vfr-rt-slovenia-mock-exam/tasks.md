# Tasks Document — VFR RT Slovenia Mock Exam

> **Order matters.** Phase A (migrations) is the critical path — once shipped, types regen and unblocks everything else. Phase B–E can partially overlap.
>
> Each migration is one task; SQL ≤ 300 lines per file (`code-style.md` §1).
> Migration slot **082 is taken** by `redteam-quiz-session-bugs` T2.2 (#611). VFR RT migs start at **083**.
> Every `packages/db/migrations/0NN_*.sql` has a byte-identical mirror at `supabase/migrations/<ts>_*.sql`.

## Prerequisites (hard blockers)

**`#611` / mig `082_quiz_sessions_immutable_score_columns.sql` MUST ship before any VFR RT migration applies.** The 5 mutable score columns on `quiz_sessions` (`ended_at`, `correct_count`, `score_percentage`, `passed`, `deleted_at`) are trigger-protected for write only after #611. Shipping `vfr_rt_exam` before then would expose a new exam mode that inherits the existing direct-UPDATE forgery vector documented in #611. Sequence:

1. `redteam-quiz-session-bugs` PR 2 / mig `082` lands on master.
2. Verify on prod: a direct PostgREST UPDATE on any of the five mutable columns (`ended_at`, `correct_count`, `score_percentage`, `passed`, `deleted_at`) from an authenticated student raises the trigger-block error.
3. Then begin Phase A of this spec.

If #611 stalls, this spec also stalls. Do NOT add an interim per-mode trigger as a workaround — duplicates effort, fragments the immutability story, and will need to be removed once #611 lands.

## Phase A — Database (foundation, unblocks everything)

- [ ] **A.1 Migration `083` — `question_type` enum, type-specific columns, CHECK constraint, index, `options` default**
  - File: `packages/db/migrations/083_question_type_enum_and_column.sql`
  - File: `supabase/migrations/<ts>_question_type_enum_and_column.sql` (mirror)
  - ALTER `questions` ADD COLUMN `question_type TEXT NOT NULL DEFAULT 'multiple_choice' CHECK (...)`. ADD `canonical_answer TEXT NULL`, `accepted_synonyms TEXT[] NOT NULL DEFAULT '{}'`, `dialog_template TEXT NULL`, `blanks_config JSONB NOT NULL DEFAULT '[]'::jsonb`. **ALTER COLUMN `options` SET DEFAULT `'[]'::jsonb`** — the existing column is `NOT NULL` with no default; non-MC INSERTs would fail otherwise.
  - Add type↔column population CHECK with EVERY column positively stated in EVERY branch — multiple_choice asserts `canonical_answer IS NULL AND dialog_template IS NULL AND jsonb_array_length(blanks_config) = 0`, short_answer asserts `canonical_answer IS NOT NULL AND dialog_template IS NULL AND jsonb_array_length(blanks_config) = 0`, dialog_fill asserts `canonical_answer IS NULL AND dialog_template IS NOT NULL AND jsonb_array_length(blanks_config) > 0`. This DB-level discriminator rejects accidental cross-contamination (e.g. an admin-form bug saving a canonical_answer on a dialog_fill question).
  - Add partial index `(question_type, subject_id) WHERE deleted_at IS NULL AND status = 'active'`.
  - _Leverage: `packages/db/migrations/001_initial_schema.sql` (questions table shape, line 115 for the `options NOT NULL` constraint), `packages/db/migrations/058_quiz_session_modes.sql` (CHECK pattern)_
  - _Requirements: R1.1–R1.5_

- [ ] **A.2 Migration `084` — `quiz_session_answers` + `student_responses` schema shift for text responses & per-blank answers**
  - File: `packages/db/migrations/084_session_answers_for_text_responses.sql` (+ mirror)
  - On BOTH tables: `ALTER COLUMN selected_option_id DROP NOT NULL` (keep the existing `IN ('a','b','c','d')` CHECK — it permits NULL automatically). ADD `response_text TEXT NULL`, `blank_index INT NULL`. ADD a discriminator CHECK (do NOT replace the existing CHECK): exactly one of `selected_option_id` / `response_text` non-null per row; `blank_index` non-null only when `response_text` is set.
  - **Widen UNIQUE on BOTH tables.** `quiz_session_answers` carries `UNIQUE (session_id, question_id)` from mig 001; `student_responses` carries `student_responses_session_question_unique UNIQUE (session_id, question_id)` from `supabase/migrations/20260313000020_fix_student_responses_unique.sql`. Both must be widened — without the `student_responses` widening, every dialog_fill submission with 2+ blanks would fail at the second `student_responses` INSERT. Pattern (on each table): DROP the existing constraint, ADD `UNIQUE NULLS NOT DISTINCT (session_id, question_id, blank_index)`. Supabase Postgres 17 supports `NULLS NOT DISTINCT`. The NULL=NULL semantics preserve the "no duplicate MC rows per session" behavior for MC/short_answer rows where `blank_index IS NULL`.
  - **HARD DEPENDENCY:** mig 084 and mig 084b MUST ship in the same release. Applying 084 alone breaks `batch_submit_quiz` and `submit_quiz_answer` (their `ON CONFLICT (session_id, question_id)` clauses on `quiz_session_answers` no longer match any constraint after the DROP). The `student_responses` INSERT inside `batch_submit_quiz` uses bare `ON CONFLICT DO NOTHING` (mig 078 line 212) — no column-list match — so it works against any constraint and needs no 084b update.
  - _Leverage: existing schema in `001_initial_schema.sql`; `supabase/migrations/20260313000020_fix_student_responses_unique.sql`; `supabase/config.toml` for Postgres version_
  - _Requirements: R2, R3, R4_

- [ ] **A.2b Migration `084b` — update `batch_submit_quiz` and `submit_quiz_answer` ON CONFLICT clauses for the new constraint**
  - File: `packages/db/migrations/084b_update_existing_inserters_for_blank_index.sql` (+ mirror)
  - `CREATE OR REPLACE FUNCTION batch_submit_quiz(...)` — locate the LATEST body via Pre-Flag Verification (current LATEST: `supabase/migrations/20260430000012_active_user_gate_batch_submit.sql`), copy verbatim, change only `ON CONFLICT (session_id, question_id)` to `ON CONFLICT (session_id, question_id, blank_index)`. Same change applied to `submit_quiz_answer` (LATEST: `supabase/migrations/20260316000040_submit_answer_track_last_was_correct.sql`).
  - These functions continue to INSERT only MC/short-answer rows (no `blank_index`). With `NULLS NOT DISTINCT` semantics, the inference clause `(s, q, NULL)` matches the new constraint identically to the old `(s, q)` constraint — behavior is preserved.
  - _Acceptance:_ existing PPL/internal_exam/smart_review/quick_quiz answer-submission paths continue to work after both 084 and 084b are applied. SQL integration test asserts a re-submit of the same answer returns DO NOTHING (no duplicate row).
  - _Leverage: `agent-critic.md` Pre-Flag Verification rule (trace BOTH packages/db AND supabase/migrations for LATEST)_
  - _Requirements: R2.4 (idempotency preserved), NFR-Reliability_

- [ ] **A.3 Migration `085` — extend `quiz_sessions.mode` CHECK to include `'vfr_rt_exam'`**
  - File: `packages/db/migrations/085_quiz_sessions_mode_vfr_rt.sql` (+ mirror)
  - The CHECK was named `quiz_sessions_mode_check` by mig 058. Simple DROP CONSTRAINT + ADD CONSTRAINT — no DO-block lookup needed (the constraint is named, not anonymous):
    ```sql
    ALTER TABLE public.quiz_sessions DROP CONSTRAINT quiz_sessions_mode_check;
    ALTER TABLE public.quiz_sessions ADD CONSTRAINT quiz_sessions_mode_check
      CHECK (mode IN ('smart_review','quick_quiz','mock_exam','internal_exam','vfr_rt_exam'));
    ```
  - _Leverage: `packages/db/migrations/058_quiz_session_modes.sql` (constraint name source)_
  - _Requirements: R2.1_

- [ ] **A.4 Migration `086` — seed VFR RT subject + Part-1/2/3 topics**
  - File: `packages/db/migrations/086_seed_vfr_rt_subject_and_topics.sql` (+ mirror)
  - INSERT one `easa_subjects` row (`code='RT', name='VFR Radiotelephony (Slovenia)'`) with `ON CONFLICT (code) DO NOTHING` — `easa_subjects` has `UNIQUE(code)`.
  - INSERT three `easa_topics` rows under it (`P1_ACRONYMS`, `P2_DIALOG`, `P3_MC`) with `ON CONFLICT (subject_id, code) DO NOTHING` — `easa_topics` has `UNIQUE (subject_id, code)` (mig 001 line 67), NOT `UNIQUE(code)` alone. A bare `ON CONFLICT (code)` would fail at migration time. Resolve the subject's UUID first (CTE or scalar subquery).
  - _Leverage: existing seed pattern from initial schema; `packages/db/migrations/001_initial_schema.sql` lines 60–67 for `easa_topics` constraint shape_
  - _Requirements: R1, R4.3_

- [ ] **A.5 Migration `087` — `exam_configs.parts_config` jsonb column**
  - File: `packages/db/migrations/087_exam_configs_parts_config.sql` (+ mirror)
  - ALTER `exam_configs` ADD COLUMN `parts_config JSONB NOT NULL DEFAULT '{}'::jsonb`. Document the shape via `COMMENT ON COLUMN`. No backfill — existing rows keep `{}`.
  - _Leverage: `packages/db/migrations/038_exam_configs.sql`_
  - _Requirements: R4.1, R4.3_

- [ ] **A.6 Migration `088` — `start_vfr_rt_exam_session(p_subject_id)` RPC**
  - File: `packages/db/migrations/088_start_vfr_rt_exam_session_rpc.sql` (+ mirror)
  - SECURITY DEFINER + `SET search_path = public` + `auth.uid()` check + `users.deleted_at IS NULL` filter + audit-event INSERT with `actor_role` subquery filtering `deleted_at IS NULL`. Sample 8 short_answer + 9 dialog_fill + 8 multiple_choice by `random() LIMIT N`. Insert quiz_sessions with `mode='vfr_rt_exam'`, `time_limit_seconds=1800`. Idempotent resume on active in-flight. RAISE `'insufficient_questions_for_vfr_rt_exam'` with DETAIL when any pool is short.
  - _Leverage: `packages/db/migrations/060_start_internal_exam_session_rpc.sql` (blueprint); `049`, `063` for audit pattern; `security.md` §7 §9 §10_
  - _Requirements: R2, R4_

- [ ] **A.6b Migration `088b` — `get_vfr_rt_exam_questions(p_question_ids uuid[])` RPC (REQUIRED for Phase B/C)**
  - File: `packages/db/migrations/088b_get_vfr_rt_exam_questions_rpc.sql` (+ mirror)
  - SECURITY DEFINER + STABLE + `SET search_path = public` + `auth.uid()` check + `users.deleted_at IS NULL` filter. Returns one row per requested question id with: `id`, `question_type`, `question_text`, `question_image_url`, `subject_code`, `topic_code`, `difficulty`, `question_number`, `explanation_text`, `explanation_image_url`. For MC rows: `options` projected via the existing stripped pattern (id + text only, ORDER BY random()). For short_answer: `options = NULL`. For dialog_fill: `options = NULL`, `dialog_template` returned with `{{n|canonical;...}}` tokens REPLACED by `{{n}}` plain markers (`regexp_replace(dialog_template, '\{\{(\d+)\|[^}]*\}\}', '{{\1}}', 'g')`), and `blanks_safe jsonb` = `[{ index: int }]` array (canonicals stripped).
  - **MUST NEVER return**: `canonical_answer`, `accepted_synonyms`, raw `blanks_config` with canonicals, or any `correct` flag on options. Failure to strip is a `security.md` rule 1 violation.
  - `p_question_ids` carries the immutable-write-once exception per `docs/security.md §15` (same as `batch_submit_quiz` reading `quiz_sessions.config.question_ids`).
  - _Leverage: `get_quiz_questions()` LATEST body at `supabase/migrations/20260327000059_shuffle_answer_options.sql` for the options-stripping pattern; sibling RPC, not a replacement_
  - _Requirements: R1 (type-discriminated rendering), R3.8 (no answer leak before submit), NFR-Security_

- [ ] **A.7 Migration `089` — `submit_vfr_rt_exam_answers(p_session_id, p_answers jsonb)` RPC**
  - File: `packages/db/migrations/089_submit_vfr_rt_exam_answers_rpc.sql` (+ mirror)
  - Atomic: SELECT FOR UPDATE on session, ownership + mode + deleted_at checks, idempotent on `ended_at IS NOT NULL`, validate every `question_id` ∈ `config.question_ids`, INSERT `quiz_session_answers` + `student_responses` per entry (per blank for dialog_fill), compute per-part scores, UPDATE `quiz_sessions` (ended_at, correct_count, score_percentage, passed), INSERT audit-event with full per-part metadata.
  - _Leverage: `batch_submit_quiz` for the answer-write pattern; `complete_quiz_session` for completion shape_
  - _Requirements: R3, R6_

- [ ] **A.8 Migration `090` — `normalize_answer(text)` SQL helper + deploy-time locale guard**
  - File: `packages/db/migrations/090_normalize_answer_helper.sql` (+ mirror)
  - **Deploy-time guard at the top of the migration:** `DO $$ BEGIN IF lower('Č') <> 'č' THEN RAISE EXCEPTION 'normalize_answer requires UTF-8 locale that preserves diacritics ...'; END IF; END $$;`. Forces a deploy to a fold-folding locale (e.g. `tr_TR` or `C`/POSIX) to fail at apply time instead of silently breaking grader accuracy after launch.
  - `CREATE OR REPLACE FUNCTION normalize_answer(text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE`. Logic mirrors the TS `normalizeAnswer()` exactly.
  - _Leverage: `apps/web/lib/grading/normalize-answer.ts` (TS source of truth; mig 090 mirrors it)_
  - _Requirements: R6.1–R6.4_

- [ ] **A.9 Migration `091` — extend `complete_overdue_exam_session` for vfr_rt_exam mode**
  - File: `packages/db/migrations/091_extend_overdue_for_vfr_rt_exam.sql` (+ mirror)
  - `CREATE OR REPLACE FUNCTION complete_overdue_exam_session(...)` — locate LATEST via Pre-Flag Verification (`agent-critic.md`), copy verbatim, widen `mode IN (...)` to include `'vfr_rt_exam'`. Body for vfr_rt_exam overdue: compute partial per-part scores from existing answers, default missing entries to 0, emit `'vfr_rt_exam.expired'` audit event — matches the existing `CASE v_mode WHEN 'internal_exam' THEN 'internal_exam.expired' ELSE 'exam.expired' END` pattern at mig 063 lines 112–115. **Do NOT widen any other RPC mode check.**
  - _Leverage: `packages/db/migrations/063_extend_overdue_for_internal_exam.sql` (verify LATEST per agent-critic.md before copying)_
  - _Requirements: R2.3, NFR-Reliability_

- [ ] **A.10 Apply migrations, regen types, baseline tests**
  - Operations: `npx supabase db reset` → `npx supabase gen types typescript --linked > packages/db/src/types.ts` → `pnpm test` → `pnpm check-types`.
  - Confirm `Database['public']['Functions']['start_vfr_rt_exam_session']` exists; the new `question_type` enum union types reflect three values.
  - _Acceptance: All migrations apply clean; `pnpm test` and `pnpm check-types` exit 0._

- [ ] **A.11 SQL integration tests for new RPCs + extended RPCs**
  - File: `packages/db/tests/vfr-rt-exam.spec.ts` (new)
  - Cover every RPC error path + each acceptance criterion under R2/R3/R4/R6 from `requirements.md`. Include parity test for `normalize_answer` (SQL) vs `normalizeAnswer` (TS).
  - **Explicit diacritic test**: assert `SELECT normalize_answer('Č') = 'č'` (NOT `'c'`) — guards against accidental locale-driven diacritic folding (the Postgres `lower()` function folds differently under `tr_TR` than under `C.UTF-8` / `en_US.UTF-8`).
  - **Idempotency re-submit test**: assert that submitting the same `batch_submit_quiz` payload twice returns DO NOTHING on the second call (no duplicate row) — guards mig 084/084b regression on the new constraint.
  - _Leverage: existing test infra patterns in `packages/db/tests/`_
  - _Requirements: R2, R3, R4, R6, NFR-Security, NFR-Reliability_

## Phase B — Server Actions + grader utility

- [ ] **B.1 `apps/web/lib/grading/normalize-answer.ts` + co-located test**
  - Files: `normalize-answer.ts`, `normalize-answer.test.ts`
  - Pure single-function module. Test table covers: empty, whitespace, hyphens/underscores, punctuation, diacritic preservation, multiple cases.
  - _Requirements: R6_

- [ ] **B.2 Server Action `startVfrRtExam`**
  - File: `apps/web/app/app/vfr-rt-exam/actions/start.ts` + `.test.ts`
  - Zod parse `{ subjectId: z.uuid() }`, auth gate (`requireStudent()` or existing equivalent), RPC call, error mapping (4 cases per design.md), redirect to `/app/vfr-rt-exam/in-progress/<id>`.
  - _Test_: URL-redirect destination asserted via `.toHaveBeenCalledWith('/app/vfr-rt-exam/in-progress/...')` per `code-style.md` §7.
  - _Requirements: R2.1, R2.4_

- [ ] **B.3 Server Action `submitVfrRtExam`**
  - File: `apps/web/app/app/vfr-rt-exam/actions/submit.ts` + `.test.ts`
  - Zod discriminated union over the three answer-entry shapes, RPC call, returns `{ success, session_id, redirect_to }`.
  - _Test_: idempotent re-submit, partial answers, invalid question id mapping.
  - _Requirements: R3, R6_

- [ ] **B.4 Constants update**
  - File: `apps/web/lib/constants/exam-modes.ts` + co-located test
  - Add `'vfr_rt_exam'` to `EXAM_MODES`, `MODE_LABELS['vfr_rt_exam']`.
  - _Requirements: R2.1_

- [ ] **B.5 Discard guard extension**
  - File: `apps/web/app/app/quiz/actions/discard.ts` + `.test.ts`
  - Extend the existing `internal_exam` branch to also reject `vfr_rt_exam` with `'cannot_discard_vfr_rt_exam'`. Add the new test case alongside the existing internal_exam test.
  - _Requirements: R2.2_

## Phase C — Student UI

- [ ] **C.1 Briefing/landing page**
  - File: `apps/web/app/app/vfr-rt-exam/page.tsx` (≤ 80 lines, composition)
  - Reads active vfr_rt_exam session (if any) via a Server Component query; either redirects to `/in-progress/<id>` or renders `<VfrRtExamBriefing>` with Start button.
  - _Requirements: R2, R3, NFR-Usability_

- [ ] **C.2 In-progress page + runner shell**
  - Files: `in-progress/[sessionId]/page.tsx` (≤ 80) + `_components/vfr-rt-exam-runner.tsx` (≤ 150) + co-located tests
  - Reads session + answers in Server Component, passes to client `<VfrRtExamRunner>`. Runner manages local answer state + part-nav + timer (server-derived remaining time via `started_at + 1800s`).
  - _Test_: refresh-resume (Vitest) per `code-style.md` §7.
  - _Requirements: R2, R4.5, NFR-Reliability, NFR-Usability_

- [ ] **C.3 Per-question-type renderers**
  - Files: `_components/short-answer-renderer.tsx` (≤ 80), `_components/dialog-fill-renderer.tsx` (≤ 150), `_components/mc-renderer.tsx` (≤ 80; may reuse existing) + co-located tests
  - dialog-fill-renderer: parse the template's `[atc]`/`[pilot]` speaker tags + `{{n|canonical;...}}` blanks; render with inline `<input>` per blank. **Correct answers must NOT appear in client props** — only the template skeleton + blank index.
  - _Test_: snapshot of rendered template; verify neither the `canonical_answer` prop name nor any canonical answer values from `blanks_config` (test fixture seeds known canonical strings like "S5-ABC", "descending to 2500 feet" — assert each is absent) appear in client props or rendered HTML.
  - _Requirements: R1, R5, NFR-Security_

- [ ] **C.4 Part progress bar**
  - File: `_components/part-progress.tsx` (≤ 80) + test
  - 3-segment bar: answered/total per part.
  - _Requirements: NFR-Usability_

- [ ] **C.5 Results page + breakdown**
  - Files: `results/[sessionId]/page.tsx` (≤ 80) + `_components/results-breakdown.tsx` (≤ 150) + tests
  - Per-part score bars with 75% threshold marker, pass/fail badge, per-question review (correct answers revealed post-submit).
  - _Test_: pass/fail badge at boundary values (74.9 → fail; 75.0 → pass).
  - _Requirements: R3.1, R3.2, R3.3, R3.8, NFR-Usability_

## Phase D — Admin authoring

- [ ] **D.1 `UpsertQuestionSchema` discriminated union**
  - File: `packages/db/src/schema.ts` + test
  - Convert from flat `z.object` to `z.discriminatedUnion('question_type', [mc, short, dialog])`. Each variant validates its required + forbids the others' fields.
  - _Requirements: R1, R5.5_

- [ ] **D.2 Type selector + conditional form sections**
  - Files: `apps/web/app/app/admin/questions/_components/question-form-fields.tsx` (extend in place) + `short-answer-fields.tsx` (new ≤ 80) + `dialog-fill-fields.tsx` (new ≤ 150) + tests
  - Segmented control for question_type; conditional render based on selected value.
  - _Requirements: R5.1, R5.2, R5.3_

- [ ] **D.3 Dialog template parser + preview**
  - File: `apps/web/lib/grading/parse-dialog-template.ts` + co-located test
  - Parse the `{{n|canonical;syn1;syn2}}` token grammar; surface parse errors with token index.
  - _Requirements: R5.4_

- [ ] **D.4 Upsert action branch by type**
  - File: `apps/web/app/app/admin/questions/actions/upsert-question.ts` + test
  - Branch by `question_type` to populate columns; reuse existing INSERT/UPDATE infrastructure.
  - _Requirements: R5.5_

- [ ] **D.5 Admin questions list — type column/badge**
  - File: `apps/web/app/app/admin/questions/_components/questions-table.tsx` (extend in place) + test
  - Add `Type` column with a badge; allow filter-by-type (optional v1).
  - _Requirements: R5.6_

## Phase E — Tests + red-team + ops

- [ ] **E.1 Playwright E2E — full lifecycle, refresh-resume, timer expiry, discard-blocked, per-part fail**
  - Files: `apps/web/e2e/vfr-rt-exam.spec.ts` (new) + `apps/web/e2e/helpers/seed-vfr-rt-questions.ts` (new — seeds 10+ questions per type for the test org with the `[E2E_VFR_RT_Q]` marker per `code-style.md` §7 hermiticity rule)
  - Hermiticity: `test.afterEach` calls `cleanupE2eVfrRtQuestions()` (new helper, modeled on `restoreSeededQuestionsState` from `admin-questions.spec.ts`).
  - _Requirements: R2, R3, R4, R5, NFR-Reliability, NFR-Usability_

- [ ] **E.2 Red-team review + spec mapping**
  - Run the red-team agent post-commit (mig diffs trigger it). The agent maps changes to existing redteam specs; file GitHub Issues for any coverage gaps.
  - Specifically verify: no `canonical_answer` / `blanks_config` leak via PostgREST SELECT for students; no cross-student `quiz_session_answers.response_text` read; vfr_rt_exam mode honors the existing #611-territory exam-score-forgery defenses (depends on mig 082 shipping first OR explicit acceptance of residual vector).
  - _Requirements: NFR-Security_

- [ ] **E.3 Pre-push PR sweep**
  - Run semantic-reviewer on `git diff master...HEAD` per `agent-workflow.md § Pre-Push PR Sweep` once the branch is multi-commit.
  - Run `/crlocal` (CodeRabbit local CLI) per the `/fullpush` skill.
  - _Requirements: workflow_

- [ ] **E.4 Update spec `tasks.md` checkboxes `[x]` after each task completion**
  - Per `agent-workflow.md`, mark `[ ] → [x]` in this file as each task is verified clean.
  - _Requirements: workflow_

## Out of scope for v1 (documented; not in tasks)

- Course/enrollment model refactor (`courses.course_code`, `easa_subjects.course_id`, `users.course_id`). Recorded for v2.
- Per-part practice drills (drill Part 1 / 2 / 3 independently outside the timed exam).
- VFR RT content authoring beyond what's bulk-import-able via the admin editor (no rich-text dialog editor; textarea + parser is v1).
- Multiple jurisdictions (the courses.jurisdiction column). v1 is Slovenia-only.
- Bulk question import for VFR RT (admin manually creates or pastes a JSON import path; defer richer import).
- Exam_configs admin UI for VFR RT (config is seeded; if not, ops inserts the row).

---

**Estimated scope:** 9 migrations (A.1–A.9) + 1 SQL test file + 5 Server Action files + 8 new component files + 1 E2E spec + helpers. Roughly mid-sized — comparable to internal-exam-mode.
