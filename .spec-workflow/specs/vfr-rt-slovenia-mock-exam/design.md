# Design Document — VFR RT Slovenia Mock Exam

## Overview

This design adds a new timed exam mode (`vfr_rt_exam`) to the LMS, two new `question_type` values (`short_answer` and `dialog_fill`) that coexist with the existing `multiple_choice` shape, a per-part scoring + ≥75%-per-part pass criterion grader, and an admin authoring UI tab for each new question type. v1 ships ONLY the mock-exam feature — course/enrollment refactor and per-part practice drills are deferred to a future spec. VFR RT content lives in a new `easa_subjects` row (seed-inserted), beside the existing PPL subjects; no `course_id` plumbing in v1.

The work reuses three proven patterns from existing modes:
- **Sampling + freeze-on-start** from `start_internal_exam_session` (mig `060`) — `random() LIMIT N` per part, IDs stored in `quiz_sessions.config.question_ids`.
- **Auto-complete on overdue** from `complete_overdue_exam_session` (mig `063` — verify the LATEST definition via Pre-Flag Verification at implementation time) — extended to include the new mode in its `IF v_mode NOT IN (...)` guard and `v_event_type` CASE branch (see Reuse/Extend table below).
- **Audit-event INSERT pattern** from every completion RPC since mig `049` — `event_type = 'vfr_rt_exam.completed'`, `actor_role` subquery filtering `deleted_at IS NULL` (security.md rule 10).

The only fundamentally new piece is the **grader** — a SECURITY DEFINER RPC that normalizes string answers, compares them to canonical+synonyms lists, and computes per-part scores. Everything else (timer, freeze, sampling, audit, discard-protection, RLS) is a near-copy of `internal_exam`'s shape.

## Steering Document Alignment

### Technical Standards (`tech.md`)

- **Mutation pattern**: Server Actions only (no API routes) for `submitVfrRtExam` and `startVfrRtExam` (names match the architecture diagram and the Components section below). `code-style.md` §6.
- **RPC requirements**: every new RPC SECURITY DEFINER, `SET search_path = public`, explicit `auth.uid()` check, every soft-deletable SELECT includes `deleted_at IS NULL` (`security.md` §9, §10).
- **Migration size**: each migration ≤ 300 lines per `code-style.md` §1; complex changes split across multiple files.
- **TypeScript**: discriminated unions for the question-type Zod schemas; no `any`; runtime `Array.isArray` guards on RPC results that arrive as `unknown[]`.
- **Mirror migrations**: every `packages/db/migrations/0NN_*.sql` has a byte-identical mirror at `supabase/migrations/<timestamp>_*.sql` (per repo convention, verified for migs 049, 060, 063, 079, 081).

### Project Structure (`structure.md`)

- New route folder for the student exam: `apps/web/app/app/vfr-rt-exam/` (parallel to `apps/web/app/app/internal-exam/`).
- New route folder for admin VFR RT exam config (v1: read-only/listing): `apps/web/app/app/admin/vfr-rt-exam/` — only used if v1 ships exam-config UI; if the exam config is seeded and not admin-editable, this folder is skipped (defer to user choice during plan review).
- New constants module: `apps/web/lib/constants/exam-modes.ts` — extend the existing `EXAM_MODES` array + `MODE_LABELS` map to include `'vfr_rt_exam'`.
- New helper module: `apps/web/lib/grading/normalize-answer.ts` — single-purpose pure function; co-located unit tests `normalize-answer.test.ts`.
- Migrations: `packages/db/migrations/094..103_*.sql` + matching timestamped mirrors in `supabase/migrations/`. Slots through `093` are already taken as of 2026-06-10; the `#611` score-forgery fix shipped as `supabase/migrations/20260605000001_quiz_sessions_student_update_column_grant.sql` (a column-level REVOKE/GRANT, not a sequential `packages/db` migration).

## Code Reuse Analysis

### REUSE — no edit

| File | How |
|---|---|
| `quiz_sessions` table | Same table, new `mode` enum value. Existing `config.question_ids` JSONB pattern carries the frozen IDs. |
| `quiz_session_answers` for MC answers | Existing CHECK on `selected_option_id IN ('a','b','c','d')` continues to apply to Part 3 rows. |
| `student_responses` for MC answers | Same shape. Part 3 rows insert as today. |
| `audit_events` | Same INSERT pattern. New `event_type` values: `'vfr_rt_exam.started'`, `'vfr_rt_exam.completed'`, `'vfr_rt_exam.expired'` (mirrors the existing `internal_exam.expired` / `exam.expired` naming from mig 063 lines 112–115; do NOT use a descriptive variant like `overdue_auto_completed` that breaks the `<mode>.expired` audit-grep pattern). |
| `get_quiz_questions(p_question_ids)` for Part 3 | Existing RPC handles MC questions unchanged. |
| `start_internal_exam_session`'s in-flight-resume guard | Logic copied verbatim into the new RPC. |
| `apps/web/app/app/internal-exam/page.tsx` patterns | Composition shape (timer + question card + nav) copied to `vfr-rt-exam/page.tsx`. |

### EXTEND in place — small, mode-aware change

| File | Change |
|---|---|
| `apps/web/lib/constants/exam-modes.ts` | Add `'vfr_rt_exam'` to `EXAM_MODES` array. Add `MODE_LABELS['vfr_rt_exam']` and `isExamMode()` already returns `true` for any string in the array — no separate branch. |
| `apps/web/app/app/quiz/actions/discard.ts` | Add `existing.mode === 'vfr_rt_exam'` to the existing `internal_exam` rejection branch. Return new error code `'cannot_discard_vfr_rt_exam'`. |
| `complete_overdue_exam_session` RPC (latest = `packages/db/migrations/063_extend_overdue_for_internal_exam.sql`; verify via Pre-Flag Verification at implementation time) | Widen the mode guard `IF v_mode NOT IN ('mock_exam','internal_exam')` (mig 063 L54 + L191) to also accept `'vfr_rt_exam'`, and extend the `v_event_type := CASE v_mode` branch (L112, L228, L234) to emit `'vfr_rt_exam.expired'`. There is no mode-based WHERE clause — the WHERE filters are scoped by `qs.id = p_session_id`. Audit-event INSERT pattern otherwise unchanged. |
| `apps/web/app/app/admin/questions/_components/question-form-fields.tsx` | Add type selector (segmented control) above the existing fields. Conditionally render either the existing 4-option editor, the short-answer field group, OR the dialog template editor. |
| `packages/db/src/schema.ts` `UpsertQuestionSchema` | Convert from a flat `z.object` to `z.discriminatedUnion('question_type', [multipleChoiceSchema, shortAnswerSchema, dialogFillSchema])`. |
| `packages/db/src/types.ts` | Regenerated after migrations; no manual edit. |

### FORK / NEW

