# Design Document — VFR RT Slovenia Mock Exam

## Overview

This design adds a new timed exam mode (`vfr_rt_exam`) to the LMS, two new `question_type` values (`short_answer` and `dialog_fill`) that coexist with the existing `multiple_choice` shape, a per-part scoring + ≥75%-per-part pass criterion grader, and an admin authoring UI tab for each new question type. v1 ships ONLY the mock-exam feature — course/enrollment refactor and per-part practice drills are deferred to a future spec. VFR RT content lives in a new `easa_subjects` row (seed-inserted), beside the existing PPL subjects; no `course_id` plumbing in v1.

The work reuses three proven patterns from existing modes:
- **Sampling + freeze-on-start** from `start_internal_exam_session` (mig `060`) — `random() LIMIT N` per part, IDs stored in `quiz_sessions.config.question_ids`.
- **Auto-complete on overdue** from `complete_overdue_exam_session` (mig `063`, last touched by `redteam-quiz-session-bugs`/#611's mig `082`) — extended to include the new mode in its WHERE clause.
- **Audit-event INSERT pattern** from every completion RPC since mig `049` — `event_type = 'vfr_rt_exam.completed'`, `actor_role` subquery filtering `deleted_at IS NULL` (security.md rule 10).

The only fundamentally new piece is the **grader** — a SECURITY DEFINER RPC that normalizes string answers, compares them to canonical+synonyms lists, and computes per-part scores. Everything else (timer, freeze, sampling, audit, discard-protection, RLS) is a near-copy of `internal_exam`'s shape.

## Steering Document Alignment

### Technical Standards (`tech.md`)

- **Mutation pattern**: Server Actions only (no API routes) for `submitVfrRtExamAnswers` and `startVfrRtExamSession`. `code-style.md` §6.
- **RPC requirements**: every new RPC SECURITY DEFINER, `SET search_path = public`, explicit `auth.uid()` check, every soft-deletable SELECT includes `deleted_at IS NULL` (`security.md` §9, §10).
- **Migration size**: each migration ≤ 300 lines per `code-style.md` §1; complex changes split across multiple files.
- **TypeScript**: discriminated unions for the question-type Zod schemas; no `any`; runtime `Array.isArray` guards on RPC results that arrive as `unknown[]`.
- **Mirror migrations**: every `packages/db/migrations/0NN_*.sql` has a byte-identical mirror at `supabase/migrations/<timestamp>_*.sql` (per repo convention, verified for migs 049, 060, 063, 079, 081).

### Project Structure (`structure.md`)

- New route folder for the student exam: `apps/web/app/app/vfr-rt-exam/` (parallel to `apps/web/app/app/internal-exam/`).
- New route folder for admin VFR RT exam config (v1: read-only/listing): `apps/web/app/app/admin/vfr-rt-exam/` — only used if v1 ships exam-config UI; if the exam config is seeded and not admin-editable, this folder is skipped (defer to user choice during plan review).
- New constants module: `apps/web/lib/constants/exam-modes.ts` — extend the existing `EXAM_MODES` array + `MODE_LABELS` map to include `'vfr_rt_exam'`.
- New helper module: `apps/web/lib/grading/normalize-answer.ts` — single-purpose pure function; co-located unit tests `normalize-answer.test.ts`.
- Migrations: `packages/db/migrations/083..091_*.sql` + matching timestamped mirrors in `supabase/migrations/`. Slot 082 is already claimed by `redteam-quiz-session-bugs` T2.2 (issue #611, `082_quiz_sessions_immutable_score_columns.sql`).

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
| `complete_overdue_exam_session` RPC (latest = `packages/db/migrations/063_extend_overdue_for_internal_exam.sql`; verify via Pre-Flag Verification at implementation time) | Widen the WHERE clause to include `mode IN ('mock_exam','internal_exam','vfr_rt_exam')`. Audit-event INSERT pattern unchanged. |
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

### Migration `083_question_type_enum_and_column.sql` (+ timestamped mirror)

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
- Add a CHECK constraint enforcing the type↔column contract:
  ```sql
  CHECK (
    (question_type = 'multiple_choice' AND canonical_answer IS NULL AND dialog_template IS NULL)
    OR (question_type = 'short_answer' AND canonical_answer IS NOT NULL AND dialog_template IS NULL)
    OR (question_type = 'dialog_fill' AND dialog_template IS NOT NULL AND jsonb_array_length(blanks_config) > 0)
  );
  ```
- Index on `(question_type, subject_id) WHERE deleted_at IS NULL AND status = 'active'` — supports the sampler's `WHERE question_type = X AND subject_id = Y` filter.

### Migration `084_quiz_session_answers_for_text_responses.sql`

- Add `response_text TEXT NULL` to `quiz_session_answers` and to `student_responses`.
- Add `blank_index INT NULL` to both tables (NULL for MC and short_answer; 0..N-1 for dialog_fill blanks).
- Make `selected_option_id` nullable (`ALTER COLUMN selected_option_id DROP NOT NULL`). The existing `CHECK (selected_option_id IN ('a','b','c','d'))` is satisfied by NULL automatically (Postgres CHECKs evaluate to true when any operand is NULL) — **do NOT drop the existing CHECK; it continues to protect MC rows from invalid option letters**.
- **Add (do not replace) a discriminator CHECK on BOTH tables** (`quiz_session_answers` AND `student_responses`):
  ```sql
  -- Exactly one of (selected_option_id, response_text) must be set per row.
  -- blank_index is non-null only for dialog_fill (response_text set, selected_option_id NULL).
  CHECK (
    (selected_option_id IS NOT NULL AND response_text IS NULL AND blank_index IS NULL)
    OR (selected_option_id IS NULL AND response_text IS NOT NULL)
  );
  ```
- **UNIQUE widening — must NOT break the existing `ON CONFLICT (session_id, question_id)` callers, AND must widen on BOTH tables** (`quiz_session_answers` and `student_responses`). Both carry a `UNIQUE (session_id, question_id)` constraint today — `quiz_session_answers` since mig `001`, `student_responses` since `supabase/migrations/20260313000020_fix_student_responses_unique.sql` (constraint name `student_responses_session_question_unique`). `batch_submit_quiz` (latest body in `supabase/migrations/20260430000012_active_user_gate_batch_submit.sql`) and `submit_quiz_answer` (latest body in `supabase/migrations/20260316000040_submit_answer_track_last_was_correct.sql`) both rely on the `quiz_session_answers` constraint via `ON CONFLICT (session_id, question_id) DO NOTHING`. The plan:
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
  3. **Update the two `quiz_session_answers` callers** (see mig `084b` below) to use `ON CONFLICT (session_id, question_id, blank_index) DO NOTHING`. The `batch_submit_quiz` INSERT into `student_responses` uses bare `ON CONFLICT DO NOTHING` (no column list — see `packages/db/migrations/078` line 216) and works with any constraint; no update needed there.
- Index on `(session_id, question_id, blank_index)` for resume reads (the constraint on each table produces a backing index automatically; no separate explicit index needed).

### Migration `084b_update_existing_inserters_for_blank_index.sql`

- **CRITICAL companion to mig `084`.** Without this migration, applying mig `084` immediately breaks `batch_submit_quiz` and `submit_quiz_answer` for ALL exam modes (PPL mock_exam, internal_exam, smart_review, quick_quiz) — the old `ON CONFLICT (session_id, question_id)` clause no longer matches any constraint after mig `084` drops the original UNIQUE.
- `CREATE OR REPLACE FUNCTION batch_submit_quiz(...)` — locate LATEST via Pre-Flag Verification (`agent-critic.md`), copy body VERBATIM, change only the ON CONFLICT clause from `(session_id, question_id)` to `(session_id, question_id, blank_index)`. Same change applied to the `submit_quiz_answer` body.
- These functions continue to INSERT only MC/short-answer rows (no `blank_index`); the new ON CONFLICT inference matches the new constraint, NULL = NULL by `NULLS NOT DISTINCT` semantics — behavior is preserved.
- **Both 084 and 084b apply in the same release.** They cannot be split across deploys; the schema and the callers must move together.

### Migration `085_quiz_sessions_mode_vfr_rt.sql`

- Widen the `quiz_sessions.mode` CHECK to include `'vfr_rt_exam'`. The constraint was named `quiz_sessions_mode_check` by mig `058`, so a simple DROP + ADD pattern suffices — no DO-block lookup needed:
  ```sql
  ALTER TABLE public.quiz_sessions DROP CONSTRAINT quiz_sessions_mode_check;
  ALTER TABLE public.quiz_sessions ADD CONSTRAINT quiz_sessions_mode_check
    CHECK (mode IN ('smart_review', 'quick_quiz', 'mock_exam', 'internal_exam', 'vfr_rt_exam'));
  ```

### Migration `086_seed_vfr_rt_subject_and_topics.sql`

- INSERT one `easa_subjects` row: `code='RT', name='VFR Radiotelephony (Slovenia)', short='RT', sort_order=...`. Use `ON CONFLICT (code) DO NOTHING` — `easa_subjects` has `UNIQUE(code)` (mig 001).
- INSERT three `easa_topics` rows under that subject: codes `'P1_ACRONYMS'`, `'P2_DIALOG'`, `'P3_MC'`, names matching the briefing PDF parts.
- For the topics INSERT use `ON CONFLICT (subject_id, code) DO NOTHING` — `easa_topics` has `UNIQUE (subject_id, code)`, NOT `UNIQUE(code)` alone (mig 001 line 67). A bare `ON CONFLICT (code)` would fail at migration time with "there is no unique or exclusion constraint matching the ON CONFLICT specification". Resolve the subject's UUID first via a CTE or via `(SELECT id FROM easa_subjects WHERE code = 'RT')` subquery in each topic INSERT.
- No subtopics in v1.
- (Questions themselves are NOT inserted via migration — those are admin-authored via the editor or bulk-imported separately; the migration creates the syllabus skeleton.)

### Migration `087_exam_configs_parts_config.sql`

- Add `parts_config JSONB NOT NULL DEFAULT '{}'::JSONB` to `exam_configs`.
- Document the shape: `{ part1: { topic_code: text, count: int }, part2: { topic_code: text, count: int }, part3: { topic_code: text, count: int } }`.
- Existing rows have empty `{}`; they continue to work with the existing `mock_exam` flow which doesn't read `parts_config`.
- INSERT the VFR RT exam config (one row per org via a separate seed step, OR via the admin UI at deploy time; v1 default: seed via this migration scoped to a known org if testing locally, otherwise leave for ops to insert post-deploy).

### Migration `088_start_vfr_rt_exam_session_rpc.sql`

- `CREATE OR REPLACE FUNCTION start_vfr_rt_exam_session(p_subject_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`.
- Body sequence (mirrors `start_internal_exam_session` mig 060 + post-#611 hardening):
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

### Migration `088b_get_vfr_rt_exam_questions_rpc.sql`

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

### Migration `089_submit_vfr_rt_exam_answers_rpc.sql`

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
  3. Idempotency: `IF ended_at IS NOT NULL RETURN` prior result (read from `quiz_sessions.score_percentage` + per-part subqueries OR a session-scoped audit-events lookup).
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

### Migration `090_normalize_answer_helper.sql` (extracted because §1 cap)

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

### Migration `091_extend_complete_overdue_exam_session.sql`

- `CREATE OR REPLACE FUNCTION complete_overdue_exam_session(...)` — copy the LATEST body verbatim per Pre-Flag Verification (`agent-critic.md` Pre-Flag Verification rule); add `'vfr_rt_exam'` to the `mode IN (...)` clause.
- The body for `vfr_rt_exam` overdue: same shape as `internal_exam` overdue — compute partial scores using the entries already in `quiz_session_answers` (default 0 for missing entries), update `ended_at`, set `passed` from per-part, emit `'vfr_rt_exam.expired'` audit event (matches the existing CASE branch shape in mig 063 lines 112–115).
- DO NOT widen mode checks in any other RPC unless this migration explicitly does so. Out of scope: `batch_submit_quiz`, `complete_quiz_session`.

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
- On success, `revalidatePath('/app/vfr-rt-exam')` + `redirect('/app/vfr-rt-exam/in-progress/<id>')`.

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
| `apps/web/app/app/vfr-rt-exam/results/[sessionId]/page.tsx` | Per-part scores + review | ≤ 80 |
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
  - Add a `<SegmentedControl>` at the top for `question_type`.
  - Conditional render: `multiple_choice` → existing 4-option editor; `short_answer` → new `<ShortAnswerFields>`; `dialog_fill` → new `<DialogFillFields>`.
- New components co-located in `_components/`:
  - `short-answer-fields.tsx` (≤ 80 lines): canonical answer input + synonyms chip input.
  - `dialog-fill-fields.tsx` (≤ 150 lines): textarea for template + auto-parsed blanks preview with per-blank synonyms editor.
- `packages/db/src/schema.ts`:
  - Convert `UpsertQuestionSchema` to `z.discriminatedUnion('question_type', [...])`.
- `apps/web/app/app/admin/questions/actions/upsert-question.ts`:
  - Branch by `question_type` to populate the right columns; existing INSERT/UPDATE infrastructure unchanged.

## Data Models

### `questions` table — new columns (mig 083)

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

### `quiz_session_answers` / `student_responses` — schema shift (mig 084)

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

### `exam_configs.parts_config` jsonb (mig 087)

```jsonb
{
  "part1": { "topic_code": "P1_ACRONYMS", "count": 8 },
  "part2": { "topic_code": "P2_DIALOG",   "count": 9 },
  "part3": { "topic_code": "P3_MC",       "count": 8 }
}
```

v1: the RPC reads counts/topics from `parts_config` if present, else falls back to the briefing-package defaults (8/9/8 with the seeded topic codes). The defaults are baked into the RPC body so the system works even if no `parts_config` row is inserted post-deploy.

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
- `complete_overdue_exam_session` (after mig 091) — vfr_rt_exam mode with partial answers; auto-grades and emits audit.
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
- Student can't read `questions.canonical_answer` / `blanks_config` via raw PostgREST (RLS on `questions` already blocks `SELECT *` for students; the new columns inherit that. The `get_quiz_questions()` RPC must NOT return canonical/synonyms).
- Direct UPDATE attempts on `quiz_sessions.score_percentage` / `passed` for a `vfr_rt_exam` session are blocked by the trigger machinery extended by `redteam-quiz-session-bugs` mig 082 (#611). **This spec is HARD-BLOCKED on #611 landing first** (recorded in `tasks.md § Prerequisites`, decided 2026-05-28). No interim per-mode trigger; #611 is the canonical fix for all exam modes including vfr_rt_exam.
- The `normalize_answer` helper does NOT execute user-supplied SQL (it uses parameter binding via `regexp_replace` chain).

---

*Cross-document references:* `requirements.md` R1–R6 + all NFRs map onto specific migrations/files above. Implementation order in `tasks.md` follows: Phase A (migs 083–091) → Phase B (Server Actions + grader util) → Phase C (Student UI) → Phase D (Admin editor) → Phase E (Tests + red-team).