| File | Why fork instead of extend |
|---|---|
| `start_vfr_rt_exam_session(p_subject_id uuid)` RPC | Separate from `start_internal_exam_session` because the sampling shape is different (per-question-type pools instead of per-topic distribution) AND there's no single-use code redemption step. Combining would tangle two concerns. |
| `submit_vfr_rt_exam_answers(p_session_id, p_answers jsonb)` RPC | Separate from `batch_submit_quiz` because the input shape (per-blank dialog answers, free-text short-answer strings) is incompatible with the MC `selected_option_id` payload. Both can coexist. |
| `apps/web/lib/grading/normalize-answer.ts` + co-located test | Pure utility module; isolated for testability. The same normalization runs server-side in SQL (as a plpgsql helper or inline expression) — kept in sync via integration tests. |

## Architecture

```mermaid
flowchart TD
    A[Student lands on /app/vfr-rt-exam] --> B{Active vfr_rt_exam session?}
    B -- yes --> C[Resume page: server reads quiz_sessions + quiz_session_answers]
    B -- no --> D[Briefing page with Start button]
    D -->|Server Action startVfrRtExam| E[start_vfr_rt_exam_session RPC]
    E -->|sample 8/9/8 by question_type| F[INSERT quiz_sessions mode='vfr_rt_exam', config.question_ids=[...]]
    F --> G[INSERT audit_events 'vfr_rt_exam.started']
    G --> C

    C --> H[Student answers, navigates, edits]
    H -->|Server Action submitVfrRtExam| I[submit_vfr_rt_exam_answers RPC]
    I --> J[For each answer: normalize + compare to canonical/synonyms server-side]
    J --> K[INSERT quiz_session_answers per question/blank]
    K --> L[INSERT student_responses per question/blank]
    L --> M[Compute part1/part2/part3 scores, passed_overall]
    M --> N[UPDATE quiz_sessions ended_at, correct_count, score_percentage, passed]
    N --> O[INSERT audit_events 'vfr_rt_exam.completed']
    O --> P[Redirect to /app/vfr-rt-exam/results/:session_id]

    C -.timer expires.-> Q[complete_overdue_exam_session widened to vfr_rt_exam]
    Q --> M

    style A fill:#e1f5e1
    style I fill:#fef3c7
    style J fill:#fef3c7
    style P fill:#e1f5e1
```

### Modular Design Principles

- **Single File Responsibility**: every migration touches exactly one schema/function concern. Splitting the work across ~8 migrations (rather than one mega-mig) makes each one easier to review, roll back, and audit.
- **Component Isolation**: `vfr-rt-exam/page.tsx` ≤ 80 lines (composition); each Part-N renderer ≤ 150 lines; `dialog-fill-renderer.tsx` is the most complex new component and the one whose tests must cover the most edge cases (multi-line dialog, multiple blanks, speaker-tag stripping for display).
- **Service Layer Separation**: grading lives in the SQL RPC. The Server Action is a thin wrapper. The client never grades.
- **Utility Modularity**: `normalize-answer.ts` is a 1-function module with comprehensive unit tests; the SQL equivalent uses an inline `regexp_replace` chain (or a `normalize_answer(text)` plpgsql helper) and is covered by SQL integration tests asserting parity against the TS version.

## Components and Interfaces

### Migration `094_question_type_enum_and_column.sql` (+ timestamped mirror)

- Add `question_type` enum value space via TEXT + CHECK (matches existing `mode`/`status` pattern in the codebase):
  ```sql
  ALTER TABLE questions
    ADD COLUMN question_type TEXT NOT NULL DEFAULT 'multiple_choice'
      CHECK (question_type IN ('multiple_choice', 'short_answer', 'dialog_fill'));
  ```
- Add `canonical_answer TEXT NULL` (used by `short_answer`).
- Add `accepted_synonyms TEXT[] NOT NULL DEFAULT '{}'::TEXT[]` (used by `short_answer`).
- Add `dialog_template TEXT NULL` (used by `dialog_fill`; raw template with `[atc]`/`[pilot]` tags + `{{n|canonical; var1; var2}}` blanks).
- Add `blanks_config JSONB NOT NULL DEFAULT '[]'::JSONB` (used by `dialog_fill`; ordered array of `{ index: int, canonical: text, synonyms: text[] }`).
- **Add `DEFAULT '[]'::jsonb` to the existing `options` column** (`ALTER TABLE questions ALTER COLUMN options SET DEFAULT '[]'::jsonb`). The existing `options JSONB NOT NULL` constraint in `001_initial_schema.sql` has no default, so non-MC INSERTs would fail without this default. MC INSERTs continue to supply their own options array, unaffected.
- Add a CHECK constraint enforcing the type↔column contract (authoritative definition: `packages/db/migrations/094_question_type_enum_and_column.sql`; the block below is reference) — every branch must positively state which columns ARE and ARE NOT set, so accidental population (e.g. an admin form bug saving a `canonical_answer` on a `dialog_fill` question) is rejected at the database layer:
  ```sql
  CHECK (
    (question_type = 'multiple_choice'
       AND canonical_answer IS NULL
       AND accepted_synonyms = '{}'::TEXT[]
       AND dialog_template IS NULL
       AND jsonb_array_length(blanks_config) = 0)
    OR (question_type = 'short_answer'
       AND canonical_answer IS NOT NULL
       AND dialog_template IS NULL
       AND jsonb_array_length(blanks_config) = 0)
    OR (question_type = 'dialog_fill'
       AND canonical_answer IS NULL
       AND accepted_synonyms = '{}'::TEXT[]
       AND dialog_template IS NOT NULL
       AND jsonb_array_length(blanks_config) > 0)
  );
  ```
- Index on `(question_type, subject_id) WHERE deleted_at IS NULL AND status = 'active'` — supports the sampler's `WHERE question_type = X AND subject_id = Y` filter.
- **Column-level SELECT REVOKE/GRANT for the four answer-key columns** (`canonical_answer`, `accepted_synonyms`, `dialog_template`, `blanks_config` — `dialog_template` is included because its raw `{{n|canonical;syn}}` tokens embed the canonicals). The `tenant_isolation` RLS policy on `questions` (initial schema) is org-scoped, not role-scoped — a same-org **student** passes it, so without a privilege-layer gate a student's direct PostgREST `SELECT` would read the answer key. RLS cannot express column restrictions; use the #611 pattern (`supabase/migrations/20260605000001_quiz_sessions_student_update_column_grant.sql`): `REVOKE SELECT ON questions FROM authenticated;` then `GRANT SELECT (id, organization_id, bank_id, subject_id, topic_id, subtopic_id, lo_reference, question_number, question_text, question_image_url, options, explanation_text, explanation_image_url, difficulty, status, version, question_type, created_by, deleted_at, deleted_by, created_at, updated_at) ON questions TO authenticated;` — every existing column plus `question_type`, EXCEPT the four key columns. Verify the column list against the live table at implementation time (`\d questions`).
  - Consequence: any `select('*')`/`select=*` on `questions` from an `authenticated` client (admin OR student) now fails with `42501`. **A.1 includes a call-site audit**: grep every `.from('questions')` in `apps/web/` and confirm each uses an explicit column list that excludes the revoked columns (known sites: `apps/web/lib/queries/quiz-report-questions.ts`, `apps/web/app/app/admin/questions/queries.ts`, admin question actions).
  - Admin authoring reads of the four columns go through the `is_admin()`-gated RPC in mig `094b` — admins share the `authenticated` role, so the column REVOKE blocks them too by design.
  - The pre-existing exposure of `options[].correct` (the MC answer key inside the `options` JSONB, which column grants cannot reach) is a **platform-wide issue tracked separately** — out of scope here; do NOT attempt to fix it in this migration.

### Migration `094b_get_question_authoring_fields_rpc.sql`

- **Companion to mig 094's column REVOKE** — the admin question editor must read the four revoked answer-key columns to edit existing `short_answer`/`dialog_fill` questions, and direct PostgREST SELECT is now privilege-blocked for the `authenticated` role.
- `CREATE OR REPLACE FUNCTION get_question_authoring_fields(p_question_id uuid) RETURNS TABLE (canonical_answer text, accepted_synonyms text[], dialog_template text, blanks_config jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public`.
- Guards: `auth.uid()` NULL check; `is_admin()` check (RAISE if false); row scoped `WHERE id = p_question_id AND organization_id = (SELECT organization_id FROM users WHERE id = auth.uid() AND deleted_at IS NULL) AND deleted_at IS NULL` (security.md §7, §9).
- Consumed only by the Phase D admin editor (`apps/web/app/app/admin/questions/`); student code never calls it.

### Migration `095_quiz_session_answers_for_text_responses.sql`

- Add `response_text TEXT NULL` to `quiz_session_answers` and to `student_responses`.
- Add `blank_index INT NULL` to both tables (NULL for MC and short_answer; 0..N-1 for dialog_fill blanks).
- Make `selected_option_id` nullable (`ALTER COLUMN selected_option_id DROP NOT NULL`). The existing `CHECK (selected_option_id IN ('a','b','c','d'))` is satisfied by NULL automatically (Postgres CHECK constraints pass when the expression evaluates to TRUE or UNKNOWN; NULL operands produce UNKNOWN, which passes — the constraint fails only on FALSE) — **do NOT drop the existing CHECK; it continues to protect MC rows from invalid option letters**.
- **Add (do not replace) a discriminator CHECK on BOTH tables** (`quiz_session_answers` AND `student_responses`):
  ```sql
  -- Exactly one of (selected_option_id, response_text) must be set per row.
  -- blank_index is non-null only for dialog_fill (response_text set, selected_option_id NULL).
  -- blank_index must be non-negative (rejects accidental negative indices that inflate unique counts).
  CHECK (
    (selected_option_id IS NOT NULL AND response_text IS NULL AND blank_index IS NULL)
    OR (selected_option_id IS NULL AND response_text IS NOT NULL
        AND (blank_index IS NULL OR blank_index >= 0))
  );
  ```
- **UNIQUE widening — must NOT break the existing `ON CONFLICT (session_id, question_id)` callers, AND must widen on BOTH tables** (`quiz_session_answers` and `student_responses`). Both carry a `UNIQUE (session_id, question_id)` constraint today — `quiz_session_answers` since mig `001`, `student_responses` since `supabase/migrations/20260313000020_fix_student_responses_unique.sql` (constraint name `student_responses_session_question_unique`). `batch_submit_quiz` (latest body as of 2026-06-10: `supabase/migrations/20260601000001_align_batch_submit_audit_metadata_keys.sql` — re-verify via Pre-Flag Verification at implementation time) and `submit_quiz_answer` (latest body in `supabase/migrations/20260316000040_submit_answer_track_last_was_correct.sql`) both rely on the `quiz_session_answers` constraint via `ON CONFLICT (session_id, question_id) DO NOTHING`. The plan:
  1. **Drop the old constraint on each table** (`UNIQUE (session_id, question_id)` on `quiz_session_answers`, `student_responses_session_question_unique` on `student_responses`).
  2. **Add a new composite constraint with `NULLS NOT DISTINCT` on each table** (Supabase runs Postgres 17 per `supabase/config.toml`; `NULLS NOT DISTINCT` is supported):
     ```sql
     ALTER TABLE quiz_session_answers
       ADD CONSTRAINT quiz_session_answers_session_question_blank_uniq
       UNIQUE NULLS NOT DISTINCT (session_id, question_id, blank_index);

     ALTER TABLE student_responses
       ADD CONSTRAINT student_responses_session_question_blank_uniq
       UNIQUE NULLS NOT DISTINCT (session_id, question_id, blank_index);
     ```
     With `NULLS NOT DISTINCT`, a row `(s1, q1, NULL)` inserted twice raises a conflict — preserving the original semantics for MC/short_answer rows where `blank_index IS NULL`. Without this widening on `student_responses`, every dialog_fill submission with 2+ blanks would fail at the second `student_responses` INSERT.
  3. **Update the TWO `quiz_session_answers` callers** (see migs `095b`/`095c` below) to use `ON CONFLICT (session_id, question_id, blank_index) DO NOTHING` — `batch_submit_quiz` and `submit_quiz_answer`. (CORRECTED 2026-06-10 during implementation: an earlier revision claimed a third caller, `complete_quiz_session`, citing the `ON CONFLICT` at line ~259 of `20260406000004_populate_last_active_at.sql` — function-boundary tracing shows `complete_quiz_session` spans L21–97 of that file and inserts only into `audit_events`; L259 sits inside the `batch_submit_quiz` body the same file redefines, itself superseded by `20260601000001`. A repo-wide grep confirms every `INSERT INTO quiz_session_answers` lives inside a `batch_submit_quiz` or `submit_quiz_answer` body.) The `batch_submit_quiz` INSERT into `student_responses` uses bare `ON CONFLICT DO NOTHING` (no column list — see `packages/db/migrations/078` line 212) and works with any constraint; no update needed there.
  4. **`student_responses.blank_index` for legacy callers.** `student_responses` gains the same `blank_index INT NULL` column in mig `095`. `batch_submit_quiz`'s existing INSERT into `student_responses` does NOT supply `blank_index` in its column list (mig `078` line ~208 inserts `organization_id, student_id, question_id, session_id, selected_option_id, is_correct, response_time_ms` — no `blank_index`). Postgres applies the column's NULL default, so legacy rows land with `blank_index = NULL` — semantically correct for MC/short_answer (which is all `batch_submit_quiz` writes) AND compatible with the new `UNIQUE NULLS NOT DISTINCT (session_id, question_id, blank_index)` constraint (since `NULL = NULL` under that mode, the constraint treats `(s, q, NULL)` exactly as the old `(s, q)` did). No mig 095b update to the `student_responses` INSERT is required. New callers writing dialog_fill rows (the VFR RT submit RPC in mig `100`) explicitly populate `blank_index` for each blank.
- Index on `(session_id, question_id, blank_index)` for resume reads (the constraint on each table produces a backing index automatically; no separate explicit index needed).

### Migrations `095b_update_existing_inserters_for_blank_index.sql` + `095c_update_batch_submit_quiz_for_blank_index.sql`

- **CRITICAL companions to mig `095`.** Without them, applying mig `095` immediately breaks `batch_submit_quiz` and `submit_quiz_answer` for ALL exam modes (PPL mock_exam, internal_exam, smart_review, quick_quiz) — the old `ON CONFLICT (session_id, question_id)` clause no longer matches any constraint after mig `095` drops the original UNIQUE. Because the clause lives inside plpgsql bodies, the failure is **deferred to execution time** (`42P10`): `db reset` applies clean and nothing breaks until a student submits a quiz — exactly the deferred-validation trap documented in `code-style.md` §5 (`ON CONFLICT` Requires a UNIQUE Inference Target).
- **Two files, not one** (renamed from a single planned 095b): the verbatim `batch_submit_quiz` body alone is ~297 lines, so the two bodies cannot share a file under the 300-line cap. `095b` carries `submit_quiz_answer` (latest: `20260316000040`); `095c` carries `batch_submit_quiz` (latest: `20260601000001`). For each: locate LATEST via Pre-Flag Verification (`agent-critic.md`), copy body VERBATIM, change only the `quiz_session_answers` ON CONFLICT clause from `(session_id, question_id)` to `(session_id, question_id, blank_index)`. The `fsrs_cards` `ON CONFLICT (student_id, question_id)` clauses in both bodies target a different table — untouched.
- `complete_quiz_session` needs NO redefinition (see mig 095 item 3 correction) — but A.11 still EXECUTES it against the widened constraint as a regression test.
- These functions continue to INSERT only MC/short-answer rows (no `blank_index`); the new ON CONFLICT inference matches the new constraint, NULL = NULL by `NULLS NOT DISTINCT` semantics — behavior is preserved.
- **095, 095b, and 095c apply in the same release.** They cannot be split across deploys; the schema and the callers must move together.

### Migration `096_quiz_sessions_mode_vfr_rt.sql`

- Widen the `quiz_sessions.mode` CHECK to include `'vfr_rt_exam'`. The constraint was named `quiz_sessions_mode_check` by mig `058`, so a simple DROP + ADD pattern suffices — no DO-block lookup needed:
  ```sql
  ALTER TABLE public.quiz_sessions DROP CONSTRAINT quiz_sessions_mode_check;
  ALTER TABLE public.quiz_sessions ADD CONSTRAINT quiz_sessions_mode_check
    CHECK (mode IN ('smart_review', 'quick_quiz', 'mock_exam', 'internal_exam', 'vfr_rt_exam'));
  ```

### Migration `097_seed_vfr_rt_subject_and_topics.sql`

- INSERT one `easa_subjects` row: `code='RT', name='VFR Radiotelephony (Slovenia)', short='RT', sort_order=...`. Use `ON CONFLICT (code) DO NOTHING` — `easa_subjects` has `UNIQUE(code)` (mig 001).
- INSERT three `easa_topics` rows under that subject: codes `'P1_ACRONYMS'`, `'P2_DIALOG'`, `'P3_MC'`, names matching the briefing PDF parts.
- For the topics INSERT use `ON CONFLICT (subject_id, code) DO NOTHING` — `easa_topics` has `UNIQUE (subject_id, code)`, NOT `UNIQUE(code)` alone (mig 001 line 67). A bare `ON CONFLICT (code)` would fail at migration time with "there is no unique or exclusion constraint matching the ON CONFLICT specification". Resolve the subject's UUID first via a CTE or via `(SELECT id FROM easa_subjects WHERE code = 'RT')` subquery in each topic INSERT.
- No subtopics in v1.
- (Questions themselves are NOT inserted via migration — those are admin-authored via the editor or bulk-imported separately; the migration creates the syllabus skeleton.)

### Migration `098_exam_configs_parts_config.sql`

- Add `parts_config JSONB NOT NULL DEFAULT '{}'::JSONB` to `exam_configs`.
- Document the shape via `COMMENT ON COLUMN exam_configs.parts_config IS '...'`: `{ part1: { topic_code: text, count: int }, part2: { topic_code: text, count: int }, part3: { topic_code: text, count: int } }`.
- Existing rows have empty `{}`; they continue to work with the existing `mock_exam` flow which doesn't read `parts_config`.
- **The migration does NOT seed any `exam_configs` row.** Per-org `exam_configs` rows are tenant-scoped (organization_id is part of the UNIQUE key) — the migration runs once at the database level and can't pick the right org-specific UUIDs without conditional logic that's brittle across environments. Instead, seeding the VFR RT exam config for a given org is a **post-deploy ops step**: a small TypeScript script (or one-off SQL run via the Supabase SQL editor) executed once per org that needs VFR RT enabled. Document the seed SQL inline in the migration as a `-- POST-DEPLOY SEED EXAMPLE (do not auto-run):` comment block so ops can copy-paste. The RPC in mig 099 REQUIRES an enabled `exam_configs` row (it raises `exam_config_required` otherwise — see mig 099 step 3); its hardcoded 8/9/8 defaults cover an empty or partial `parts_config` on that row. The post-deploy seed is therefore what enables the feature for an org; a non-empty `parts_config` is only needed to override the defaults. (CORRECTED 2026-06-10: an earlier revision said the defaults "work even when no row is inserted", conflating row-presence with field-presence.)

### Migration `099_start_vfr_rt_exam_session_rpc.sql`

- `CREATE OR REPLACE FUNCTION start_vfr_rt_exam_session(p_subject_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`.
- Body sequence (mirrors `start_internal_exam_session` mig 060):
  1. `v_student_id := auth.uid();` — `IF NULL RAISE 'not_authenticated';`
  2. `v_org_id := (SELECT organization_id FROM users WHERE id = v_student_id AND deleted_at IS NULL);` — `IF NULL RAISE 'user_not_found_or_inactive';` (security.md §9)
  3. Fetch `exam_configs` row for `(v_org_id, p_subject_id) WHERE enabled = true AND deleted_at IS NULL` (the soft-delete filter is mandatory per `security.md` §9); `IF NOT FOUND RAISE 'exam_config_required';` (matches the existing error code used by `start_internal_exam_session` and `issue_internal_exam_code` — see mig 060 line 107, mig 059 line 73; intentionally reused so the Server Action error-mapping pattern stays consistent across exam modes).
  4. Auto-complete in-flight + overdue: `PERFORM complete_overdue_exam_session(...)` for this student.
  5. Check for an active `vfr_rt_exam` for this student — if found, return its current state (idempotent resume).
  6. Sample 8 `short_answer` IDs from the VFR RT subject's Part 1 topic (`question_type = 'short_answer' AND topic_id = <P1>` ordered by `random()`).
  7. Sample 9 `dialog_fill` IDs from Part 2 topic. Sample 8 `multiple_choice` IDs from Part 3 topic.
  8. `IF v_p1_count < 8 OR v_p2_count < 9 OR v_p3_count < 8 RAISE 'insufficient_questions_for_vfr_rt_exam' USING DETAIL = jsonb_build_object('p1_have', v_p1_count, 'p2_have', v_p2_count, 'p3_have', v_p3_count)::text;`
  9. Build the flat `question_ids` array preserving Part-1, Part-2, Part-3 order; set `parts = {p1_end: 8, p2_end: 17, p3_end: 25}`.
  10. INSERT `quiz_sessions` with `mode = 'vfr_rt_exam'`, `subject_id = p_subject_id`, `config = jsonb_build_object('question_ids', v_ids, 'parts', v_parts)`, `time_limit_seconds = 1800`, `total_questions = 25`.
  11. INSERT `audit_events` row `'vfr_rt_exam.started'`. The `actor_role` subquery on `users` filters `deleted_at IS NULL` (security.md §10).
  12. RETURN `jsonb_build_object('session_id', ..., 'question_ids', v_ids, 'time_limit_seconds', 1800, 'parts', v_parts, 'started_at', now())`.

### Migration `099b_get_vfr_rt_exam_questions_rpc.sql`

- **Required for Phase B/C** — without this, the only way to read VFR RT question data client-side is a direct PostgREST SELECT on `questions`, which exposes `canonical_answer`, `accepted_synonyms`, and `blanks_config` canonical strings to the client (security.md rule 1 violation).
- `CREATE OR REPLACE FUNCTION get_vfr_rt_exam_questions(p_question_ids uuid[]) RETURNS TABLE (...) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public`.
- Returns shape per row:
  - `id uuid`, `question_type text`, `question_text text`, `question_image_url text`
  - `subject_code text`, `topic_code text` (so the client can group by part)
  - `difficulty text`, `question_number text`, `explanation_text text` (hidden until post-submit), `explanation_image_url text`
  - For `multiple_choice` rows: `options` projected via the existing stripped pattern (id + text only, ORDER BY random()).
  - For `short_answer` rows: `options = NULL`, `dialog_template = NULL`, `blanks_safe = NULL`.
  - For `dialog_fill` rows: `options = NULL`, `dialog_template` returned with the `{{n|canonical;...}}` tokens REPLACED by `{{n}}` plain markers (so the client can position blanks without ever seeing canonical answers), and `blanks_safe jsonb` = `[{ index: int }]` (canonicals + synonyms stripped). Token rewriting uses `regexp_replace(dialog_template, '\{\{(\d+)\|[^}]*\}\}', '{{\1}}', 'g')`.
- **Never returns**: `canonical_answer`, `accepted_synonyms`, `blanks_config` (raw form with canonicals), or any `correct` flag on options.
- Auth check: `auth.uid()` not null + `users.deleted_at IS NULL`. Soft-delete filter on the questions SELECT (`questions.deleted_at IS NULL`).
- The `p_question_ids` argument carries the same immutable-write-once exception as `batch_submit_quiz` reading `quiz_sessions.config.question_ids` — see `docs/security.md §15`.
- This is a sibling to `get_quiz_questions` (which is preserved unchanged for the MC-only callers). Two RPCs coexist: the existing one for backward compatibility with `mock_exam` / `internal_exam` / `smart_review` / `quick_quiz`, and this one for `vfr_rt_exam`. Future modes with mixed types call this one.

### Migration `100_submit_vfr_rt_exam_answers_rpc.sql`

- `CREATE OR REPLACE FUNCTION submit_vfr_rt_exam_answers(p_session_id uuid, p_answers jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`.
- Input shape:
  ```jsonb
  [
    { "question_id": uuid, "selected_option_id": "a"|"b"|"c"|"d" },  // Part 3 MC
    { "question_id": uuid, "response_text": "Aircraft" },              // Part 1 short_answer
    { "question_id": uuid, "blank_index": 0, "response_text": "S5-ABC" },  // Part 2 dialog_fill
    ...
  ]
  ```
- Body sequence:
  1. Auth check (security.md §7).
  2. SELECT the session FOR UPDATE; check ownership, mode='vfr_rt_exam', `deleted_at IS NULL`.
  3. Idempotency: when `ended_at IS NOT NULL` the call becomes a pure re-read — a `v_already_ended` flag skips the answer-INSERT loop, session UPDATE, and audit INSERT; per-part percentages are recomputed from the persisted `quiz_session_answers` rows and `correct_count`/`passed` are re-read from the session row, returning the prior result with no writes (mig 100 body — no early RETURN; the recompute-from-rows path is the single source of truth).
  3b. Timer-expiry guard (ADDED 2026-06-10 — pattern parity with `batch_submit_quiz`, `20260601000001` L99–115): `IF time_limit_seconds IS NOT NULL AND started_at IS NOT NULL AND now() > started_at + (time_limit_seconds + 30) * interval '1 second'` (both columns are nullable — null guards per the blueprint, see mig 100 body) THEN mark the session expired instead of grading — UPDATE `ended_at = now(), correct_count = 0, score_percentage = 0, passed = false`, INSERT `'vfr_rt_exam.expired'` audit event, RETURN the expired result shape. Without this, a student could hold the submit past the 30-minute limit indefinitely (the overdue sweep is lazy); Error Scenario 3's "next request is intercepted" promise requires it.
  4. Validate input: every entry's `question_id` MUST be in `config.question_ids`; reject extraneous IDs.
  5. For each entry, look up the question's `question_type`, `canonical_answer`, `accepted_synonyms` (short_answer), `options` (MC), or `blanks_config` (dialog_fill).
  6. Score per entry using the same `normalize_answer(text)` helper as the TS module (defined in this migration or in a sibling `09X_normalize_answer_fn.sql`).
  7. INSERT one `quiz_session_answers` row per entry (per blank for dialog_fill).
  8. INSERT one `student_responses` row per entry.
  9. Compute per-part scores: Part 1 = correct_short_answers / 8 × 100, Part 2 = mean(task_scores) × 100 where task_score = correct_blanks / total_blanks per question, Part 3 = correct_mc / 8 × 100.
  10. `passed_overall := (p1 >= 75 AND p2 >= 75 AND p3 >= 75)`.
  11. UPDATE `quiz_sessions` SET `ended_at = now()`, `correct_count = total_correct`, `score_percentage = mean(p1,p2,p3)` (informational; pass uses per-part), `passed = v_passed`.
  12. INSERT `audit_events` row `'vfr_rt_exam.completed'` with metadata `{ part1_pct, part2_pct, part3_pct, passed_overall, total_questions: 25 }`.
  13. RETURN `jsonb_build_object('session_id', ..., 'part1_pct', ..., 'part2_pct', ..., 'part3_pct', ..., 'passed_overall', ..., 'correct_count', ..., 'total_questions', 25)`.

### Migration `101_normalize_answer_helper.sql` (extracted because §1 cap)

- `CREATE OR REPLACE FUNCTION normalize_answer(text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE`.
- Logic mirrors `apps/web/lib/grading/normalize-answer.ts`:
  ```sql
  SELECT regexp_replace(
    regexp_replace(
      regexp_replace(
        lower(trim($1)),
        '[-_]+', ' ', 'g'
      ),
      '[][.,;:!?"''()]', '', 'g'
    ),
    '\s+', ' ', 'g'
  );
  ```
- Diacritics NOT folded — letters with diacritics survive `lower()` (we rely on Postgres UTF-8 default `lower` which preserves them for non-Turkish locales).
- **Deploy-time guard.** Open the migration with an assertion block that raises if the deployment's locale would fold diacritics — catches misconfiguration at apply time instead of at first failing exam grading. Error embeds both the offending value and the corrective action:
  ```sql
  DO $$
  BEGIN
    IF lower('Č') <> 'č' THEN
      RAISE EXCEPTION 'normalize_answer requires a UTF-8 locale that preserves diacritics. Current locale folds "Č" to "%". Use en_US.UTF-8 or C.UTF-8; check the database locale with: SHOW lc_ctype;', lower('Č');
    END IF;
  END $$;
  ```
  The runtime test at `A.11` covers the same contract from the test side; the migration-time assertion adds a deploy-time guarantee so a misconfigured environment fails to apply mig 101 rather than silently miscounting exam answers.

### Migration `102_extend_complete_overdue_exam_session.sql`

- `CREATE OR REPLACE FUNCTION complete_overdue_exam_session(...)` — copy the LATEST body verbatim per Pre-Flag Verification (`agent-critic.md` Pre-Flag Verification rule); add `'vfr_rt_exam'` to the `mode IN (...)` clause.
- The body for `vfr_rt_exam` overdue: same shape as `internal_exam` overdue — compute partial scores using the entries already in `quiz_session_answers` (default 0 for missing entries), update `ended_at`, set `passed` from per-part, emit `'vfr_rt_exam.expired'` audit event (matches the existing CASE branch shape in mig 063 lines 112–115).
- DO NOT widen mode checks in any other RPC unless this migration explicitly does so. Out of scope: `batch_submit_quiz`, `complete_quiz_session`.

### Migration `103_get_vfr_rt_exam_results_rpc.sql`

- **Required for Phase C results page.** Per-part percentages are NOT persisted on `quiz_sessions` (only the aggregate `score_percentage`), and the canonical answers needed for post-submit review are privilege-blocked for students (mig 094) and stripped by `get_vfr_rt_exam_questions` (mig 099b) unconditionally. A fresh load of `/app/vfr-rt-exam/results/<id>` therefore needs a dedicated read RPC. Precedent: `get_report_correct_options` (`supabase/migrations/20260316231503_report_correct_options_orderby_and_history.sql`) — the existing gated correct-answer reveal for MC reports.
- `CREATE OR REPLACE FUNCTION get_vfr_rt_exam_results(p_session_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public`.
- Guards, in order: `auth.uid()` NULL → RAISE `'not_authenticated'`; session fetch `WHERE id = p_session_id AND student_id = auth.uid() AND mode = 'vfr_rt_exam' AND deleted_at IS NULL AND ended_at IS NOT NULL` → not found RAISE `'Session not found, not owned, or not completed'` (exact wording — capital S — matches `get_report_correct_options` line 25, whose message is pinned by `rpc-report.spec.ts`). The explicit `student_id = auth.uid()` scope is mandatory: `quiz_sessions` has multiple permissive SELECT policies, so RLS alone over-scopes (security.md "Multiple Permissive RLS SELECT Policies" rule / `docs/security.md` §3).
- Returns: `jsonb_build_object('part1_pct', ..., 'part2_pct', ..., 'part3_pct', ..., 'passed_overall', ..., 'passed_per_part', ..., 'correct_count', ..., 'total_questions', 25, 'questions', [...])`. Per-part percentages are **recomputed** from `quiz_session_answers` JOIN `questions.question_type` using the same formulas as mig 100 (unanswered defaults to 0) — single source of truth, no per-part persistence needed.
- Each `questions[]` entry: `question_id`, `question_type`, `question_text`, the student's answer(s) (`selected_option_id`, or per-blank `response_text` + `blank_index`), per-row `is_correct`, and the **revealed key**: `canonical_answer` + `accepted_synonyms` (short_answer), per-blank `canonical` + `synonyms` from `blanks_config` (dialog_fill), the correct option id (multiple_choice). The reveal is safe ONLY because the `ended_at IS NOT NULL` guard above rejects every pre-completion call.
- The `questions` lookups go via the session's `config.question_ids` / the session's own `quiz_session_answers` rows — the immutable write-once exception applies (`docs/security.md` §15), and soft-deleted questions are still returned for completed sessions (historical-record posture, same as `getQuizReportQuestions`).

### Server Action `startVfrRtExam`

- File: `apps/web/app/app/vfr-rt-exam/actions/start.ts`.
- Zod input: `z.object({ subjectId: z.uuid() })`.
- Auth check via `requireStudent()` (existing helper).
- Calls `supabase.rpc('start_vfr_rt_exam_session', { p_subject_id: subjectId })`.
- Error mapping table:
  | RPC raise | Server Action error string |
  |---|---|
  | `not_authenticated` | `'Not authenticated'` |
  | `exam_config_required` | `'VFR RT mock exam is not enabled for your organization.'` |
  | `insufficient_questions_for_vfr_rt_exam` | `'The VFR RT question pool is incomplete. Please contact your instructor.'` (DETAIL is logged server-side only) |
  | any other | `'Failed to start exam'` |
- On success, **returns** `{ success: true, sessionId, questionIds, timeLimitSeconds, parts, startedAt }`; the calling client component navigates to `/app/vfr-rt-exam/in-progress/<id>` via `router.push`. (DEVIATION, user-approved 2026-06-19: the original design called for a server-side `revalidatePath` + `redirect()`, but no Server Action in this codebase uses `redirect()` — `start-exam.ts`/`start-internal-exam.ts` return the session and let the client navigate. Phase B follows that established pattern; auth uses inline `supabase.auth.getUser()`, not the non-existent `requireStudent()`.)

### Server Action `submitVfrRtExam`

- File: `apps/web/app/app/vfr-rt-exam/actions/submit.ts`.
- Zod input is the discriminated union of `{ sessionId, answers: VfrRtAnswersInput[] }` where `VfrRtAnswersInput = ShortAnswerEntry | DialogFillEntry | MultipleChoiceEntry`.
- Calls `supabase.rpc('submit_vfr_rt_exam_answers', ...)`.
- Returns `{ success: true, session_id, redirect_to: '/app/vfr-rt-exam/results/<id>' }`.

### Pages

| Path | Purpose | Lines |
|---|---|---|
| `apps/web/app/app/vfr-rt-exam/page.tsx` | Briefing + Start button OR resume in-progress (composition only) | ≤ 80 |
| `apps/web/app/app/vfr-rt-exam/in-progress/[sessionId]/page.tsx` | The exam UI; reads session + answers; renders `<VfrRtExamRunner>` | ≤ 80 |
| `apps/web/app/app/vfr-rt-exam/results/[sessionId]/page.tsx` | Per-part scores + review; Server Component reads `get_vfr_rt_exam_results` (mig 103); pre-completion/non-owner calls error → redirect to briefing page | ≤ 80 |
| `apps/web/app/app/vfr-rt-exam/_components/vfr-rt-exam-runner.tsx` | Timer + part nav + current-question shell | ≤ 150 |
| `apps/web/app/app/vfr-rt-exam/_components/short-answer-renderer.tsx` | Acronym + text input | ≤ 80 |
| `apps/web/app/app/vfr-rt-exam/_components/dialog-fill-renderer.tsx` | Renders the dialog with inline `<input>` per blank | ≤ 150 |
| `apps/web/app/app/vfr-rt-exam/_components/mc-renderer.tsx` | Same as existing MC renderer; can be the existing one imported directly | reuse |
| `apps/web/app/app/vfr-rt-exam/_components/part-progress.tsx` | 3-segment progress bar | ≤ 80 |
| `apps/web/app/app/vfr-rt-exam/_components/results-breakdown.tsx` | Per-part scores + per-question review | ≤ 150 |

### Constants

- `apps/web/lib/constants/exam-modes.ts`:
  - Add `'vfr_rt_exam'` to the `EXAM_MODES` tuple.
  - `MODE_LABELS['vfr_rt_exam'] = 'VFR RT Mock Exam'`.

### Utility

- `apps/web/lib/grading/normalize-answer.ts`:
  ```ts
  export function normalizeAnswer(input: string): string {
    return input
      .trim()
      .toLowerCase()
      .replace(/[-_]+/g, ' ')
      .replace(/[\][.,;:!?"'()]/g, '')
      .replace(/\s+/g, ' ')
  }
  ```
- Co-located test `normalize-answer.test.ts` covers: empty, all-whitespace, hyphenated, punctuation-heavy, diacritic-preserved cases.

### Admin question editor extension

- `apps/web/app/app/admin/questions/_components/question-form-fields.tsx`:
  - **Pre-refactor required:** the file is already at the 150-line component cap (`code-style.md` §1), so "extend in place" is not possible. First extract the existing 4-option MC editor into a new `mc-option-fields.tsx` (≤ 80 lines), THEN add the selector + conditional render to the slimmed-down parent.
  - Add a `<SegmentedControl>` at the top for `question_type`.
  - Conditional render: `multiple_choice` → `<McOptionFields>` (extracted); `short_answer` → new `<ShortAnswerFields>`; `dialog_fill` → new `<DialogFillFields>`.
  - **Edit flow data source:** when loading an existing `short_answer`/`dialog_fill` question, the four answer-key columns are privilege-blocked for direct PostgREST SELECT (mig 094) — the editor's Server Component fetches them via the `get_question_authoring_fields` RPC (mig 094b) and passes them down as props.
- New components co-located in `_components/`:
  - `short-answer-fields.tsx` (≤ 80 lines): canonical answer input + synonyms chip input.
  - `dialog-fill-fields.tsx` (≤ 150 lines): textarea for template + auto-parsed blanks preview with per-blank synonyms editor.
- `packages/db/src/schema.ts`:
  - Convert `UpsertQuestionSchema` to `z.discriminatedUnion('question_type', [...])`.
- `apps/web/app/app/admin/questions/actions/upsert-question.ts`:
  - Branch by `question_type` to populate the right columns; existing INSERT/UPDATE infrastructure unchanged.

## Data Models

### `questions` table — new columns (mig 094)

```
- question_type      TEXT NOT NULL DEFAULT 'multiple_choice'
    CHECK (question_type IN ('multiple_choice','short_answer','dialog_fill'))
- canonical_answer   TEXT NULL           -- short_answer only
- accepted_synonyms  TEXT[] NOT NULL DEFAULT '{}'
- dialog_template    TEXT NULL           -- dialog_fill only
- blanks_config      JSONB NOT NULL DEFAULT '[]'::jsonb
                       -- shape: [{index: int, canonical: text, synonyms: text[]}]
```

Plus a type↔column-population CHECK enforcing per-type validity.

### `quiz_session_answers` / `student_responses` — schema shift (mig 095)

- `selected_option_id` now NULLABLE.
- New: `response_text TEXT NULL`, `blank_index INT NULL`.
- XOR-style CHECK: exactly one of `selected_option_id` / `response_text` is set.
- Unique constraint widened to include `blank_index`.

### `quiz_sessions.config` jsonb shape (extended for vfr_rt_exam)

```jsonb
{
  "question_ids": ["uuid", ...],  // length 25; existing pattern
  "parts": { "p1_end": 8, "p2_end": 17, "p3_end": 25 }  // new; lets the UI slice
}
```

### `exam_configs.parts_config` jsonb (mig 098)

```jsonb
{
  "part1": { "topic_code": "P1_ACRONYMS", "count": 8 },
  "part2": { "topic_code": "P2_DIALOG",   "count": 9 },
  "part3": { "topic_code": "P3_MC",       "count": 8 }
}
```

v1: the RPC reads counts/topics from `parts_config` if present, else falls back to the briefing-package defaults (8/9/8 with the seeded topic codes). The defaults are baked into the RPC body so the system works even when the enabled `exam_configs` row carries an empty `parts_config` (the row itself is still required — the RPC raises `exam_config_required` without it).

## Error Handling

### Error Scenarios

| # | Scenario | Handling | User Impact |
|---|---|---|---|
| 1 | Student starts exam but VFR RT pool is short (e.g. only 5 acronyms exist) | RPC raises `insufficient_questions_for_vfr_rt_exam` with structured DETAIL; Server Action returns `'The VFR RT question pool is incomplete...'`; nothing is inserted. | Friendly error on the start page; no orphan session. |
| 2 | Network glitch mid-submission | RPC is atomic — either all answers + session-finalize commit, or nothing does. Idempotency check on retry returns the previously-computed result. | "Submit" retries safely; student sees results once. |
| 3 | Timer expires while student is still answering | The student's NEXT request (any RPC call) is intercepted; OR a background `complete_overdue_exam_session` invocation (cron / on-demand) auto-grades the session with whatever was saved. | Student sees the results page with partial answers graded. |
| 4 | Student tries to discard an in-progress vfr_rt_exam | `discard.ts` rejects with `'cannot_discard_vfr_rt_exam'`. | Discard button is hidden in the UI but server enforces independently. |
| 5 | Admin saves a `dialog_fill` question with malformed template | Zod refines parse — template token regex match required; on failure, form blocks submit with field-level error. | Inline form error before the save round-trip. |
| 6 | Submission RPC receives a `question_id` not in `config.question_ids` | RAISE `'invalid_question_id_for_session'`; nothing inserted. | "Failed to submit exam" generic message; server log has details. |
| 7 | Admin attempts to delete a question that's frozen in an active `vfr_rt_exam.config.question_ids` | No direct enforcement; the question continues to be referenced by frozen IDs even if `deleted_at` set. Existing pattern; `get_quiz_questions` will still return it because of the immutable-IDs exception (`security.md` §9). | No user-visible problem; the audit trail preserves the question content. |
| 8 | Student answer contains diacritic that admin forgot to add to synonyms | Answer scores 0. | Student loses the point. Admin is expected to author comprehensive synonym lists per the briefing PDF guidance. |

## Testing Strategy

### Unit Testing

- `apps/web/lib/grading/normalize-answer.test.ts` — comprehensive table of normalized vs raw pairs; diacritic-preservation case explicit.
- `apps/web/app/app/vfr-rt-exam/actions/start.test.ts` — Zod parse fail, auth fail, RPC error mapping (4 cases), success redirect URL assertion (per `code-style.md` §7 — `.toHaveBeenCalledWith('/app/vfr-rt-exam/in-progress/<uuid>')`).
- `apps/web/app/app/vfr-rt-exam/actions/submit.test.ts` — Zod discriminated-union parse, idempotent re-submit, generic-error mapping.
- Admin editor component tests for each new type's form (with `userEvent` to fill, save, assert payload).
- `dialog-fill-renderer.test.tsx` — multi-blank rendering, edit propagates, no answer leaks to props (correct answers must not be in client bundle).
- `results-breakdown.test.tsx` — pass/fail badge with 3 parts at boundary values (74.9 → fail, 75.0 → pass).

### Integration Testing (SQL — `pnpm sql-tests`)

- `start_vfr_rt_exam_session` — happy path; not authenticated; user not in org; exam_config disabled; insufficient pool (per-part shortfalls); idempotent resume.
- `submit_vfr_rt_exam_answers` — happy path; idempotent re-submit; invalid question ID; partial answers (some blanks blank); per-part scoring at threshold boundaries.
- `complete_overdue_exam_session` (after mig 102) — vfr_rt_exam mode with partial answers; auto-grades and emits audit.
- `complete_quiz_session` / `batch_submit_quiz` / `submit_quiz_answer` (after migs 095+095b+095c) — re-submit idempotency still holds for every legacy mode (the ON CONFLICT inference must resolve against the widened constraint at **execution** time, not just apply time).
- `get_vfr_rt_exam_results` (mig 103) — not authenticated; not owner; session not completed (`ended_at IS NULL` → guard error, no key material in the response); completed session returns per-part percentages matching mig 100's computation AND the revealed canonicals; ≥2 distinct fixture outcomes (one passing, one per-part fail) per `code-style.md` §7 red-team RPC contract rule.
- `get_question_authoring_fields` (mig 094b) — admin happy path; student caller rejected; cross-org admin rejected; soft-deleted question rejected.
- **Column-grant regression** (mig 094) — an authenticated STUDENT's direct PostgREST `SELECT canonical_answer/accepted_synonyms/dialog_template/blanks_config FROM questions` fails with `42501`; the same student's SELECT of the granted columns (id, question_text, options, ...) still succeeds (report path unbroken).
- `normalize_answer(text)` parity test — same inputs → same outputs as the TS `normalizeAnswer()`.
- **Diacritic preservation test** — explicit machine-verifiable assertion: `SELECT normalize_answer('Č') = 'č'` (i.e. NOT `'c'`). Prevents accidental locale switch (e.g. `tr_TR` would fold Slovenian diacritics differently) from silently degrading grader accuracy.
- RLS: another student cannot SELECT this student's `vfr_rt_exam` session; another student cannot SELECT their `quiz_session_answers.response_text`.

### End-to-End Testing (Playwright)

- **Full lifecycle**: student starts exam → answers all 25 → submits → lands on results page → results match expected scores (`router.push` assertion: `'/app/vfr-rt-exam/results/<id>'`).
- **Refresh-resume**: student answers 5 questions → reload mid-exam → server-derived timer still ticking down → same 25 question IDs, same answers preserved (per `code-style.md` §7 reload-resume rule).
- **Timer auto-submit**: student answers 10 questions → simulated timer expiry → server auto-completes → student lands on results.
- **Discard blocked**: in-progress vfr_rt_exam → discard button hidden → direct Server Action call returns `'cannot_discard_vfr_rt_exam'`.
- **Per-part fail**: student gets 100% on Parts 1 & 3 but 60% on Part 2 → results show `passed_overall = false` and Part 2 flagged.
- **Admin authoring**: admin creates a short_answer, a dialog_fill, and an MC question via the editor → all three appear in the questions list with type badges.

### Red-team coverage (delta)

This spec touches `quiz_sessions`, `questions`, `quiz_session_answers`, `student_responses`, RLS-relevant RPCs. The orchestrator must run the red-team agent post-commit to map the new RPCs and column shifts against the existing `apps/web/e2e/redteam/` specs. The specific vectors to verify:
- Student can't read another student's `response_text` (RLS on `quiz_session_answers`).
- Student can't read `questions.canonical_answer` / `accepted_synonyms` / `dialog_template` / `blanks_config` via raw PostgREST. **NOTE (corrected 2026-06-10): RLS does NOT provide this** — the `tenant_isolation` policy on `questions` is org-scoped, so a same-org student passes it. The defense is mig 094's column-level `REVOKE`/`GRANT` (a same-org student's direct SELECT of any of the four key columns must fail `42501`). A new red-team vector + spec asserting exactly this (authenticated same-org student, NOT just unauth/cross-org) is part of this feature's red-team delta. The `get_quiz_questions()` and `get_vfr_rt_exam_questions()` RPCs must additionally NOT return canonical/synonyms. (The sibling pre-existing exposure — same-org students reading the MC answer key via `options[].correct`, which column grants cannot reach inside the JSONB — is tracked as a separate platform security issue, out of this spec's scope.)
- Direct UPDATE attempts on `quiz_sessions.score_percentage` / `passed` / `correct_count` / `ended_at` for a `vfr_rt_exam` session are blocked at the **privilege layer** by #611's column REVOKE/GRANT (`20260605000001`) — a student's direct PostgREST UPDATE fails with `42501 permission denied for column …`, NOT a trigger. **#611 is a prerequisite and is already shipped** (PR #752, closed 2026-06-05; recorded in `tasks.md § Prerequisites`). No interim per-mode trigger; #611 is the canonical fix for all exam modes including vfr_rt_exam.
- The `normalize_answer` helper does NOT execute user-supplied SQL (it uses parameter binding via `regexp_replace` chain).

---

*Cross-document references:* `requirements.md` R1–R6 + all NFRs map onto specific migrations/files above. Implementation order in `tasks.md` follows: Phase A (migs 094–103) → Phase B (Server Actions + grader util) → Phase C (Student UI) → Phase D (Admin editor) → Phase E (Tests + red-team).
