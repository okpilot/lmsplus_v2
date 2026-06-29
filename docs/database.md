---
date: 2026-03-23
status: active
project: lmsplusv2
---

# Database Reference — LMS Plus v2

> Binding rules for all database work. Covers ACID compliance, soft delete,
> immutability, idempotency, RPC conventions, and the full table schema.
> Read alongside `docs/security.md` — they are companion documents.

---

## 1. Core Principles

### ACID
Postgres is fully ACID-compliant at the engine level. Our job is to write code
that doesn't accidentally break those guarantees.

| Principle | What Postgres gives you | What you must enforce |
|-----------|------------------------|-----------------------|
| **Atomicity** | Transactions roll back on failure | Any operation touching 2+ tables goes in a single RPC — never multi-step application calls |
| **Consistency** | Constraint enforcement | Define FK, NOT NULL, CHECK, UNIQUE on every table. Never rely on app-layer validation alone. |
| **Isolation** | READ COMMITTED (default) | Sufficient for this workload. No changes needed. |
| **Durability** | WAL + Supabase backups | Handled by infrastructure. No changes needed. |

### Immutability
Certain records must never change after creation. These represent facts that happened.
Enforce at the database level (RLS policies), not just application convention.

**Immutable tables (no UPDATE, no DELETE, no direct INSERT — RLS blocks all writes):**
- `student_responses` — every answer a student ever gave
- `quiz_session_answers` — same, tied to a specific session
- `audit_events` — compliance log

Writes happen only via SECURITY DEFINER RPCs (e.g., `submit_quiz_answer()`), which run as the database owner and bypass RLS, allowing controlled inserts with business logic enforced in the function. Direct client inserts are blocked.

**Column-level immutability (`users` and `quiz_sessions`):** Some tables allow UPDATE on certain columns but freeze others after row creation. Enforced by `BEFORE UPDATE OF` triggers with a `current_role = 'service_role'` exemption.

| Table | Frozen columns | Mutable columns | Trigger | Migration |
|-------|----------------|-----------------|---------|-----------|
| `users` | `role`, `organization_id`, `deleted_at` | **authenticated**: `full_name` only (mig 090 column GRANT). `email` / `last_active_at` are written by service-role / SECURITY DEFINER RPCs, not by authenticated connections. Service-role bypasses both the column GRANT and the trigger entirely. | `trg_protect_users_sensitive_columns` | `20260316000041`; column GRANT `20260606000006` (`authenticated` holds `UPDATE (full_name)` only — see §2 users table) |
| `quiz_sessions` | `config`, `total_questions`, `mode`, `time_limit_seconds`, `started_at`, `organization_id`, `student_id`, `subject_id`, `topic_id`, `created_at` | `deleted_at` (the only column a student effectively writes — `discardQuiz`). `ended_at`, `correct_count`, `score_percentage`, `passed` are **postgres / SECURITY DEFINER-only**: mig `20260605000001` removed them from `authenticated`'s UPDATE grant (#611), so a student-direct write returns 42501. | `trg_quiz_sessions_immutable_columns` | `079` / `20260502000001`; column GRANT `20260605000001` |

The `quiz_sessions` trigger closes the exam-question-swap vector where a student could inject question_ids into their own active session via direct PostgREST UPDATE (issue #554). Migration `20260605000001` closes the complementary score-forgery vector (#611): a student could otherwise directly UPDATE `correct_count` / `score_percentage` / `passed` / `ended_at` — columns the trigger does **not** freeze — to fake an exam result. Because Postgres can't revoke a single column from a table-level grant, the migration REVOKEs the blanket UPDATE and re-GRANTs every column **except** those four scoring columns: the config columns stay granted (so the immutability trigger still fires its `immutable` message — #554 unchanged), `deleted_at` stays granted (discard), and the scoring columns become postgres-only (42501 for a student). All scoring writes flow through the SECURITY DEFINER completion RPCs (postgres owner), which the column grant does not restrict.

**Soft-deletable tables (UPDATE deleted_at, never hard DELETE):**
- Everything else — see §3.

### Idempotency
Operations that may be retried (network failures, double-submits) must produce the
same result when called multiple times.

**Rule:** All INSERT operations on mutable data use `ON CONFLICT DO NOTHING` or
`ON CONFLICT DO UPDATE` (upsert). Never assume a record doesn't exist.

```sql
-- ✅ CORRECT — idempotent upsert
INSERT INTO fsrs_cards (student_id, question_id, due, state)
VALUES ($1, $2, now(), 'new')
ON CONFLICT (student_id, question_id)
DO UPDATE SET
  due       = EXCLUDED.due,
  stability = EXCLUDED.stability,
  updated_at = now();

-- ❌ WRONG — fails on retry
INSERT INTO fsrs_cards (student_id, question_id, due, state)
VALUES ($1, $2, now(), 'new');
```

---

## 2. Full Table Schema

### Standard Columns (every table)
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
```

Soft-deletable tables also get:
```sql
deleted_at  TIMESTAMPTZ NULL        -- NULL = active. NOT NULL = deleted.
deleted_by  UUID REFERENCES users(id) NULL  -- who triggered the delete
```

---

### organizations
```sql
CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  settings    JSONB NOT NULL DEFAULT '{}',
  deleted_at  TIMESTAMPTZ NULL,
  deleted_by  UUID REFERENCES users(id) NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### users
```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  email           TEXT NOT NULL,
  full_name       TEXT NULL,
  role            TEXT NOT NULL CHECK (role IN ('admin', 'instructor', 'student')),
  deleted_at      TIMESTAMPTZ NULL,
  deleted_by      UUID REFERENCES users(id) NULL,
  last_active_at  TIMESTAMPTZ NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**RLS policies (migration 020 + 056):**
- SELECT: org-scoped via `organizations(id)` — users can see org members' names/roles
- UPDATE: `id = auth.uid() AND deleted_at IS NULL` — students can edit their own profile (migration 056). Protected by `trg_protect_users_sensitive_columns` trigger (migration 041) which blocks `role`, `organization_id`, and `deleted_at` changes for non-service-role connections.
- No DELETE policy — soft-delete only via service role

**Column UPDATE GRANT (mig 090, #773):** Defense-in-depth at the Postgres privilege layer on top of the RLS + trigger defenses. `authenticated` holds `UPDATE (full_name)` only; UPDATE on `role`, `organization_id`, and `deleted_at` is revoked at the privilege layer (`REVOKE UPDATE ON users FROM authenticated` + `GRANT UPDATE (full_name) ON users TO authenticated`). A direct `UPDATE users SET role='admin'` now returns `42501` (permission denied for column) before the trigger or RLS even fires. Mirrors the `quiz_sessions` column-GRANT pattern (mig `20260605000001`).

### easa_subjects / easa_topics / easa_subtopics
```sql
-- Reference data — seeded once, never deleted
CREATE TABLE easa_subjects (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code  TEXT NOT NULL UNIQUE,   -- '050'
  name  TEXT NOT NULL,           -- 'Meteorology'
  short TEXT NOT NULL,           -- 'MET'
  sort_order INT NOT NULL
);

CREATE TABLE easa_topics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id  UUID NOT NULL REFERENCES easa_subjects(id),
  code        TEXT NOT NULL,    -- '050-03'
  name        TEXT NOT NULL,    -- 'Clouds'
  sort_order  INT NOT NULL,
  UNIQUE (subject_id, code)
);

CREATE TABLE easa_subtopics (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id   UUID NOT NULL REFERENCES easa_topics(id),
  code       TEXT NOT NULL,    -- '050-03-02'
  name       TEXT NOT NULL,    -- 'Cloud classification'
  sort_order INT NOT NULL,
  UNIQUE (topic_id, code)
);
```

### question_banks
```sql
CREATE TABLE question_banks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name            TEXT NOT NULL,
  description     TEXT NULL,
  created_by      UUID NOT NULL REFERENCES users(id),
  deleted_at      TIMESTAMPTZ NULL,
  deleted_by      UUID REFERENCES users(id) NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT question_banks_organization_id_key UNIQUE (organization_id)
);
```

**Constraints**: PK(id), FK(organization_id → organizations), FK(created_by → users). Unique constraint on `organization_id` (migration 062) — enforces 1:1 org:bank invariant at DB level, making `insertQuestion`'s `.limit(1).single()` deterministic.

### questions
```sql
CREATE TABLE questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  bank_id         UUID NOT NULL REFERENCES question_banks(id),
  subject_id      UUID NOT NULL REFERENCES easa_subjects(id),
  topic_id        UUID NOT NULL REFERENCES easa_topics(id),
  subtopic_id     UUID REFERENCES easa_subtopics(id) NULL,
  question_number TEXT NULL,                    -- external ID from source QDB (e.g. '688864')
  lo_reference    TEXT NULL,                   -- 'MET 3.2.1'
  question_text   TEXT NOT NULL,
  question_image_url TEXT NULL,
  correct_option_id TEXT NULL,                  -- MC answer key (option id a-d). NULL for non-MC. REVOKE-gated: read via get_question_authoring_fields() (mig 111, #823)
  options         JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{id,text}] — correct field stripped on write by trg_sanitize_question_options (mig 111). MC key moved to correct_option_id column.
  explanation_text TEXT NOT NULL,
  explanation_image_url TEXT NULL,
  difficulty      TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'draft')),
  version         INT NOT NULL DEFAULT 1,
  has_calculations BOOLEAN NOT NULL DEFAULT false,  -- admin-tagged: question requires a calculation; drives the quiz-start calc filter (mig 107, #837)
  question_type   TEXT NOT NULL DEFAULT 'multiple_choice'
                    CHECK (question_type IN ('multiple_choice', 'short_answer', 'dialog_fill')),
  canonical_answer TEXT NULL,                  -- short_answer grading key
  accepted_synonyms TEXT[] NOT NULL DEFAULT '{}',  -- short_answer synonyms
  dialog_template TEXT NULL,                   -- dialog_fill raw template with {{n|canonical; syn}} tokens
  blanks_config   JSONB NOT NULL DEFAULT '[]'::jsonb,  -- dialog_fill: [{index, canonical, synonyms}]
  created_by      UUID NOT NULL REFERENCES users(id),
  deleted_at      TIMESTAMPTZ NULL,            -- soft delete = question retired from bank
  deleted_by      UUID REFERENCES users(id) NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT questions_question_type_columns_check CHECK (
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
  ),
  CONSTRAINT questions_mc_correct_option_id_check CHECK (
    (question_type = 'multiple_choice')
      = (correct_option_id IS NOT NULL AND correct_option_id IN ('a', 'b', 'c', 'd'))
  )
);
```

**Column-level SELECT gate (mig 094, mig 111):** Five answer-key columns are REVOKED from the `authenticated` role (students and admins):
- `canonical_answer`, `accepted_synonyms`, `dialog_template`, `blanks_config` (short-answer & dialog-fill keys, mig 094)
- `correct_option_id` (multiple-choice key, mig 111, #823)

All grading RPCs run as `postgres` (SECURITY DEFINER owner), which is unaffected. Admin authoring reads go through `get_question_authoring_fields()` RPC (mig 094b / 114, is_admin()-gated). The privilege layer defense mirrors the `quiz_sessions` column-GRANT pattern (mig 20260605000001). A direct `.select('*')` or `.select('correct_option_id, ...')` from an authenticated client returns 42501 (permission denied). Because the gate re-GRANTs an explicit column list, any column added after mig 094 must be granted to `authenticated` separately or SECURITY INVOKER readers fail with 42501 — `has_calculations` (mig 107) adds `GRANT SELECT (has_calculations) ON questions TO authenticated` so the SECURITY INVOKER `_filtered_question_pool` can read it (#837). Migration 109 does NOT add `correct_option_id` to the grant list, so it remains privileged.

**dialog_fill delimiter guard (mig 125, #951):** Two CHECK constraints reject `dialog_fill` rows whose answer values carry the token delimiters `{ } | ;` (the structural delimiters of the `{{n|canonical;syn1;syn2}}` grammar — a value cannot represent them):
- `questions_dialog_fill_template_wellformed` — after `regexp_replace` strips every well-formed `{{n|value}}` token from `dialog_template` (value region `[^{}|]*`), no stray brace may remain. This is the **student-leak guard**: a `}`/`|` inside a token value would otherwise break the server-side strip regex in `get_quiz_questions` / `get_vfr_rt_exam_questions` and leave a partial answer key in the student-facing template. It is a **superset of the hardened strip's residue** — any value the strip cannot fully clean is rejected at INSERT, so the CHECK and the strip are co-dependent (do not weaken either independently).
- `questions_dialog_fill_blanks_delimiter_free` — every `blanks_config` canonical/synonym is delimiter-free, enforced via the `IMMUTABLE PARALLEL SAFE` helper `dialog_fill_blanks_delimiter_free(jsonb)`. This is an authoring-hygiene / consistency invariant (keeps template tokens and `blanks_config` delimiter-free in lockstep), NOT a direct leak path — `blanks_safe` is index-only, so `blanks_config` values never reach students.

**Indexes:** Partial index on `(question_type, subject_id)` WHERE `deleted_at IS NULL AND status = 'active'` supports VFR RT part-based sampling (mig 094).

-- Note: status='archived' is replaced by deleted_at IS NOT NULL

### courses
```sql
CREATE TABLE courses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  title           TEXT NOT NULL,
  subject         TEXT NOT NULL,
  description     TEXT NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'active')),
  created_by      UUID NOT NULL REFERENCES users(id),
  deleted_at      TIMESTAMPTZ NULL,
  deleted_by      UUID REFERENCES users(id) NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### lessons
```sql
CREATE TABLE lessons (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           UUID NOT NULL REFERENCES organizations(id),
  course_id                 UUID REFERENCES courses(id) NULL,
  title                     TEXT NOT NULL,
  subject                   TEXT NOT NULL,
  learning_objectives       TEXT[] NOT NULL DEFAULT '{}',
  estimated_duration_minutes INT NOT NULL DEFAULT 90,
  content                   JSONB NOT NULL DEFAULT '{}',  -- full block sequence
  status                    TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'ready')),
  schema_version            TEXT NOT NULL DEFAULT '1.0.0',
  version                   INT NOT NULL DEFAULT 1,
  created_by                UUID NOT NULL REFERENCES users(id),
  deleted_at                TIMESTAMPTZ NULL,
  deleted_by                UUID REFERENCES users(id) NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### quiz_sessions
`config.question_ids` is read by `getActiveExamSession` (RLS-scoped Server Action, no SECURITY DEFINER)
to populate the handoff payload for cold-start exam resume. See [Decision 36 in `docs/decisions.md`](./decisions.md#decision-36-practice-exam-resume--sessionstorage-handoff--server-side-question-ids).

```sql
CREATE TABLE quiz_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  student_id       UUID NOT NULL REFERENCES users(id),
  mode             TEXT NOT NULL CHECK (mode IN ('smart_review', 'quick_quiz', 'mock_exam', 'internal_exam', 'vfr_rt_exam', 'discovery')),
  -- 'discovery' added in mig 136 (#1011) — Discovery/Study Mode is now a real ephemeral session row.
  -- Creation paths (enforced by the RPCs, not the table CHECK):
  --   start_quiz_session            → 'smart_review' | 'quick_quiz' (whitelist; mig 081 rejects exam modes)
  --   start_exam_session            → 'mock_exam'                   (mig 040)
  --   start_internal_exam_session   → 'internal_exam'               (mig 058)
  --   start_vfr_rt_exam_session     → 'vfr_rt_exam'                 (mig 099)
  --   start_discovery_session       → 'discovery'                   (mig 137, #1011; ephemeral, non-resumable, nothing-scored)
  subject_id       UUID REFERENCES easa_subjects(id) NULL,  -- NULL for smart_review
  topic_id         UUID REFERENCES easa_topics(id) NULL,
  config           JSONB NOT NULL DEFAULT '{}',             -- question IDs locked at start; may carry parts {p1_end,p2_end,p3_end} for vfr_rt_exam
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at         TIMESTAMPTZ NULL,
  total_questions  INT NOT NULL DEFAULT 0,
  correct_count    INT NOT NULL DEFAULT 0,
  score_percentage NUMERIC(5,2) NULL,
  time_limit_seconds INT NULL,          -- exam countdown duration (NULL for study mode)
  passed           BOOLEAN NULL,        -- score >= pass_mark (NULL for study/incomplete)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ NULL     -- added in migration 023 for discarded sessions
  -- No updated_at: only ended_at is set once, on completion
);
```

**Single-active-session invariant (mig 136, #1011 — Decision 49):** a global partial unique index enforces **at most one active session per student, across all modes**:

```sql
CREATE UNIQUE INDEX uq_one_active_session_per_student
  ON quiz_sessions (student_id)
  WHERE ended_at IS NULL AND deleted_at IS NULL;
```

This subsumes the three per-mode partial indexes (`uq_active_exam_session` mig 088, `uq_internal_exam_session_active` mig 069, `uq_vfr_rt_exam_session_active` mig 096), which are **retained** so the per-RPC `unique_violation` handlers keep their mode-specific friendly messages. Each start RPC (`start_exam_session` mig 138, `start_internal_exam_session` mig 139, `start_vfr_rt_exam_session` mig 140, `start_quiz_session` mig 141, `start_discovery_session` mig 137) additionally pre-checks and raises `another_session_active` when an other-mode active session exists (the index is the race backstop). Rationale: an answer-revealing Discovery/practice session cannot coexist with a graded exam on the shared MC pool (answer-key oracle, #1011). Mig 136 also widened the mode CHECK to add `'discovery'` and ran a one-time dedup of pre-existing multi-active rows so the index could build.

### exam_configs
```sql
-- Per-subject exam configuration. One config per org+subject.
CREATE TABLE exam_configs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  subject_id        UUID NOT NULL REFERENCES easa_subjects(id),
  enabled           BOOLEAN NOT NULL DEFAULT false,
  total_questions   INT NOT NULL CHECK (total_questions > 0),
  time_limit_seconds INT NOT NULL CHECK (time_limit_seconds > 0),
  pass_mark         INT NOT NULL CHECK (pass_mark > 0 AND pass_mark <= 100),
  parts_config      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- VFR RT: {part1: {topic_code, count}, part2: {topic_code, count}, part3: {topic_code, count}}
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ NULL
);
-- Partial unique index (replaces full UNIQUE constraint; soft-deleted rows excluded):
CREATE UNIQUE INDEX uq_exam_configs_org_subject_active
  ON exam_configs (organization_id, subject_id) WHERE deleted_at IS NULL;
-- RLS: admin full CRUD, students read-only (enabled + non-deleted only)
```

**`parts_config` column (mig 098):** Optional per-part composition object for VFR RT exams. Structure: `{ "part1": { "topic_code": "P1_ACRONYMS", "count": 8 }, "part2": { "topic_code": "P2_DIALOG", "count": 9 }, "part3": { "topic_code": "P3_MC", "count": 8 } }`. Empty object `{}` = RPC uses hardcoded 8/9/8 defaults. Post-deploy seed step only — no auto-migration.seed (see mig 098 comments).

**Reactivation-block trigger (mig 089, #755):** A `BEFORE UPDATE` trigger `trg_block_exam_config_reactivation` raises `'exam_config reactivation must go through upsert_exam_config'` when `OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL` (unconditional — no role exemption). This blocks any direct `UPDATE exam_configs SET deleted_at = NULL` outside of `upsert_exam_config`, the only sanctioned reactivation path. The trigger never fires during `upsert_exam_config` because that RPC's UPDATE branch does not write `deleted_at` at all (it touches only `enabled/total_questions/time_limit_seconds/pass_mark/updated_at`, or inserts a fresh row) — not because of any role exemption; a future reactivation RPC would need an explicit exemption added here. The data-integrity invariant (≤1 active config per org+subject) was always enforced by `uq_exam_configs_org_subject_active`; this trigger additionally enforces that reactivation flows through the RPC's controlled path. Closes security.md §11 AJ (was GAP/LOW, now ENFORCED).

### exam_config_distributions
```sql
-- Question count per topic/subtopic for exam random selection.
-- Ephemeral: hard DELETE is intentional (same precedent as quiz_drafts).
-- Distributions are replaced atomically on each config save.
CREATE TABLE exam_config_distributions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_config_id    UUID NOT NULL REFERENCES exam_configs(id) ON DELETE CASCADE,
  topic_id          UUID NOT NULL REFERENCES easa_topics(id),
  subtopic_id       UUID REFERENCES easa_subtopics(id) NULL,
  question_count    INT NOT NULL CHECK (question_count > 0),
  UNIQUE (exam_config_id, topic_id, subtopic_id)
);
-- RLS: admin-only (students cannot read distributions)
```

### quiz_session_answers
```sql
-- Immutable. No UPDATE, no DELETE, no soft delete.
CREATE TABLE quiz_session_answers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID NOT NULL REFERENCES quiz_sessions(id),
  question_id           UUID NOT NULL REFERENCES questions(id),
  selected_option_id    TEXT NULL CHECK (selected_option_id IS NULL OR selected_option_id IN ('a','b','c','d')),  -- multiple_choice only
  response_text         TEXT NULL,                                    -- short_answer or dialog_fill
  blank_index           INT NULL,                                     -- dialog_fill only
  is_correct            BOOLEAN NOT NULL,
  response_time_ms      INT NOT NULL,
  answered_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT quiz_session_answers_answer_shape_check CHECK (
    (selected_option_id IS NOT NULL AND response_text IS NULL AND blank_index IS NULL)
    OR (selected_option_id IS NULL AND response_text IS NOT NULL
        AND (blank_index IS NULL OR blank_index >= 0))
  ),
  CONSTRAINT quiz_session_answers_session_question_blank_uniq
    UNIQUE NULLS NOT DISTINCT (session_id, question_id, blank_index)
);
```

**Answer shape discriminator (mig 095):** Exactly one of `(selected_option_id, response_text)` must be set per row. `blank_index` is non-null only for `dialog_fill` (multiple rows per question). `UNIQUE NULLS NOT DISTINCT` allows multiple rows per `(session_id, question_id)` when `blank_index` differs (blank_index NULL for MC/short_answer, int for dialog_fill). Supports both old one-row-per-question and new per-blank-per-question semantics.

**`blank_index` ⇔ `dialog_fill` write-time trigger (mig 131, #828):** A `BEFORE INSERT` trigger `trg_enforce_blank_index_shape_qsa` (mirrored on `student_responses` as `trg_enforce_blank_index_shape_sr`) enforces the biconditional `question_type = 'dialog_fill' ⇔ blank_index IS NOT NULL` by reading the answered question's type — something the single-row `*_answer_shape_check` CHECK structurally cannot do (a CHECK cannot read another table). It rejects a non-`dialog_fill` row carrying a `blank_index`, and a `dialog_fill` row missing one. Shared trigger function `enforce_answer_blank_index_shape()` is **SECURITY INVOKER** (repo trigger convention — every answer insert originates inside a postgres-owned SECURITY DEFINER grading RPC, so the `questions` read runs as postgres and bypasses RLS) with **no `deleted_at` filter** (the question is reached via the session's frozen write-once `config.question_ids`; soft-deleted questions are still scored — §15 carve-out, see §3). Closes the gap where a future inserter or admin-form/import bug could persist a malformed `blank_index`.

### student_responses
```sql
-- Immutable. Every answer ever given, across all contexts.
CREATE TABLE student_responses (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES organizations(id),
  student_id         UUID NOT NULL REFERENCES users(id),
  question_id        UUID NOT NULL REFERENCES questions(id),
  session_id         UUID REFERENCES quiz_sessions(id) NULL,
  selected_option_id TEXT NULL CHECK (selected_option_id IS NULL OR selected_option_id IN ('a','b','c','d')),
  response_text      TEXT NULL,                                    -- short_answer or dialog_fill
  blank_index        INT NULL,                                     -- dialog_fill only
  is_correct         BOOLEAN NOT NULL,
  response_time_ms   INT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT student_responses_answer_shape_check CHECK (
    (selected_option_id IS NOT NULL AND response_text IS NULL AND blank_index IS NULL)
    OR (selected_option_id IS NULL AND response_text IS NOT NULL
        AND (blank_index IS NULL OR blank_index >= 0))
  ),
  CONSTRAINT student_responses_session_question_blank_uniq
    UNIQUE NULLS NOT DISTINCT (session_id, question_id, blank_index)
  -- No updated_at: this record is immutable by design
);
```

**Answer shape discriminator (mig 095):** Mirrors `quiz_session_answers` constraint. Legacy callers omit `blank_index` (lands as NULL); rows conflict on the old `(session_id, question_id)` constraint semantics unchanged. New dialog_fill paths supply per-blank rows. The `blank_index` ⇔ `dialog_fill` write-time trigger (mig 131, #828) applies here too via `trg_enforce_blank_index_shape_sr` — see the `quiz_session_answers` note above.

### fsrs_cards
```sql
CREATE TABLE fsrs_cards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES users(id),
  question_id     UUID NOT NULL REFERENCES questions(id),
  due             TIMESTAMPTZ NOT NULL DEFAULT now(),
  stability       FLOAT NOT NULL DEFAULT 0,
  difficulty      FLOAT NOT NULL DEFAULT 0,
  elapsed_days    INT NOT NULL DEFAULT 0,
  scheduled_days  INT NOT NULL DEFAULT 0,
  reps            INT NOT NULL DEFAULT 0,
  lapses          INT NOT NULL DEFAULT 0,
  state           TEXT NOT NULL DEFAULT 'new'
                    CHECK (state IN ('new', 'learning', 'review', 'relearning')),
  last_review     TIMESTAMPTZ NULL,
  last_was_correct BOOLEAN DEFAULT NULL,              -- NULL = unknown, true/false = last answer result
  consecutive_correct_count INT NOT NULL DEFAULT 0,  -- used by incorrectly-answered question filter
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, question_id)  -- one card per student per question
);
```

### audit_events
```sql
-- Immutable append-only compliance log.
CREATE TABLE audit_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  actor_id        UUID NOT NULL REFERENCES users(id),
  actor_role      TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  resource_type   TEXT NOT NULL,
  resource_id     UUID NULL,
  metadata        JSONB NOT NULL DEFAULT '{}',
  ip_address      INET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### quiz_drafts
```sql
-- Temporary storage for interrupted quiz sessions. Up to 20 drafts per student.
-- APPROVED EXCEPTION: uses real DELETE (not soft delete) — drafts are disposable temp storage.
CREATE TABLE quiz_drafts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES users(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  session_config  JSONB NOT NULL DEFAULT '{}',  -- { sessionId, subjectName?, subjectCode? }
  question_ids    UUID[] NOT NULL,
  answers         JSONB NOT NULL DEFAULT '{}',   -- Record<questionId, { selectedOptionId, responseTimeMs }>
  feedback        JSONB NULL,                    -- Record<questionId, { isCorrect, correctOptionId, explanationText, explanationImageUrl }>
  current_index   INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### flagged_questions
```sql
-- Per-student persistent question flags for later review filtering.
-- Students flag questions during quiz sessions; flags persist across sessions.
-- Used in quiz setup to filter "Flagged" questions.
CREATE TABLE flagged_questions (
  student_id   UUID NOT NULL REFERENCES users(id),
  question_id  UUID NOT NULL REFERENCES questions(id),
  flagged_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ,
  PRIMARY KEY (student_id, question_id)
);

-- Index for quiz setup filter queries (student lookup)
CREATE INDEX idx_flagged_questions_student ON flagged_questions (student_id)
  WHERE deleted_at IS NULL;
```

RLS policies:
- SELECT: `student_id = auth.uid()` (reads use active_flagged_questions view)
- INSERT: `student_id = auth.uid()`
- UPDATE: `student_id = auth.uid()` (soft-delete via `deleted_at = now()` in app code)

**Why `deleted_at` is not in RLS:** With `FORCE ROW LEVEL SECURITY`, Postgres checks SELECT visibility of the NEW row after UPDATE. Filtering `deleted_at IS NULL` in the policy would prevent soft-deletes from succeeding. Instead, read queries use the `active_flagged_questions` view (which includes `WHERE deleted_at IS NULL`). Write operations in flag.ts filter explicitly. RLS only enforces ownership.

#### View: `active_flagged_questions`

```sql
CREATE OR REPLACE VIEW active_flagged_questions
WITH (security_invoker = true) AS
  SELECT * FROM flagged_questions WHERE deleted_at IS NULL;
```

Created in migration 051 to centralize the soft-delete filter and provide RLS enforcement via `security_invoker`, removing the per-callsite `.is('deleted_at', null)` requirement. **All read-path callsites now query this view** (migrated in issue #467):

- `apps/web/app/app/quiz/actions/flag.ts` — ownership check in `toggleFlag`, ID list in `getFlaggedIds`
- `apps/web/app/app/quiz/actions/filter-helpers.ts` — quiz setup flagged filter
- `apps/web/lib/gdpr/collect-user-data.ts` — GDPR data export

Write operations (`flagQuestion`, `unflagQuestion`) continue to use the `flagged_questions` base table directly.

**Why `security_invoker`?** By default, views run with owner-context permission checks, bypassing caller RLS. Setting `security_invoker = true` switches to invoker-context, so RLS on `flagged_questions` is evaluated as the calling user — ensuring `student_id = auth.uid()` is enforced when querying through the view.

### question_comments
Per-question discussion threads. Students and admins can post comments on any question. Hard-delete table (low audit value).

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, default gen_random_uuid() |
| question_id | UUID | FK → questions(id), NOT NULL |
| user_id | UUID | FK → users(id), NOT NULL |
| body | TEXT | NOT NULL, CHECK 1–2000 chars |
| created_at | TIMESTAMPTZ | NOT NULL, default now() |
| deleted_at | TIMESTAMPTZ | nullable |

**RLS policies:**
- SELECT: any authenticated user, non-deleted only
- INSERT: own user_id only, deleted_at must be NULL
- DELETE (own): user_id = auth.uid()
- DELETE (admin): public.is_admin()
- No UPDATE policy (comments not editable)

**Indexes:** (question_id, created_at) WHERE deleted_at IS NULL

**Note:** This is a hard-delete table — the primary delete path is DELETE, not soft-delete. The deleted_at column exists as a safety net but is not used by application code.

### user_consents

Immutable append-only GDPR consent audit log. Tracks user acceptance of Terms of Service and Privacy Policy documents across versions. Accessed via two SECURITY DEFINER RPCs: `record_consent()` and `check_consent_status()`.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, default gen_random_uuid() |
| user_id | UUID | FK → users(id), NOT NULL |
| document_type | TEXT | NOT NULL, CHECK value IN ('terms_of_service', 'privacy_policy') |
| document_version | TEXT | NOT NULL, CHECK length 1–20 chars (e.g. 'v1.0') |
| accepted | BOOLEAN | NOT NULL |
| ip_address | TEXT | nullable, optional request source |
| user_agent | TEXT | nullable, optional user agent string |
| created_at | TIMESTAMPTZ | NOT NULL, default now() |

**RLS policies:**
- SELECT: `user_id = auth.uid()` (users read their own consent records)
- INSERT: denied (all writes via `record_consent()` RPC only)
- UPDATE: denied (append-only)
- DELETE: denied (append-only)

**Index:** (user_id, document_type, document_version) WHERE accepted = true (supports consent status checks)

**Pattern:** Identical to `audit_events` — immutable, no direct client writes, controlled via SECURITY DEFINER RPCs.

### internal_exam_codes

Single-use 8-character codes for starting `internal_exam` mode sessions. Admins issue a code targeting a specific student + subject; the student consumes the code once to start a session. Codes expire after 24 hours.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, default gen_random_uuid() |
| code | TEXT | NOT NULL, 8 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (Crockford-style; excludes `0/O/I/1`), UNIQUE |
| subject_id | UUID | FK → easa_subjects(id), NOT NULL |
| student_id | UUID | FK → users(id), NOT NULL (target student) |
| issued_by | UUID | FK → users(id), NOT NULL (admin who issued) |
| issued_at | TIMESTAMPTZ | NOT NULL, default now() |
| expires_at | TIMESTAMPTZ | NOT NULL (issued_at + 24h) |
| consumed_at | TIMESTAMPTZ | NULL — set when student starts a session |
| consumed_session_id | UUID | FK → quiz_sessions(id), NULL — paired with `consumed_at` via CHECK |
| voided_at | TIMESTAMPTZ | NULL — set when admin voids the code |
| voided_by | UUID | FK → users(id), NULL — paired with `voided_at` via CHECK |
| void_reason | TEXT | NULL — admin-supplied reason on void |
| organization_id | UUID | FK → organizations(id), NOT NULL |
| deleted_at | TIMESTAMPTZ | NULL |
| emailed_at | TIMESTAMPTZ | NULL — When an admin last emailed this code to the student (stamped by `record_internal_exam_code_emailed`); drives the codes-table 'sent' indicator (#905) |

**Constraints:**
- `consumed_pair_consistency` CHECK — `(consumed_at IS NULL) = (consumed_session_id IS NULL)`
- `voided_pair_consistency` CHECK — `(voided_at IS NULL) = (voided_by IS NULL)`

**Indexes:**
- `idx_internal_exam_codes_active` on `(student_id, expires_at)` WHERE active (not consumed/voided/expired/deleted)
- `idx_internal_exam_codes_org` on `(organization_id)` WHERE `deleted_at IS NULL`

**RLS policies (FORCE RLS, migration `20260429000009`; tightened in `20260521000004`):**
- SELECT (student): none — direct PostgREST reads return 0 rows; students read via `list_my_active_internal_exam_codes()` RPC (closes #577). The earlier `student_read_active_codes` policy was dropped because it exposed the plaintext `code` column to any caller who knew an `id`.
- SELECT (admin): `is_admin()` AND org-scoped
- UPDATE (admin): none — admin write paths run only inside SECURITY DEFINER RPCs (`void_internal_exam_code`, `start_internal_exam_session`, `record_internal_exam_code_emailed`). The earlier `admin_update_org_codes` policy was dropped (closes #578) and `REVOKE UPDATE ON internal_exam_codes FROM authenticated` was executed for defense-in-depth.
- No INSERT or DELETE policies — issuance/consumption/void happen via SECURITY DEFINER RPCs only.
- GRANTs to `authenticated`: `SELECT` only (UPDATE revoked in mig `20260521000004`).

**Pattern:** Student reads and all writes are RPC-mediated; admin direct SELECT remains RLS-scoped (`admin_read_org_codes`). Four writer RPCs (`issue_internal_exam_code()` admin, `start_internal_exam_session()` student, `void_internal_exam_code()` admin, `record_internal_exam_code_emailed()` admin — stamps `emailed_at` only) and one student reader (`list_my_active_internal_exam_codes()`). The `start_internal_exam_session` RPC additionally guards against duplicate active sessions via the `WHERE consumed_at IS NULL` race-clause on the consumption UPDATE (migration `20260429000010`). The reader RPC omits the plaintext `code` column from its return signature so that even a leaked PostgREST request cannot harvest active codes.

---

## 3. Soft Delete

**Rule: No hard DELETE anywhere in the application. Ever.**

Every mutable table has `deleted_at TIMESTAMPTZ NULL`. When a record is "deleted":

```sql
-- The only form of delete allowed in application code
UPDATE questions
SET
  deleted_at = now(),
  deleted_by = auth.uid()
WHERE id = $1
  AND organization_id = (SELECT organization_id FROM users WHERE id = auth.uid());
```

### Filtering Soft-Deleted Records

All RLS `USING` policies on soft-deletable tables include the active filter:

```sql
CREATE POLICY "tenant_isolation" ON questions
  USING (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    AND deleted_at IS NULL          -- ← soft delete filter
  )
  WITH CHECK (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    AND deleted_at IS NULL
  );
```

This means deleted records are invisible to all normal queries automatically.
No `WHERE deleted_at IS NULL` needed in application code — RLS handles it.

**Exception:** `flagged_questions` table filters `deleted_at IS NULL` in application code (flag.ts), not in RLS, to avoid `FORCE ROW LEVEL SECURITY` violations when soft-deleting rows. See the `flagged_questions` table docs (§2) for details.

### Scoring Soft-Deleted Questions

When a student submits quiz answers in `batch_submit_quiz`, the RPC may need to score a question that was soft-deleted *after* the quiz session started. This is safe because:

1. **Membership was validated at session start** — `quiz_sessions.config.question_ids` was locked when the session began, before the question could be deleted. Enforced by trigger `trg_quiz_sessions_immutable_columns` (migration 079).
2. **Explanations are preserved** — the question record still exists (soft-deleted, not hard-deleted), so we can still retrieve explanation text and images.
3. **Historical integrity** — we score the response as it was when the student answered, not based on the question's current (deleted) state.

**Implementation:** `batch_submit_quiz` does NOT filter `WHERE deleted_at IS NULL` on the `questions` JOIN when replaying completed sessions. This is safe because:
- The idempotent replay path uses `quiz_session_answers.question_id` to fetch the questions (a write-once immutable FK link), so the accessible question set is bounded by the student's completed session's immutable answer record.
- If a question was soft-deleted *after* the student answered it, the reply must still show all the student's prior answers—including the now-deleted question—for consistency (answered_count from the session row must match the actual result set length, else the UI diverges).
- Migration `20260619000250` (PR #856) refined the §15 carve-out: removed the `AND q.deleted_at IS NULL` filter from the replay JOIN, added inline documentation explaining the write-once FK boundary.

See security.md §15 for the full list of carve-outs and their immutable-column justifications.

**Other functions sharing this carve-out** (see security.md §15 for the full list): `check_quiz_answer` (mig 117), `submit_quiz_answer` (mig 123), `check_non_mc_answer` (mig 119), `batch_submit_quiz` (migs 120/121 — its dispatch temp-table fetch and DISTINCT-question score aggregation read `questions` via the frozen `config.question_ids`, in addition to the replay path described above), and `submit_vfr_rt_exam_answers` / `get_vfr_rt_exam_questions` / `get_vfr_rt_exam_results` read `questions` via the same frozen `config.question_ids`. `get_report_correct_options`, `get_admin_report_correct_options` (mig 114), and `get_report_answer_keys` (mig 133) instead read `questions` via `quiz_session_answers.question_id` — a write-once FK on the immutable, append-only `quiz_session_answers` table — so a completed-session report still reveals the key (correct-option ID for MC; canonical answers for non-MC short_answer + dialog_fill per-blank) for a question soft-deleted after it was answered. `submit_quiz_answer` (mig 123, #855) also shares this carve-out: it verifies `p_question_id = ANY(config.question_ids)` before its questions read, so a question soft-deleted mid-session stays submittable for a fresh graded answer — aligned with `check_quiz_answer`'s immediate-feedback posture. (Previously, mig 112, it filtered `q.deleted_at IS NULL`, which diverged from `check_quiz_answer`: a student could get correct/incorrect feedback via `check_quiz_answer` on a question that `submit_quiz_answer` would then refuse to record. Option 1 of #855 — carve-out both — resolved the inconsistency.)

```sql
-- ✅ CORRECT — SECURITY DEFINER RPC can score questions soft-deleted mid-quiz
SELECT q.explanation_text, q.explanation_image_url
FROM questions q
WHERE q.id = v_question_id;  -- No `deleted_at IS NULL` filter
```

### Viewing Deleted Records (admin/compliance only)

```sql
-- Via service role client only (bypasses RLS)
-- Used for: CAA audit requests, data recovery, compliance exports
SELECT * FROM questions
WHERE organization_id = $1
  AND deleted_at IS NOT NULL
ORDER BY deleted_at DESC;
```

### Tables With Soft Delete

| Table | Soft delete? | Reason |
|-------|-------------|--------|
| `organizations` | Yes | Org closure must be recoverable |
| `users` | Yes | Account deletion must be reversible for 30 days (GDPR allows it) |
| `question_banks` | Yes | Bank retirement, not destruction |
| `questions` | Yes | Retired questions still referenced in historical responses |
| `courses` | Yes | Archived courses still referenced in historical sessions |
| `lessons` | Yes | Retired lessons still referenced in historical sessions |
| `quiz_sessions` | Yes | Sessions can be discarded (soft-deleted via `deleted_at`) |
| `quiz_session_answers` | No | Immutable |
| `student_responses` | No | Immutable |
| `fsrs_cards` | No | Updated in place; stores `last_was_correct` for incorrect-filter queries |
| `audit_events` | No | Immutable compliance log |
| `easa_subjects/topics/subtopics` | No | Reference data, never deleted |
| `quiz_drafts` | Hard DELETE (approved exception) | Disposable temp storage; no recovery value |
| `flagged_questions` | Yes (soft) | Unflag = set deleted_at; flags referenced in quiz filter queries |
| `exam_configs` | Yes | Per-subject exam configuration; soft-deleted when org removes exam mode |
| `exam_config_distributions` | Hard DELETE (approved exception) | No `deleted_at`; replaced atomically by `upsert_exam_config` RPC. Also cascades from parent `exam_configs` via `ON DELETE CASCADE`. RLS policies (admin SELECT/INSERT/DELETE) filter `ec.deleted_at IS NULL` on the parent join (mig 083), so direct PostgREST access to distributions of a soft-deleted exam config is blocked at the policy layer; `upsert_exam_config` is SECURITY DEFINER and bypasses RLS, so the replace-on-save flow is unaffected |
| `question_comments` | Hard DELETE (explicit exception — low audit value) | deleted_at exists as safety net but not used by application code |
| `internal_exam_codes` | Yes | Issued codes form an audit trail; admin void uses `voided_at`/`void_reason`, soft-delete reserved for compliance archival |

> **Admin write access (migration 039):** `easa_subjects`, `easa_topics`, and `easa_subtopics` have RLS policies granting INSERT/UPDATE/DELETE to users where `is_admin()` returns `true`. All other users have SELECT-only access. These policies exist to support the Admin Syllabus Manager feature.

> **Admin question management (migrations 052–055):** The `questions` table has admin INSERT and UPDATE policies with org scoping — `is_admin() AND organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())`. No admin DELETE policy exists; questions use soft-delete via UPDATE to `deleted_at`. Students access questions only through the `get_quiz_questions()` RPC, which strips the `correct` field from options.

> **Storage: `question-images` bucket (migrations 053, 055, 20260410000009):** Admin INSERT/UPDATE/DELETE policies enforce org-scoped path isolation — images are stored at `{org_id}/{filename}` and policies check `(storage.foldername(name))[1]` matches the admin's org. Authenticated SELECT allows all users to read images (for quiz display). The upload action (`uploadQuestionImage`) resolves the admin's org and prefixes the path automatically.

> **Admin cross-row reads on `users` (binding pattern):** When an admin Server Action reads or *embeds* the `users` table to fetch peer rows (not just the calling admin's own row), use `adminClient` from `@repo/db/admin` — never the user-scoped supabase client. The `users.tenant_isolation` policy uses a self-referential subquery `(SELECT organization_id FROM users WHERE id = auth.uid())`, and PostgreSQL's planner is unreliable when an RLS policy references the same table for cross-row reads. Self-row reads work; cross-row reads can manifest as `null` / empty results (the exact shape depends on whether the query is a top-level select vs. an embedded resource). PostgREST applies RLS to embedded resources too, so even joining `users(...)` from another table triggers the same failure mode. Defense in depth: gate the path with `requireAdmin()` first, then apply `.eq('organization_id', organizationId)` on every adminClient query. Including: `apps/web/app/app/admin/students/queries.ts`, `apps/web/app/app/admin/dashboard/queries.ts`, `apps/web/app/app/admin/internal-exams/queries.ts`, `apps/web/lib/queries/admin-quiz-report.ts`, `apps/web/app/app/admin/dashboard/students/[id]/queries.ts`.

---

## 4. RPC Conventions

Use Postgres functions (RPCs) for:
1. Any operation touching 2+ tables (atomicity)
2. Stripping sensitive fields before returning to clients
3. Business logic that must be consistent regardless of which client calls it
4. Idempotent upserts with complex conflict resolution

### Naming Convention

```
verb_noun pattern:
  get_quiz_questions         ← read, strips correct answers; widened in mig 118 to 15 RETURNS TABLE columns (+ question_type, dialog_template [tokens stripped to {{n}}], blanks_safe [index-only]) + active-user gate (security.md rule 12); supports multiple_choice, short_answer, dialog_fill; dialog_fill strip delimiter-hardened (mig 126) behind the mig-125 delimiter CHECK (#951)
  get_report_correct_options       ← read, returns correct option IDs for completed-session reports (student-scoped); active-user gate (mig 114, #856); reads from questions.correct_option_id (mig 114, #823)
  get_admin_report_correct_options ← read, same as above but org-scoped for admin (requires is_admin()); reads from questions.correct_option_id (mig 114, #823)
  check_quiz_answer                ← read, verify MC answer + return explanation (immediate feedback); reads from questions.correct_option_id (mig 117, #823); practice-mode only (smart_review/quick_quiz)
  check_non_mc_answer              ← read, verify short_answer or dialog_fill answer (immediate feedback); returns canonical + per-blank results; §15 carve-out; practice-mode only (smart_review/quick_quiz); SECURITY DEFINER; sibling of check_quiz_answer (mig 119, #697 Phase 2)
  submit_quiz_answer         ← write, atomic: single answer + response log + last_was_correct; idempotent dup-gate (mig 112, #856); reads from questions.correct_option_id (mig 112, #823); §15 frozen-config carve-out — no deleted_at filter on the question lookup (mig 123, #855)
  batch_submit_quiz          ← write, atomic: all answers + session complete + score + audit (mig 121, #697 Phase 2); per-type dispatch to internal helpers (_grade_record_mc/_short_answer/_dialog_fill, mig 120, REVOKE EXECUTE FROM PUBLIC, anon, authenticated); DISTINCT-question partial-credit scoring for dialog_fill (Decision 47); last_active_at stamped by trigger on quiz_sessions.ended_at update (mig 092); reads from questions.correct_option_id for MC grading (mig 121, #823)
  start_quiz_session         ← write, atomic: session + locked question set; validates p_question_ids (raises 'no_questions_provided' / 'invalid_question_ids' / 'too_many_questions' when array length > 500); single-active-session guard raises 'another_session_active' if any other-mode active session exists (mig 141, #1011)
  start_discovery_session    ← write, student: create the real ephemeral 'discovery' (Study Mode/Discovery) session row; persists the MC id set in config.question_ids; validates p_question_ids (mirrors start_quiz_session); single-active-session guard raises 'another_session_active' (mig 137, #1011); ephemeral + non-resumable (localStorage firewall rejects 'discovery') + nothing-scored; torn down by the endDiscovery Server Action (soft-delete) on Exit or auto-soft-deleted by the next start RPC; SECURITY DEFINER, EXECUTE TO authenticated
  start_exam_session         ← write, atomic: read exam config + random question selection + session creation (mock_exam mode); auto-completes overdue same-subject session before duplicate-active guard; single-active-session guard raises 'another_session_active' if a non-mock-exam active session exists (mig 138, #1011); maps unique_violation to friendly domain error (mig 088, #754); returns started_at
  upsert_exam_config         ← write, atomic: upsert exam_configs + replace exam_config_distributions (admin-only, SECURITY DEFINER)
  complete_overdue_exam_session ← write, atomic: close past-deadline mock_exam OR internal_exam OR vfr_rt_exam session, score from buffered answers, audit exam.expired / internal_exam.expired / vfr_rt_exam.expired (idempotent; widened in mig 063 / 20260429000008, extended for vfr_rt_exam in mig 102; last_active_at stamped by trigger on quiz_sessions.ended_at update; mig 092)
  complete_empty_exam_session ← write, atomic: 0-answer exam expiry → 0%/FAIL + audit (idempotent; widened for vfr_rt_exam in mig 102; last_active_at stamped by trigger on quiz_sessions.ended_at update; mig 092)
  issue_internal_exam_code   ← write, admin-only: generate 8-char single-use code, 24h validity, 5-retry collision handling, audit internal_exam.code_issued
  start_internal_exam_session ← write, student: validate & consume code, auto-complete overdue prior session, build question set from exam config, atomic code consumption via WHERE-clause race guard; single-active-session guard raises 'another_session_active' if a non-internal-exam active session exists (mig 139, #1011)
  void_internal_exam_code    ← write, admin-only: void unconsumed code or active session (sets session.passed = false), audit internal_exam.code_voided
  record_internal_exam_code_emailed ← write, admin-only: stamp `emailed_at = now()` on the code row + audit an admin emailing an internal exam code to a student (SECURITY DEFINER, mig 110; `emailed_at` column + stamp added in mig 20260629000900 / #905); guard set mirrors issue_/void_internal_exam_code per security.md rule 11b; no direct client call — invoked from Server Action `sendInternalExamCodeEmail` via best-effort audit pathway
  list_my_active_internal_exam_codes ← read, student: own unconsumed/unvoided/unexpired internal-exam codes WITHOUT the plaintext `code` column (closes #577; replaces direct SELECT after student policy was dropped in mig 20260521000004)
  list_my_internal_exam_history ← read, student: own internal_exam quiz_sessions history; computes per-subject `attempt_number` via row_number() in SQL (closes #579)
  start_vfr_rt_exam_session  ← write, student: VFR Radiotelephony mock exam start; samples 3 parts (short_answer, dialog_fill, multiple_choice) from seeded topics, reads exam_configs.parts_config (mig 099); idempotent resume for in-flight sessions (mig 099); single-active-session guard raises 'another_session_active' if a non-vfr_rt_exam active session exists (mig 140, #1011)
  get_vfr_rt_exam_questions  ← read, student: type-aware, answer-key-stripped question reads for a caller-owned vfr_rt_exam session (p_session_id); derives question IDs server-side from the session's frozen config.question_ids, callable in-flight AND post-exam; strips canonicals/synonyms/dialog_template details + explanation fields, shuffles MC options (mig 099b; session-derived signature + explanation strip in mig 105, #833/#840); dialog_fill strip delimiter-hardened (mig 127) behind the mig-125 delimiter CHECK (#951)
  submit_vfr_rt_exam_answers ← write, atomic: submit array of typed answers (one per blank), normalize + grade per-blank, compute per-part pcts ≥75% pass rule, audit vfr_rt_exam.completed / vfr_rt_exam.expired (mig 100); idempotent replay on already-ended session detects expiry via audit-event lookup and re-adds expired:true (mig 129, #839); reads from questions.correct_option_id for MC grading (mig 113, #823)
  get_study_questions        ← read, student: MC questions WITH the correct_option_id answer key + explanation, for Study Mode self-paced practice (UI label: **Discovery** — first/default segment of the New Quiz ModeToggle; RPC name stays `get_study_questions`); no score (this RPC reads keys only — the discovery-backed Study flow now has its own active `mode='discovery'` session row via start_discovery_session, mig 137/#1011); DELIBERATE answer-key exposure (mig 135, feat/study-mode-mc); org/active-user + deleted_at + status=active filters required (§15 carve-out does NOT apply — reads by arbitrary caller-supplied p_question_ids, not immutable frozen config); raises active_exam_session when the caller has a live mock/internal/vfr_rt exam (mid-exam answer-oracle guard, mirrors check_quiz_answer mig 117; red-team EO6); the guard is deny-by-default `mode NOT IN ('smart_review','quick_quiz','discovery')` so the caller's own discovery session does not block its key reads (mig 142, #1011); returns options in STORED order (no shuffle); SECURITY DEFINER, EXECUTE TO authenticated
  get_vfr_rt_exam_results    ← read, student: fetch completion-time answer key + per-question explanations + grading breakdown per part (mig 103; explanations added in mig 106, #840); gated to owner + ended session only — the single post-completion reveal point for answer keys (reads from questions.correct_option_id, mig 115, #823)
  get_question_authoring_fields ← read, admin-only: fetch answer-key columns (canonical_answer, accepted_synonyms, dialog_template, blanks_config, correct_option_id) for the question authoring UI; privilege-layer complement to column REVOKE (mig 094b / 114, #823); returns correct_option_id for MC questions
  normalize_answer           ← read (IMMUTABLE SQL helper): normalize free-text answer for grading (trim, lowercase, collapse hyphens/underscores, strip punctuation, trim again to remove stray edge spaces, preserve diacritics); used by submit_vfr_rt_exam_answers + complete_overdue_exam_session for vfr_rt_exam grading (mig 101, final trim added mig 128 / #921)
  complete_quiz_session      ← write, atomic: session end + score + audit (DEPRECATED for new code — use batch_submit_quiz; still supported for legacy modes (smart_review, quick_quiz, mock_exam, internal_exam); last_active_at now stamped by trigger on all completion paths, mig 092; legacy-mode whitelist rejects vfr_rt_exam with unsupported_session_mode, mig 104 #838; active-user gate rejects soft-deleted callers + FOR UPDATE session lock against double-completion, mig 104 PR #830)
  soft_delete_question       ← write, sets deleted_at
  get_student_progress       ← read, aggregated progress view
  get_daily_activity         ← read, analytics: daily answer counts (zero-filled)
  get_subject_scores         ← read, analytics: avg scores by subject
  get_question_counts        ← read, per-(subject, topic, subtopic) question counts; used by admin/exam-config, admin/syllabus, and the student quiz builder (quiz-subject-queries.ts); replaces client-side counting that truncated at the PostgREST 1000-row cap (#614, #668)
  get_random_question_ids    ← read, student: up to N random IDs from the filtered question pool (subject + topic/subtopic OR + unseen/incorrect/flagged UNION, AND-restricted by p_calc_mode {all|only|exclude} on has_calculations, p_has_image {all|only|exclude} on question_image_url presence, and optional p_question_type [NULL = unrestricted; Study Mode passes 'multiple_choice']); used by start_quiz_session seeding; replaces client-side fetch-shuffle-slice that biased sampling past row 1000 (#679, umbrella #668; calc-mode #837; has-image #864)
  get_filtered_question_counts ← read, student: per-(topic, subtopic) counts over the same filtered pool as get_random_question_ids (incl. p_calc_mode and p_has_image); structurally guaranteed count == quiz (shared _filtered_question_pool helper); replaces client-side counting that truncated at 1000 rows (#678, umbrella #668; calc-mode #837; has-image #864)
  get_student_mastery_stats  ← read, student: per-(subject) and per-(subject,topic) mastery counts (total=active questions, correct=distinct correct to non-deleted any-status questions); replaces client-side aggregation that truncated at the PostgREST 1000-row cap (#540, umbrella #668)
  get_student_streak         ← read, student: current + best daily-practice streak (all-time), computed in Postgres via gaps-and-islands over DISTINCT UTC response dates; replaces client-side computeStreaks over a .limit(10000) read that truncated at the 1000-row cap (#668)
  get_student_last_practiced ← read, student: most recent response timestamp per subject (all responses); retires the client-side questionSubjectMap + truncated questions read (#668)
  get_student_profile_stats  ← read, student: completed-session count + average score (single-row COUNT + AVG over own non-deleted, ended, non-null-score quiz_sessions); replaces the client-side count/average that truncated at the PostgREST 1000-row cap (#668 P2, profile.ts)
  record_auth_event          ← write, audit: records auth-related events (user.password_changed, user.password_reset, user.deactivated, user.created) after Server Action mutations. Self-defending: whitelist + role/org checks + best-effort (audit failure does not surface to caller). EXECUTE granted to authenticated, invoked through the acting user's client (not service role) so auth.uid() is the real actor.
  record_consent             ← write, GDPR: inserts one consent row for the caller; idempotent for accepted=true via an EXISTS pre-check on (user_id, document_type, document_version) (mig 085, #386)
  check_consent_status       ← read, GDPR: returns (has_tos, has_privacy) boolean flags for specified document versions
```

### Security Model

```sql
-- SECURITY INVOKER (default): RPC runs as the calling user, RLS applies
-- Use for: most reads and writes — RLS is your safety net
CREATE FUNCTION get_student_progress(...)
LANGUAGE plpgsql
AS $$ ... $$;

-- SECURITY DEFINER: RPC runs as the function owner (bypasses RLS)
-- get_quiz_questions and submit_quiz_answer are both SECURITY DEFINER
-- Use ONLY when: legitimate cross-table access that RLS would block
-- Mandatory: re-implement the security check manually inside the function
CREATE FUNCTION submit_quiz_answer(...)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public          -- ← always set this with SECURITY DEFINER
AS $$
BEGIN
  -- Re-implement auth check manually (RLS is bypassed)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  -- ... rest of function
END;
$$;
```

### The Core RPCs

#### `get_quiz_questions` — strips correct answers

Widened in **mig 118** (supabase `20260621000100`) to support non-MC question types (`short_answer`, `dialog_fill`) for the VFR RT training practice quiz. The previous body used `CROSS JOIN LATERAL jsonb_array_elements(q.options)`, which silently dropped every row whose `options` is `'[]'` (i.e. all non-MC rows). The correlated-subquery `CASE` form from mig 105 replaces it.

**Signature change:** `DROP FUNCTION IF EXISTS` required before `CREATE FUNCTION` (RETURNS TABLE widened — same precedent as mig 059 and mig 105).

**Active-user gate added (mig 118):** Soft-deleted callers are rejected (`user_not_found_or_inactive`) before the question SELECT — closes the rule-12 gap identified in #883. Mirrors `get_vfr_rt_exam_questions` (mig 105) and `check_quiz_answer` (mig 117).

**Answer-key stripping guarantees (security.md rule 1):**
- `multiple_choice` — options projected to `{id, text}` only (correct flag dropped), shuffled `ORDER BY random()` inside a correlated subquery.
- `short_answer` — `options` column returns NULL; `canonical_answer` and `accepted_synonyms` are never selected.
- `dialog_fill` — `dialog_template` has every `{{n|canonical; syn...}}` token rewritten to `{{n}}` via `regexp_replace`; `blanks_safe` is `[{index}]` only (`blanks_config` canonicals/synonyms stripped). The strip regex was **delimiter-hardened in mig 126/127 (#951)** — the value class `(?:[^}]|\}(?!\}))*` anchors on `}}` so a stray `}` in a value cannot terminate the strip early; paired with the mig-125 `questions_dialog_fill_template_wellformed` CHECK that forbids such values at INSERT.

```sql
-- Migration 118 — DROP + CREATE (RETURNS TABLE widened)
DROP FUNCTION IF EXISTS get_quiz_questions(uuid[]);

CREATE FUNCTION get_quiz_questions(p_question_ids uuid[])
RETURNS TABLE (
  id                    uuid,
  question_text         text,
  question_image_url    text,
  options               jsonb,    -- MC only: [{id, text}] shuffled; NULL for non-MC
  subject_code          text,
  topic_name            text,
  subtopic_name         text,
  lo_reference          text,
  difficulty            text,
  explanation_text      text,
  explanation_image_url text,
  question_number       text,
  question_type         text,     -- 'multiple_choice' | 'short_answer' | 'dialog_fill'
  dialog_template       text,     -- dialog_fill only: {{n}} markers (canonicals stripped); NULL otherwise
  blanks_safe           jsonb     -- dialog_fill only: [{index}] (canonicals stripped); NULL otherwise
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Active-user gate (security.md rule 12 / #883): soft-deleted callers rejected.
  PERFORM 1 FROM users u WHERE u.id = auth.uid() AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found_or_inactive';
  END IF;

  RETURN QUERY
  SELECT
    q.id,
    q.question_text,
    q.question_image_url,
    -- MC only: strip to {id, text}, shuffle (correlated-subquery, not LATERAL/GROUP BY
    -- which would silently drop non-MC rows whose options is '[]').
    CASE WHEN q.question_type = 'multiple_choice' THEN
      (SELECT jsonb_agg(
         jsonb_build_object('id', opt->>'id', 'text', opt->>'text')
         ORDER BY random()
       )
       FROM jsonb_array_elements(q.options) AS opt)
    ELSE NULL END AS options,
    s.code    AS subject_code,
    t.name    AS topic_name,
    st.name   AS subtopic_name,
    q.lo_reference,
    q.difficulty,
    q.explanation_text,
    q.explanation_image_url,
    q.question_number,
    q.question_type,
    -- dialog_fill only: rewrite {{n|...}} tokens to {{n}} markers.
    -- Value class hardened in mig 126 (#951): (?:[^}]|\}(?!\})) anchors on '}}'
    -- so a stray '}' in a value cannot end the strip early and leak a key.
    CASE WHEN q.question_type = 'dialog_fill' THEN
      regexp_replace(q.dialog_template, '\{\{(\d+)\|(?:[^}]|\}(?!\}))*\}\}', '{{\1}}', 'g')
    ELSE NULL END AS dialog_template,
    -- dialog_fill only: blank positions, canonicals/synonyms stripped.
    CASE WHEN q.question_type = 'dialog_fill' THEN
      (SELECT jsonb_agg(jsonb_build_object('index', (b->>'index')::int) ORDER BY (b->>'index')::int)
       FROM jsonb_array_elements(q.blanks_config) AS b)
    ELSE NULL END AS blanks_safe
  FROM questions q
  JOIN easa_subjects  s  ON s.id = q.subject_id
  JOIN easa_topics    t  ON t.id = q.topic_id
  LEFT JOIN easa_subtopics st ON st.id = q.subtopic_id
  WHERE q.id = ANY(p_question_ids)
    AND q.deleted_at IS NULL
    AND q.status = 'active';
END;
$$;

GRANT EXECUTE ON FUNCTION get_quiz_questions(uuid[]) TO authenticated;
```

**Randomization (migration 059):** MC options are returned in random order via `ORDER BY random()`. Non-MC types have no options array, so the CASE returns NULL.

#### `submit_quiz_answer` — atomic answer submission (deprecated: use `batch_submit_quiz`)

This RPC is superseded by `batch_submit_quiz` for new code. Kept for backwards compatibility.

**Security (migration 036, updated mig 112 #823, hardened mig 112 PR #856, §15 carve-out mig 123 #855):**
- Validates `p_question_id` is in the session's `config.question_ids` (migration 033). Prevents submitting answers for questions outside the session's question set.
- Soft-delete guard (session only): the session lookup filters `qs.deleted_at IS NULL` so a discarded (soft-deleted) session is rejected. The **question** lookup, by contrast, omits the `deleted_at` filter under the §15 frozen-config carve-out (mig 123, #855) — a question valid at session start stays submittable even if soft-deleted mid-session, aligned with `check_quiz_answer`.
- Option membership validation: verifies `p_selected_option` exists in the question's options JSONB array (which no longer carries `correct`, stripped by `trg_sanitize_question_options`). Prevents attackers from submitting arbitrary strings as option IDs.
- Correctness check: reads `questions.correct_option_id` (mig 112 #823) instead of the old JSONB scan of options[].correct. Compares `p_selected_option` against `correct_option_id` to derive `is_correct`.
- Mode whitelist (migration 095b, #838; narrowed in PR #830 cloud-CR review): rejects sessions whose `mode` is not in (`smart_review`, `quick_quiz`) with `unsupported_session_mode`. This RPC returns `is_correct`/`explanation`/`correct_option_id` immediately, so accepting exam-mode sessions would be a mid-exam answer oracle — exam submission goes exclusively through `batch_submit_quiz`; `vfr_rt_exam` goes through `submit_vfr_rt_exam_answers` (per-part grading, mig 100). Fail-closed: future modes must opt in explicitly.
- Active-user gate (migration 095b, PR #830 cloud-CR review): soft-deleted callers are rejected with `user not found or inactive` right after the auth check, before any session read — mirrors `batch_submit_quiz` (mig 095c).
- **Idempotency gate (migration 112, #856):** A duplicate submission (same session + question, possibly different option) skips the answer row insert (ON CONFLICT DO NOTHING on blank_index-aware unique key) and re-reads the persisted `is_correct` instead of accepting the duplicate option. This preserves consistency between the stored answer and the FSRS state: a retry never flips `last_was_correct`, preventing divergence between the append-only answer log and the FSRS signal.

> **⚠️ Abridged illustrative excerpt — NOT the deployed definition, does not compile as-is.** This snippet shows the core membership/correctness/idempotency flow only. It intentionally omits guards the live function carries (the active-user gate and the mode whitelist described above) and is missing variable declarations its body references (the active-user gate, mode-whitelist, and idempotency-branch locals, including `v_answer_inserted`). The authoritative, compiling definition is the latest `CREATE OR REPLACE FUNCTION submit_quiz_answer` migration (mig 123, #855; see the migration ledger and §15). A full fix would require transcribing that migration verbatim — declaring every referenced variable and including the active-user + mode-whitelist RAISE blocks — and re-syncing on every subsequent redefinition; the marker is kept instead to avoid a second source of truth that drifts.

```sql
CREATE OR REPLACE FUNCTION submit_quiz_answer(
  p_session_id        uuid,
  p_question_id       uuid,
  p_selected_option   text,
  p_response_time_ms  int
)
RETURNS TABLE (
  is_correct            boolean,
  explanation_text      text,
  explanation_image_url text,
  correct_option_id     text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id           uuid := auth.uid();
  v_org_id               uuid;
  v_correct_option       text;
  v_is_correct           boolean;
  v_expl_text            text;
  v_expl_image_url       text;
  v_session_ended        boolean;
  v_config               jsonb;
  v_session_question_ids uuid[];
  v_options              jsonb;
BEGIN
  -- Auth check
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Verify session belongs to this student, is still active, and not soft-deleted
  SELECT
    qs.organization_id,
    qs.ended_at IS NOT NULL,
    qs.config
  INTO v_org_id, v_session_ended, v_config
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id
    AND qs.student_id = v_student_id
    AND qs.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found';
  END IF;

  IF v_session_ended THEN
    RAISE EXCEPTION 'session already completed';
  END IF;

  -- Question membership check: p_question_id must be in session config.question_ids
  IF v_config IS NULL OR v_config->'question_ids' IS NULL OR jsonb_typeof(v_config->'question_ids') <> 'array' THEN
    RAISE EXCEPTION 'session config is malformed — question_ids not set';
  END IF;

  v_session_question_ids := ARRAY(
    SELECT jsonb_array_elements_text(v_config->'question_ids')
  )::uuid[];

  IF NOT (p_question_id = ANY(v_session_question_ids)) THEN
    RAISE EXCEPTION 'question does not belong to this session';
  END IF;

  -- Get correct answer, explanation, and full options array (service-level access).
  -- §15 carve-out (mig 123, #855): NO deleted_at filter — the question is reached only
  -- via the immutable write-once config.question_ids (membership verified above), so a
  -- question soft-deleted mid-session stays submittable, aligned with check_quiz_answer.
  -- See docs/database.md §3 "Scoring Soft-Deleted Questions" and docs/security.md §15.
  SELECT
    q.correct_option_id,  -- mig 112 #823: read the REVOKE-gated column, not options[].correct
    q.explanation_text,
    q.explanation_image_url,
    q.options
  INTO v_correct_option, v_expl_text, v_expl_image_url, v_options
  FROM questions q
  WHERE q.id = p_question_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'question not found';
  END IF;

  -- Validate selected option belongs to this question's options array
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_options) opt
    WHERE opt->>'id' = p_selected_option
  ) THEN
    RAISE EXCEPTION 'selected option does not belong to this question';
  END IF;

  v_is_correct := (p_selected_option = v_correct_option);

  -- Insert answer (idempotent: ignore duplicate on retry).
  INSERT INTO quiz_session_answers
    (session_id, question_id, selected_option_id, is_correct, response_time_ms)
  VALUES
    (p_session_id, p_question_id, p_selected_option, v_is_correct, p_response_time_ms)
  ON CONFLICT (session_id, question_id, blank_index) DO NOTHING;
  GET DIAGNOSTICS v_answer_inserted = ROW_COUNT;

  -- Only persist the response log + FSRS state when THIS call actually recorded the
  -- answer. A duplicate submit (same question, possibly a different option) must not
  -- flip fsrs_cards.last_was_correct — re-read the persisted is_correct instead (#856).
  IF v_answer_inserted = 0 THEN
    SELECT qsa.is_correct
    INTO v_is_correct
    FROM quiz_session_answers qsa
    WHERE qsa.session_id = p_session_id
      AND qsa.question_id = p_question_id
      AND qsa.blank_index IS NULL;
  ELSE
    -- Insert to immutable response log (idempotent)
    INSERT INTO student_responses
      (organization_id, student_id, question_id, session_id,
       selected_option_id, is_correct, response_time_ms)
    VALUES
      (v_org_id, v_student_id, p_question_id, p_session_id,
       p_selected_option, v_is_correct, p_response_time_ms)
    ON CONFLICT DO NOTHING;

    -- Update last_was_correct atomically within this transaction.
    INSERT INTO fsrs_cards (student_id, question_id, last_was_correct, updated_at)
    VALUES (v_student_id, p_question_id, v_is_correct, now())
    ON CONFLICT (student_id, question_id)
    DO UPDATE SET
      last_was_correct = EXCLUDED.last_was_correct,
      updated_at = now();
  END IF;

  RETURN QUERY SELECT v_is_correct, v_expl_text, v_expl_image_url, v_correct_option;
END;
$$;
```

#### `batch_submit_quiz` — atomic batch submission (all-or-nothing)

Submits all quiz answers in a single transaction. Replaces the per-answer `submit_quiz_answer` loop + separate `complete_quiz_session` call. Calculates scores and completes the session atomically — if any answer fails, the entire batch rolls back.

**Mig 121 (#697 Phase 2):** Redefined as a type-aware dispatcher supporting `multiple_choice`, `short_answer`, and `dialog_fill`. See Decision 47 in `docs/decisions.md`. Changes vs mig 112b: per-type dispatch to internal helpers; `_batch_questions` temp table widened to include `question_type`, `canonical_answer`, `accepted_synonyms`, `blanks_config`; duplicate guard keyed on `(question_id, blank_index)`; DISTINCT-question score aggregation.

**Key behavior:**
- Allows partial submissions. Study mode: score = `correct_credit / answered`. Exam mode: score = `correct_credit / total` (unanswered = wrong); incomplete mock_exam auto-fails regardless of score.
- Enforces server-side time limit with 30-second grace period; beyond grace period, auto-ends session with zero score and returns `expired: true`.
- `multiple_choice` — `_grade_record_mc` helper (mig 120): option-membership validation, writes quiz_session_answers + student_responses + fsrs_cards. MC guards are conditional (not forced for non-MC answers).
- `short_answer` — `_grade_record_short_answer` helper (mig 120): normalizes via `normalize_answer()`, writes quiz_session_answers + student_responses (blank_index = NULL, one row per question).
- `dialog_fill` — `_grade_record_dialog_fill` helper (mig 120): one call per blank (blank_index required in payload); writes quiz_session_answers + student_responses per blank.
- **Internal helpers (mig 120):** `_grade_record_mc/_short_answer/_dialog_fill` are each `SECURITY DEFINER SET search_path = public` with `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon, authenticated` — not callable via PostgREST by anon/authenticated users (`FROM PUBLIC` alone is insufficient: Supabase default-grants EXECUTE to anon/authenticated separately; #952). The dispatcher is the single authorization boundary; `service_role` (trusted backend) retains EXECUTE. See Decision 47.
- **DISTINCT-question score aggregation (mig 121, Decision 47):** a `dialog_fill` question with N blanks produces N `quiz_session_answers` rows but counts as one question. `v_correct_credit` (numeric) is the sum of per-question `LEAST(correct_rows / total_blanks, 1.0)` partial credit; `v_correct_count` (int) counts correct items (blank-rows) — `sum(correct_rows)` — unified with exam `submit_vfr_rt_exam_answers` (mig 132, #697 Phase 4). `v_answered` = DISTINCT question count (not row count). This matches `submit_vfr_rt_exam_answers` scoring so the same question type grades identically in practice and exam.
- Returns `answered_count`, `correct_count`, `score_percentage`, `passed` (boolean, exam mode only), and `expired` (boolean). `expired` is absent on normal completion; on idempotent replay of an expired session (replay branch), detects expiry via audit-event lookup (`event_type LIKE '%.expired'` — matches any mode-keyed expiry event for the owned session) and re-adds the flag, ensuring a retry returns the same `expired:true` payload as the original (mig 130, #839).
- **Active-user gate + cached `actor_role` (migration `20260430000012`):** after the `auth.uid()` check, the function loads the caller's role into `v_actor_role` from `users WHERE id = v_student_id AND deleted_at IS NULL`. `IF NOT FOUND` raises `'user not found or inactive'`. The cached local is reused in both audit INSERTs — closing the TOCTOU window (PR #599 CR root-cause fix).
- **Legacy-mode whitelist (migration 095c, #838; unchanged in mig 121):** rejects sessions whose `mode` is not in (`smart_review`, `quick_quiz`, `mock_exam`, `internal_exam`) with `unsupported_session_mode` — a `vfr_rt_exam` session must submit answers via `submit_vfr_rt_exam_answers` (per-part grading, mig 100). Fail-closed: future modes must opt in explicitly.
- **N+1 fix (migration 041; widened mig 121):** `CREATE TEMP TABLE _batch_questions` bulk-fetches all questions (now including `question_type`, `canonical_answer`, `accepted_synonyms`, `blanks_config`, `options`) before the answer loop. O(1) lookup per answer.

**Use this for:** finishing a quiz session with accumulated answers (deferred writes pattern).

```sql
-- Migration 121 — type-aware dispatcher (MC + short_answer + dialog_fill)
CREATE OR REPLACE FUNCTION batch_submit_quiz(
  p_session_id uuid,
  p_answers    jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id      uuid := auth.uid();
  v_actor_role      text;
  v_org_id          uuid;
  v_config          jsonb;
  v_mode            text;
  v_answer          jsonb;
  v_is_correct      boolean;
  v_expl_text       text;
  v_expl_image_url  text;
  v_question_id     uuid;
  v_results         jsonb := '[]'::jsonb;
  v_total           int;
  v_answered        int;
  v_correct_count   int;     -- correct item (blank-row) count (integer; stored column)
  v_correct_credit  numeric; -- partial-credit sum (numeric; score numerator — Decision 47)
  v_score           numeric(5,2);
  v_session_question_ids uuid[];
  v_qid_text        text;
  v_rt_text         text;
  v_ended_at        timestamptz;
  v_passed          boolean;
  v_pass_mark       int;
  v_time_limit      int;
  v_started_at      timestamptz;
  v_expired_event   text;
  v_completed_event text;
  -- per-answer dispatch variables (mig 121)
  v_qtype           text;
  v_selected        text;
  v_response_text   text;
  v_blank_text      text;
  v_blank_index     int;
  v_correct_option  text;
  v_options         jsonb;
  v_canonical       text;
  v_synonyms        text[];
  v_blanks          jsonb;
  v_fraction        numeric;
BEGIN
  IF v_student_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  -- Active-caller gate (rule 7) — caches actor_role for audit INSERT (rule 10).
  SELECT role INTO v_actor_role
  FROM users WHERE id = v_student_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found or inactive'; END IF;

  -- Session ownership + FOR UPDATE (rule 11 — quiz_sessions has multiple
  -- permissive SELECT policies; explicit student_id scope required).
  SELECT qs.organization_id, qs.total_questions, qs.config, qs.ended_at,
         qs.correct_count, qs.score_percentage, qs.mode,
         qs.time_limit_seconds, qs.started_at, qs.passed
  INTO v_org_id, v_total, v_config, v_ended_at, v_correct_count, v_score, v_mode,
       v_time_limit, v_started_at, v_passed
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id
    AND qs.student_id = v_student_id
    AND qs.deleted_at IS NULL
  FOR UPDATE;
  -- FOR UPDATE is acquired before the completed-session check intentionally:
  -- it serializes concurrent retries so the second caller sees v_ended_at IS NOT NULL
  -- and takes the replay path instead of double-writing. The read-only replay holds
  -- the lock briefly (two SELECTs) — acceptable trade-off vs. a TOCTOU two-phase check.

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found or not accessible';
  END IF;

  -- Idempotent replay: if session already completed, return existing results
  -- Idempotent replay: if session already completed, return existing results
  IF v_ended_at IS NOT NULL THEN
    SELECT count(DISTINCT qsa.question_id)::int INTO v_answered
    FROM quiz_session_answers qsa WHERE qsa.session_id = p_session_id;
    -- §15 carve-out: no deleted_at filter — question_ids are immutable write-once.
    SELECT jsonb_agg(jsonb_build_object(
      'question_id',           qsa.question_id,
      'is_correct',            qsa.is_correct,
      'correct_option_id',     q.correct_option_id,
      'explanation_text',      q.explanation_text,
      'explanation_image_url', q.explanation_image_url
    )) INTO v_results
    FROM quiz_session_answers qsa
    JOIN questions q ON q.id = qsa.question_id
    WHERE qsa.session_id = p_session_id;
    RETURN jsonb_build_object(
      'results', COALESCE(v_results, '[]'::jsonb),
      'total_questions', v_total, 'answered_count', v_answered,
      'correct_count', v_correct_count, 'score_percentage', v_score, 'passed', v_passed
    );
  END IF;

  -- Timer-expiry guard (30 s grace, parity with complete_overdue_exam_session).
  IF v_time_limit IS NOT NULL AND v_started_at IS NOT NULL THEN
    IF now() > v_started_at + (v_time_limit + 30) * interval '1 second' THEN
      UPDATE quiz_sessions
      SET ended_at = now(), correct_count = 0, score_percentage = 0, passed = false
      WHERE id = p_session_id;
      v_expired_event := CASE v_mode
        WHEN 'internal_exam' THEN 'internal_exam.expired' ELSE 'exam.expired' END;
      INSERT INTO audit_events
        (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
      VALUES (v_org_id, v_student_id, v_actor_role, v_expired_event, 'quiz_session', p_session_id,
        jsonb_build_object('total_questions', v_total, 'reason', 'submission past grace period'));
      RETURN jsonb_build_object('results', '[]'::jsonb, 'total_questions', v_total,
        'answered_count', 0, 'correct_count', 0, 'score_percentage', 0,
        'passed', false, 'expired', true);
    END IF;
  END IF;

  IF v_config IS NULL OR v_config->'question_ids' IS NULL
     OR jsonb_typeof(v_config->'question_ids') <> 'array' THEN
    RAISE EXCEPTION 'session config is malformed — question_ids not set';
  END IF;
  v_session_question_ids :=
    ARRAY(SELECT jsonb_array_elements_text(v_config->'question_ids'))::uuid[];

  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array'
     OR jsonb_array_length(p_answers) = 0 THEN
    RAISE EXCEPTION 'answers must be a non-empty JSON array';
  END IF;

  -- Duplicate guard on (question_id, blank_index): MC/short_answer carry blank_index
  -- NULL; dialog_fill has one entry per blank (mig 121).
  IF (
    SELECT count(*) <> count(DISTINCT
      lower(coalesce(e->>'question_id', '')) || '#' || coalesce(
        CASE WHEN e ? 'blank_index' AND (e->>'blank_index') ~ '^\d{1,4}$'
             THEN ((e->>'blank_index')::int)::text
             ELSE e->>'blank_index' END, ''))
    FROM jsonb_array_elements(p_answers) AS e
  ) THEN
    RAISE EXCEPTION 'duplicate question_id (or question_id+blank_index) in answers payload';
  END IF;

  -- Bulk-fetch all questions (widened in mig 121 to include non-MC fields).
  -- §15 carve-out: no deleted_at filter — IDs from immutable write-once config. See §3.
  DROP TABLE IF EXISTS _batch_questions;
  CREATE TEMP TABLE _batch_questions ON COMMIT DROP AS
  SELECT q.id, q.question_type,
         q.correct_option_id  AS correct_option,
         q.canonical_answer,
         q.accepted_synonyms,
         q.blanks_config,
         q.explanation_text,
         q.explanation_image_url,
         q.options
  FROM questions q WHERE q.id = ANY(v_session_question_ids);

  -- Per-answer dispatch loop (mig 121).
  FOR v_answer IN SELECT * FROM jsonb_array_elements(p_answers)
  LOOP
    v_qid_text      := v_answer->>'question_id';
    v_selected      := v_answer->>'selected_option';
    v_response_text := v_answer->>'response_text';
    v_blank_text    := v_answer->>'blank_index';
    v_rt_text       := coalesce(v_answer->>'response_time_ms', '0');

    IF v_qid_text IS NULL OR v_qid_text
       !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'invalid question_id format: %', coalesce(v_qid_text, 'NULL');
    END IF;
    IF v_rt_text !~ '^\d{1,9}$' THEN
      RAISE EXCEPTION 'answer for question % has invalid response_time_ms', v_qid_text;
    END IF;
    v_question_id   := v_qid_text::uuid;
    v_response_time := v_rt_text::int;
    v_blank_index   := NULL;
    IF v_blank_text IS NOT NULL AND v_blank_text ~ '^\d{1,4}$' THEN
      v_blank_index := v_blank_text::int;
    END IF;

    IF NOT (v_question_id = ANY(v_session_question_ids)) THEN
      RAISE EXCEPTION 'question % does not belong to session %', v_question_id, p_session_id;
    END IF;

    SELECT bq.question_type, bq.correct_option, bq.canonical_answer,
           bq.accepted_synonyms, bq.blanks_config,
           bq.explanation_text, bq.explanation_image_url, bq.options
    INTO v_qtype, v_correct_option, v_canonical, v_synonyms, v_blanks,
         v_expl_text, v_expl_image_url, v_options
    FROM _batch_questions bq WHERE bq.id = v_question_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'question not found: %', v_question_id; END IF;

    IF v_qtype = 'multiple_choice' THEN
      v_fraction := _grade_record_mc(
        p_session_id, v_student_id, v_org_id, v_question_id,
        v_selected, v_correct_option, v_options, v_response_time);
    ELSIF v_qtype = 'short_answer' THEN
      v_fraction := _grade_record_short_answer(
        p_session_id, v_student_id, v_org_id, v_question_id,
        v_response_text, v_canonical, v_synonyms, v_response_time);
    ELSIF v_qtype = 'dialog_fill' THEN
      IF v_blank_index IS NULL THEN
        RAISE EXCEPTION 'dialog_fill entry for question % missing blank_index', v_question_id;
      END IF;
      v_fraction := _grade_record_dialog_fill(
        p_session_id, v_student_id, v_org_id, v_question_id,
        v_blank_index, v_response_text, v_blanks, v_response_time);
    ELSE
      RAISE EXCEPTION 'unsupported question type % for question %', v_qtype, v_question_id;
    END IF;

    v_is_correct := (v_fraction = 1.0);
    v_results := v_results || jsonb_build_object(
      'question_id',           v_question_id,
      'is_correct',            v_is_correct,
      'correct_option_id',     v_correct_option,
      'explanation_text',      v_expl_text,
      'explanation_image_url', v_expl_image_url
    );
  END LOOP;

  -- DISTINCT-question score aggregation (mig 121, Decision 47): dialog_fill folds
  -- per-blank rows into partial credit. v_correct_credit (numeric) is the score
  -- numerator; v_correct_count (int) is the correct item (blank-row) count,
  -- unified with exam submit_vfr_rt_exam_answers (mig 132).
  WITH session_questions AS (
    SELECT q.id AS question_id,
           CASE WHEN q.question_type = 'dialog_fill'
                THEN greatest(jsonb_array_length(q.blanks_config), 1)
                ELSE 1 END AS total_blanks
    FROM questions q WHERE q.id = ANY(v_session_question_ids)
  ),
  graded AS (
    SELECT qsa.question_id,
           count(*) FILTER (WHERE qsa.is_correct)::int AS correct_rows
    FROM quiz_session_answers qsa
    WHERE qsa.session_id = p_session_id
    GROUP BY qsa.question_id
  )
  SELECT
    count(DISTINCT sq.question_id)::int,
    coalesce(sum(LEAST(coalesce(g.correct_rows, 0)::numeric / sq.total_blanks, 1.0)), 0),
    coalesce(sum(coalesce(g.correct_rows, 0)), 0)::int
  INTO v_answered, v_correct_credit, v_correct_count
  FROM session_questions sq
  JOIN graded g ON g.question_id = sq.question_id;  -- only answered questions

  IF v_mode IN ('mock_exam', 'internal_exam') THEN
    v_score := CASE WHEN v_total > 0
      THEN round((v_correct_credit / v_total) * 100, 2) ELSE 0 END;
  ELSE
    v_score := CASE WHEN v_answered > 0
      THEN round((v_correct_credit / v_answered) * 100, 2) ELSE 0 END;
  END IF;

  IF v_mode IN ('mock_exam', 'internal_exam') THEN
    v_pass_mark := (v_config->>'pass_mark')::int;
    v_passed    := CASE WHEN v_pass_mark IS NOT NULL THEN (v_score >= v_pass_mark) ELSE false END;
    IF v_mode = 'mock_exam' AND v_answered < v_total THEN v_passed := false; END IF;
  END IF;

  UPDATE quiz_sessions
  SET ended_at = now(), correct_count = v_correct_count,
      score_percentage = v_score, passed = v_passed
  WHERE id = p_session_id;

  -- Audit log
  v_completed_event := CASE v_mode
                         WHEN 'mock_exam'     THEN 'exam.completed'
                         WHEN 'internal_exam' THEN 'internal_exam.completed'
                         ELSE 'quiz_session.batch_submitted'
                       END;
  INSERT INTO audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id,
    v_student_id,
    v_actor_role,
    v_completed_event,
    'quiz_session',
    p_session_id,
    jsonb_build_object(
      'total_questions', v_total,
      'answered_count', v_answered,
      'correct_count', v_correct_count,
      'score', v_score,
      'passed', v_passed
    )
  );

  RETURN jsonb_build_object(
    'results', v_results,
    'total_questions', v_total,
    'answered_count', v_answered,
    'correct_count', v_correct_count,
    'score_percentage', v_score,
    'passed', v_passed
  );
END;
$$;
```

**Audit metadata keys (migration 082):** The completion audit event records `answered_count` and `correct_count` — aligned with the other exam-outcome events `complete_overdue_exam_session` and `complete_empty_exam_session`, which use the `*_count` form. (`start_exam_session` emits `exam.started` with pre-answer metadata only — no answer counts.) Migrations before 082 wrote the bare keys `answered` / `correct` for this one RPC; historical `audit_events` rows retain those keys (the table is append-only — security.md rule 5 — so they are not rewritten). No code or red-team spec reads either key.

**`exam.completed` event_type disambiguation (#571):** `exam.completed` is emitted by **two** RPCs and one event_type covers two distinct outcomes:
- `batch_submit_quiz` — a full answer submission. Metadata carries real `answered_count` / `correct_count` / `score` and has **no** `reason` key.
- `complete_empty_exam_session` — a zero-answer finish within the +30s grace window (see that RPC below; once the deadline passes, that RPC emits `exam.expired` with `reason = 'timed out with no answers'` instead, so the overdue case never reaches `exam.completed`). Metadata carries `answered_count = 0`, `correct_count = 0`, and `reason = 'completed with no answers'`.

A consumer filtering `event_type = 'exam.completed'` must inspect metadata to separate them: the presence of the `reason` key (equivalently `answered_count = 0`) marks the zero-answer in-grace path. No distinct event_type was introduced because no current consumer depends on the distinction; revisit if an analytics or red-team query later needs to query the two outcomes separately.

The same two-source pattern applies to the mode-branched variants: `internal_exam.completed` is emitted by `batch_submit_quiz` (full internal-exam submission) and `complete_empty_exam_session` (zero-answer in-grace); `vfr_rt_exam.completed` by `submit_vfr_rt_exam_answers` (mig 100 — metadata carries `part1_pct`/`part2_pct`/`part3_pct`/`passed_overall`, no `reason` key) and `complete_empty_exam_session`. In every mode, the presence of the `reason` key marks the zero-answer in-grace path.

#### `start_exam_session` — initiate a `mock_exam` session for a subject

Atomically reads the subject's `exam_configs` row, randomly selects questions per `exam_config_distributions`, creates a `quiz_sessions` row with `mode = 'mock_exam'`, and writes an `exam.started` audit event. Returns the new session id together with the question id list, timing, pass mark, and `started_at` so the caller can compute remaining time from the server clock.

**Purpose:** Called by the `startExamSession` Server Action (`apps/web/app/app/quiz/actions/start-exam.ts`) when a student opens an exam for a subject. Single round-trip — no separate "create then fetch questions" sequence.

**Auto-complete-then-guard sequence (migrations 050 / 052 / 054):** Before checking the duplicate-active-session guard, looks up any same-subject `mock_exam` session for this student past `started_at + (time_limit_seconds + 30 seconds)` and calls `complete_overdue_exam_session` on it. The +30s grace window matches `batch_submit_quiz` and `complete_overdue_exam_session` so all three RPCs agree on whether a session is overdue. A browser-crash exit during a previous attempt cannot indefinitely block the next one — the prior session is closed (with any buffered answers scored) before the duplicate guard runs.

**Org-scope filter (CR 3152802436, migration 054):** Both the overdue-lookup SELECT and the duplicate-active-session EXISTS check filter on `organization_id = v_org_id`. Without this filter, a session created while the student belonged to a previous organization could match here after a transfer, blocking the user from starting an exam in their current org.

**Question selection:** Iterates `exam_config_distributions` rows for the matching `exam_configs` row, ordered by `(topic_id, subtopic_id NULLS LAST)` (migration 046). `NULLS LAST` is load-bearing: subtopic-specific distribution rows are processed before the topic-level catch-all (`subtopic_id IS NULL`) for the same topic, and the running `id != ALL(v_selected_ids)` filter prevents the catch-all from exhausting the subtopic pool. For each distribution row, selects `question_count` ids from `questions` filtered by `subject_id`, `topic_id`, optional `subtopic_id`, `status = 'active'`, `deleted_at IS NULL`, `organization_id = v_org_id`, and `id != ALL(v_selected_ids)` (no cross-distribution duplicates), then `ORDER BY random() LIMIT v_dist.question_count`. RAISEs `not enough active questions for topic ... (subtopic ...)` if any distribution row under-delivers, and RAISEs `distribution total ... does not match configured total_questions ...` if the cumulative selection disagrees with `exam_configs.total_questions`.

**Defense-in-depth invariants:**
- `auth.uid()` check — rejects unauthenticated callers.
- Org-scope guard reads `organization_id` from `users` with `deleted_at IS NULL`; raises `user not found or inactive` otherwise.
- Mode is set as the literal `'mock_exam'` in the `INSERT INTO quiz_sessions` — not derived from a parameter.
- Audit `actor_role` subquery enforces `deleted_at IS NULL` per security.md rule #10 (audit-event subqueries are independent SELECTs and must validate soft-delete unconditionally).
- `SECURITY DEFINER SET search_path = public`.

**Audit event:** `exam.started` on `audit_events`, metadata `{ subject_id, total_questions, time_limit_seconds, pass_mark }`.

**Return shape:** `{ session_id, question_ids, time_limit_seconds, total_questions, pass_mark, started_at }`. `started_at` (added in migration 050) lets the client compute remaining time from the server clock instead of trusting its own local clock at start. The `quiz_sessions.config` JSONB persists `{ question_ids, exam_config_id, pass_mark }`; the row-level `started_at` and `time_limit_seconds` columns are the canonical timing source. The caller validates the payload with `StartExamRpcResultSchema.safeParse()` (`z.object()` default strips unknown keys), so additive return-shape changes do not break existing callers — only renames or removals do.

**Duplicate-active-session hardening (mig 088, #754):** The `uq_active_exam_session` partial unique index on `quiz_sessions` was widened from `(student_id, subject_id)` to `(student_id, organization_id, subject_id)` to align with `uq_internal_exam_session_active` and prevent a cross-org transfer edge case. The RPC now catches the `unique_violation` error (`23505`) raised by a concurrent racer that slips past the `IF EXISTS` guard and maps it to the friendly domain error `'an exam session is already in progress for this subject'`. Previously, a racer received a raw `23505` — the data-integrity invariant was always DB-enforced, but the error message was unmapped (was the residual in security.md §11 AL; now ENFORCED). The RPC also caches `actor_role` via a top-level `SELECT role FROM users` gate (mirrors mig 087 for the internal-exam RPCs), closing the TOCTOU window in the audit INSERT.

---

#### `complete_empty_exam_session` — close a zero-answer exam session (timer or manual)

Completes a `mock_exam`, `internal_exam`, or `vfr_rt_exam` session that has zero answers recorded. Sets `correct_count = 0`, `score_percentage = 0`, `passed = false`, and `ended_at = now()`. On RPC success the caller (`submitEmptyExamSession` in `apps/web/app/app/quiz/session/_hooks/quiz-submit.ts`) routes the student to `/app/quiz/report?session=<id>` showing 0% / FAIL; on RPC failure the caller falls back to `/app/quiz` so the student is not stranded mid-flow.

**Purpose:** Called by `submitEmptyExamSession` Server Action in two scenarios:
1. Timer fires and `answers.size === 0` (student ran out of time without answering)
2. Student manually finishes before the deadline with zero answers recorded

**Audit event branching (migration 053):** The RPC determines the actual deadline state and audits accordingly:
- **Deadline passed (beyond +30s grace)** → `exam.expired` (or `internal_exam.expired` / `vfr_rt_exam.expired`) event with reason "timed out with no answers"
- **Deadline not yet passed** → `exam.completed` (or `internal_exam.completed` / `vfr_rt_exam.completed`) event with reason "completed with no answers"

This ensures the audit trail reflects what actually happened, not a hard-coded assumption.

**Idempotency:** Safe to call twice. If `ended_at IS NOT NULL`, the function returns the real stored `score_percentage`, `passed`, and `answered_count` from `quiz_sessions` (not the hardcoded zeros). The `FOR UPDATE` lock already holds the row, so the re-read is safe and single-statement.

**Security model (migration 049, patched by migrations 051 & 053):**
- `auth.uid()` check — rejects unauthenticated callers.
- Org-scope guard — reads `organization_id` from `users` with `deleted_at IS NULL`.
- Ownership + org check — `FOR UPDATE` fetch requires `student_id = v_student_id AND organization_id = v_org_id AND deleted_at IS NULL`.
- Mode guard — raises if session is not `mock_exam`, `internal_exam`, or `vfr_rt_exam` (widened in migrations `20260429000008` and `20260610001200` — see the extension notes under `complete_overdue_exam_session` below).
- Audit log — appends an `*.expired` or `*.completed` event (mode-branched, see above) based on deadline state. The `actor_role` subquery enforces `deleted_at IS NULL` per security.md rule #10 (audit-event subqueries are independent SELECTs, not subordinate to outer guards).
- `SECURITY DEFINER SET search_path = public` — required pattern for all security-definer RPCs.

**Return shape:** `{ session_id, score_percentage, passed, total_questions, answered_count }`

---

#### `complete_overdue_exam_session` — close a past-deadline exam (Layer 1)

Completes a `mock_exam`, `internal_exam`, or `vfr_rt_exam` session whose deadline has passed. Computes score from any existing `quiz_session_answers` rows — partial answers are honoured, NOT zeroed. Sets `ended_at`, `correct_count`, `score_percentage`, `passed` and writes an `exam.expired` (or `internal_exam.expired` / `vfr_rt_exam.expired`) audit event.

**Grace window (migration 052):** The overdue threshold is `now() > started_at + (time_limit_seconds + 30 seconds)`, matching the grace window in `batch_submit_quiz`. This ensures the Layer 1 refresh check and the submit RPC never disagree on whether a session is overdue — a session within the grace window is not considered overdue by either path.

**Purpose (Layer 1, migration 050 / supabase 20260427000003):** Server-authoritative deadline enforcement. Called by:
1. `start_exam_session` itself, before raising "already in progress" — guarantees a browser-crash exit during an exam cannot block the next attempt indefinitely AND records the score from buffered answers.
2. A Server Action invoked by the report page or banner click after the client detects an expired session.

**Layer 2 (periodic sweeper)** is tracked under issue #558. Layer 1 alone enforces the deadline on every entry/access path; Layer 2 closes the residual window for sessions never re-entered.

**Score computation:**
- `v_score = round(correct_count / total_questions * 100, 2)` — unanswered count as wrong (formula imported from `batch_submit_quiz`'s `mock_exam` branch).
- `v_passed := (pass_mark IS NOT NULL AND v_score >= pass_mark)`. Mode-specific incompleteness rule (migration 063): an incomplete `mock_exam` (`answered < total`) auto-fails regardless of score; `internal_exam` allows partial submissions and is judged solely on the score-vs-pass-mark check.
- `vfr_rt_exam` sessions take a separate per-part grading branch that bypasses the `pass_mark`-based check entirely — see "VFR RT extension" below.

**Idempotency:** If `ended_at IS NOT NULL`, the function returns the stored `score_percentage`, `passed`, and a fresh `answered_count` from `quiz_session_answers`. The `FOR UPDATE` lock holds the row, so the re-read is safe.

**Defense-in-depth invariants:**
- `auth.uid()` check.
- Org-scope guard reads `organization_id` from `users` with `deleted_at IS NULL`.
- Ownership + org check — `FOR UPDATE` filter requires `student_id = v_student_id AND organization_id = v_org_id AND deleted_at IS NULL`.
- Mode guard — RAISE if mode is not `mock_exam`, `internal_exam`, or `vfr_rt_exam` (widened in migration `20260429000008`, then again in migration `20260610001200` — see the extension notes below).
- Overdue invariant — RAISE if `now() <= started_at + (time_limit_seconds + 30 seconds)`. Callers must not invoke for sessions within the grace window.
- Audit `actor_role` subquery enforces `deleted_at IS NULL` per security.md rule #10 (audit-event subqueries are independent SELECTs and must validate soft-delete unconditionally).
- `SECURITY DEFINER SET search_path = public`.

**Return shape:** `{ session_id, score_percentage, passed, total_questions, answered_count }` — identical to `complete_empty_exam_session` for caller symmetry.

**`start_exam_session` interaction:** Before raising the duplicate-active-session guard, `start_exam_session` looks up any same-subject `mock_exam` session past `started_at + (time_limit_seconds + 30 seconds)` and calls `complete_overdue_exam_session` on it. See the `start_exam_session` subsection above for the full sequence and the org-scope filter on the lookup.

**Internal-exam extension (migration `20260429000008`):** `complete_overdue_exam_session` and `complete_empty_exam_session` were widened from `mode = 'mock_exam'` to `mode IN ('mock_exam', 'internal_exam')`. The audit `event_type` is branched: `internal_exam.expired` / `internal_exam.completed` for internal-exam sessions, the existing `exam.*` events for mock-exam sessions.

**VFR RT extension (migration `20260610001200` / mig 102):** Both helpers' mode guards were widened again to `mode IN ('mock_exam', 'internal_exam', 'vfr_rt_exam')`, and the audit `event_type` branching gained `vfr_rt_exam.expired` / `vfr_rt_exam.completed`. For a `vfr_rt_exam` session, `complete_overdue_exam_session` replaces the `pass_mark`-based score computation with the per-part grading branch (mig 100 formulas): Part 1 = avg of binary correctness over `short_answer` questions, Part 2 = avg of `correct_blanks / total_blanks` over `dialog_fill` questions, Part 3 = avg of binary correctness over `multiple_choice` questions — missing answers score 0. `passed := (all three parts >= 75)`; the config `pass_mark` is not used. `score_percentage = round((p1 + p2 + p3) / 3, 2)` is informational only. Question rows are read via the write-once `config.question_ids` (immutable write-once exception, `docs/security.md` §15).

---

#### Internal Exam RPCs (mode `internal_exam`)

Three SECURITY DEFINER RPCs implement the internal-exam lifecycle. All three set `search_path = public`, gate via `auth.uid()`, and apply `deleted_at IS NULL` filters on every SELECT (including `actor_role` audit subqueries) per security.md rules 7, 9, 10.

##### `issue_internal_exam_code(p_subject_id, p_student_id)`

Admin-only. Generates a single-use 8-char code (Crockford-style alphabet, excludes `0/O/I/1`), inserts it with a 24-hour `expires_at`, and writes an `internal_exam.code_issued` audit event. Up-to-5 retries on UNIQUE collision; raises `code_generation_failed` if all retries collide.

**Guards:** `not_authenticated`, `not_admin`, `admin_not_found`, `student_not_found` (must be same-org student), `subject_not_found`, `exam_config_required` (an enabled `exam_configs` row must exist for the org+subject).

**Returns:** `(code_id uuid, code text, expires_at timestamptz)`.

##### `start_internal_exam_session(p_code)`

Student-facing. Validates the code, atomically consumes it, and creates a fresh `quiz_sessions` row with `mode = 'internal_exam'`. Question selection mirrors `start_exam_session` exactly — same `exam_config_distributions` algorithm, same `q.status = 'active'` and soft-delete filters.

**Validation order (each raises a distinct domain error string):** `code_not_found`, `code_not_yours`, `code_voided`, `code_already_used`, `code_expired`. Then resolves student org (`user not found or inactive`) and exam config (`exam_config_required`, `insufficient_questions_for_exam`).

**Race-safe consumption:** the row is `SELECT ... FOR UPDATE` locked; consumption is `UPDATE ... WHERE id = v_code_id AND consumed_at IS NULL` and raises `code_already_used` if `ROW_COUNT = 0`. Active duplicate-session guard (migration `20260429000010`): before issuing, the RPC looks up any same-subject `internal_exam` session past `(time_limit_seconds + 30)` seconds and calls `complete_overdue_exam_session` on it (mirrors `start_exam_session`).

**Audit:** `internal_exam.started` with `{ code_id, subject_id, total_questions, pass_mark }`.

**Returns:** `(session_id uuid, question_ids uuid[], time_limit_seconds int, total_questions int, pass_mark int, started_at timestamptz)`.

##### `void_internal_exam_code(p_code_id, p_reason)`

Admin-only. Three branches:

1. **Unconsumed** — sets `voided_at`, `voided_by`, `void_reason`. Audits `internal_exam.code_voided`.
2. **Consumed + active session** — locks the linked `quiz_sessions` row, computes a final score from existing `quiz_session_answers` (unanswered = wrong, identical to `complete_overdue_exam_session`), forces `passed = false`, sets `ended_at`, then voids the code. Writes **two** audit events: `internal_exam.expired` (session) and `internal_exam.code_voided` (code).
3. **Consumed + finished session** — refuses with `cannot_void_finished_attempt`. The RPC never retroactively changes a closed attempt.

**Guards:** `not_authenticated`, `not_admin`, `invalid_reason` (NULL or whitespace-only — POSIX `^[[:space:]]*$` — or > 500 chars), `admin_not_found`, `code_not_found` (also raised for cross-org access — same error to avoid leaking existence), `code_voided` (already voided), `cannot_void_finished_attempt`, `session_state_changed`. The last is raised in two cases for a consumed code: the org-scoped `SELECT ... FOR UPDATE` on the linked session finds no row (soft-deleted after consume, or cross-org — mig 084 fail-fast), or the subsequent `UPDATE` matches zero rows (a concurrent writer changed the session between SELECT and UPDATE). Both fail loudly rather than voiding the code on a phantom or mutated session.

**Returns:** `(code_id uuid, session_id uuid, session_ended boolean)`.

##### `start_internal_exam_session` — column qualification fix (migration `20260430000005`)

**Bug (CodeRabbit PR #576 round-2 + CI red-team failure):** The RPC `RETURNS TABLE(... time_limit_seconds int, ..., started_at timestamptz)` exposes those names as return-value variables. The function body's auto-complete SELECT referenced `time_limit_seconds` and `started_at` unqualified, creating ambiguity when checking whether an active session is past its grace window. Postgres raised error 42702 ("column reference is ambiguous") when the red-team spec exercised that code path.

**Fix:** `CREATE OR REPLACE` with `public.quiz_sessions AS qs` alias and full qualification on all column references (e.g., `qs.time_limit_seconds`). Function body otherwise unchanged from migration `20260429000010`.

##### `void_internal_exam_code` — org-scope defense-in-depth (migration `20260430000006`)

**Enhancement (CodeRabbit PR #576 round-2, Major):** The RPC validates that the code's `organization_id` matches the admin's, then locks and updates the linked `quiz_sessions` row by id only. This is a SECURITY DEFINER function bypassing RLS. If a future bug ever stored a cross-org `consumed_session_id`, the RPC would expire a foreign-org session.

**Fix:** `CREATE OR REPLACE` with explicit `qs.organization_id = v_admin_org` filter on both the SELECT and UPDATE of the linked session. Also asserts `ROW_COUNT > 0` after the UPDATE (raises `session_state_changed` if a concurrent writer stole the row). Function body otherwise unchanged from migration `20260429000009`.

##### `void_internal_exam_code` — strict blank-reason check (migration `20260507000001`)

**Bug (red-team finding, issue #108):** The blank-reason guard `btrim(p_reason) = ''` rejects empty strings and spaces-only inputs but accepts tabs (`\t`), newlines (`\n`), CR (`\r`), form feed (`\f`), and vertical tab (`\v`). Postgres `btrim(text)` defaults to a space charset; non-space whitespace passes through unchanged. The Server Action's Zod schema validates length only (`z.string().min(1).max(500)`), so the RPC is the only line of defense for non-whitespace content.

**Fix:** `CREATE OR REPLACE` with the guard rewritten to `p_reason ~ '^[[:space:]]*$'` (POSIX whitespace class — matches the empty string AND any whitespace-only input). Function body otherwise unchanged from migration `20260430000006`.

##### `record_internal_exam_code_emailed(p_code_id)` (base migration `20260618000001` / mig 110; `emailed_at` column + stamp added in migration `20260629000900` / #905)

Admin-only RPC (not a direct API endpoint — invoked from Server Action `sendInternalExamCodeEmail` via best-effort audit pathway). After its guards pass, it performs two writes: (1) stamps `emailed_at = now()` on the `internal_exam_codes` row (PK-scoped, `organization_id` + `deleted_at IS NULL` re-asserted); and (2) inserts one `internal_exam.code_emailed` audit event. Exists because `audit_events` blocks direct INSERTs via its `audit_no_direct_insert` RLS policy (`WITH CHECK false`), so all audit writes must flow through a SECURITY DEFINER function.

**Guard set:** Mirrors the sibling internal-exam RPCs (`issue_internal_exam_code`, `start_internal_exam_session`, `void_internal_exam_code`) per security.md rule 11b:
- Rule 7 — `auth.uid()` null-check raises `not_authenticated`
- `is_admin()` gate raises `not_admin`
- Active-user gate + rule 9 — org and role captured in one `deleted_at`-filtered users read; cached `v_admin_role` reused in the audit INSERT (mirrors mig 087; inlining a subquery would reverse that fix and require its own rule-10 filter)
- Rule 9 — `internal_exam_codes` ownership read is org-scoped and `deleted_at`-filtered, yielding `student_id` and `subject_id` metadata
- State guard — the code must also be un-consumed, un-voided, and unexpired (`consumed_at IS NULL`, `voided_at IS NULL`, `expires_at > now()`), mirroring the in-body state checks of `issue_`/`void_internal_exam_code`. The Server Action guards these before calling, so this is defense-in-depth for direct RPC calls; a code failing any state check is hidden behind `code_not_found` (existence-hiding, no new error mapping)
- Rule 10 — no inline audit subqueries; every value in the INSERT comes from the pre-read locals
- `SET search_path = public`

**Audit payload:** `event_type = 'internal_exam.code_emailed'`, `resource_type = 'internal_exam_code'`, `resource_id = p_code_id`, `metadata = { student_id, subject_id }`.

**Returns:** `void`.

**Security:** SECURITY DEFINER. Invoked from `sendInternalExamCodeEmail` Server Action (email subsystem half) after a Resend POST succeeds; failure to audit does not bubble to caller (best-effort, logs server-side only).

##### `list_my_active_internal_exam_codes()` (migration `20260521000002`)

Student-facing read. Returns the caller's currently usable internal-exam codes without the plaintext `code` column — the value is single-use and meaningful only at issuance time, so it is omitted from every subsequent read. Replaces the direct `SELECT FROM internal_exam_codes` path previously gated by the `student_read_active_codes` RLS policy (dropped in migration `20260521000004` so plaintext never leaves the issuance RPC). Closes issue #577.

**Security:** SECURITY DEFINER with `SET search_path = public`. Manual `auth.uid()` null check raises `not_authenticated`. SECURITY DEFINER bypasses RLS, so soft-delete and ownership filters are enforced explicitly inside the function.

**Filters (every SELECT):**
- `iec.student_id = auth.uid()` — ownership
- `iec.consumed_at IS NULL` — unused
- `iec.voided_at IS NULL` — not voided by admin
- `iec.expires_at > now()` — within 24h validity window
- `iec.deleted_at IS NULL` — not soft-deleted

`easa_subjects` is reference data with no `deleted_at` column, so the LEFT JOIN carries no soft-delete predicate.

Ordered by `expires_at ASC`, limited to 100 rows (the issuance ceiling is well below this — the cap is defensive).

```sql
CREATE OR REPLACE FUNCTION public.list_my_active_internal_exam_codes()
RETURNS TABLE (
  id uuid,
  subject_id uuid,
  subject_name text,
  subject_short text,
  expires_at timestamptz,
  issued_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
```

`GRANT EXECUTE ... TO authenticated`. No audit event — pure read.

##### `list_my_internal_exam_history()` (migration `20260521000003`)

Student-facing read. Returns the caller's `internal_exam` quiz-session history with a stable per-subject `attempt_number` computed server-side via `row_number() OVER (PARTITION BY subject_id ORDER BY started_at)`. The window function runs over **all** of the caller's sessions before `LIMIT 200` is applied, so the displayed `attempt_number` stays correct even when a subject has more than 200 total attempts. Closes issue #579 (TS-side counter restarted at row 200 because the client only saw a truncated slice).

**Security:** SECURITY DEFINER with `SET search_path = public`. Manual `auth.uid()` null check raises `not_authenticated`. SECURITY DEFINER bypasses RLS, so soft-delete and ownership filters are enforced explicitly.

**Filters:**
- `qs.student_id = auth.uid()` — ownership
- `qs.mode = 'internal_exam'` — mode scope
- `qs.deleted_at IS NULL` — not soft-deleted

`easa_subjects` is reference data with no `deleted_at` column, so the LEFT JOIN carries no soft-delete predicate.

**Answered count:** computed via a sibling CTE aggregating `quiz_session_answers` for the windowed session ids. `quiz_session_answers` has no `deleted_at` column (immutable table — see §1 Immutability and §3 carve-outs), so no soft-delete filter applies.

Ordered by `started_at DESC`, limited to 200 returned rows (window function ranks all rows first; LIMIT only truncates the display slice).

```sql
CREATE OR REPLACE FUNCTION public.list_my_internal_exam_history()
RETURNS TABLE (
  id uuid,
  subject_id uuid,
  subject_name text,
  subject_short text,
  started_at timestamptz,
  ended_at timestamptz,
  score_percentage numeric,
  passed boolean,
  total_questions int,
  answered_count int,
  attempt_number int
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
```

`GRANT EXECUTE ... TO authenticated`. No audit event — pure read.

---

#### `is_admin()` — admin role check (soft-delete fix, migration `20260429000001`)

`CREATE OR REPLACE FUNCTION public.is_admin()` body now includes `AND deleted_at IS NULL` on the `users` lookup. A soft-deleted admin row no longer satisfies `is_admin()`, closing a soft-delete bypass for every admin RLS policy and every admin-gated SECURITY DEFINER RPC. Promoted ahead of the new admin RPCs that depend on it.

---

#### `batch_submit_quiz` — internal-exam extension (migration `20260429000007`)

`CREATE OR REPLACE` of the version in `056` (mock-exam pass-computation revision). Two changes:

1. **All-answered guard restricted to `mock_exam`.** `internal_exam` is allowed to submit with `answered < total` (deliberate — internal exams support partial submission). Mock-exam still requires `answered_count = total_questions` after the +30s grace window.
2. **Pass computation extended.** `passed` is computed for both `mock_exam` and `internal_exam` (`score_percentage >= pass_mark`); for partial internal-exam submissions an under-`pass_mark` score auto-fails.

Audit `event_type` branches: `internal_exam.completed` for internal-exam sessions, `exam.completed` / `quiz_session.batch_submitted` for the existing modes.

**Migration `20260430000009`:** adds `AND q.deleted_at IS NULL` to the idempotent replay JOIN on `questions` (security.md §10, closes #531). The bulk-fetch temp table SELECT scoped by `config.question_ids` remains unfiltered — see §3 carve-out.

**Migration `20260430000012`:** adds a top-level active-user gate (`SELECT role INTO v_actor_role FROM users WHERE id = v_student_id AND deleted_at IS NULL` + `IF NOT FOUND RAISE 'user not found or inactive'`). Both audit INSERTs (timeout `exam.expired` / `internal_exam.expired`, completion `exam.completed` / `internal_exam.completed` / `quiz_session.batch_submitted`) read `v_actor_role` from the cached local instead of re-querying `users` — closes the TOCTOU window where a soft-delete between the gate and audit write would null the scalar subquery and abort the entire submission transaction (PR #599 CR root-cause fix). Co-mig: `20260430000010` makes the matching change for `start_quiz_session`.

---

#### `get_report_correct_options` — correct option IDs for reports

Returns correct option IDs for the questions answered in a completed session owned by the caller. The RPC derives that question set from `quiz_session_answers`, so the TypeScript layer never reads the raw `correct` boolean from options JSONB.

**Security:** Validates active-user status (`deleted_at IS NULL`), session ownership (`student_id = auth.uid()`), completion (`ended_at IS NOT NULL`), and soft-delete status. Raises exception if any check fails. The active-user gate (migration 114, #856) gates soft-deleted callers before the session-ownership check, closing the vector where a revoked student could still read their report's answer keys.

```sql
CREATE OR REPLACE FUNCTION get_report_correct_options(p_session_id uuid)
RETURNS TABLE (question_id uuid, correct_option_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Active-user gate (mig 114, #856): soft-deleted callers are rejected before the
  -- session read, so a revoked student with a live JWT cannot read their answer keys.
  PERFORM 1
  FROM users
  WHERE id = auth.uid()
    AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM quiz_sessions
    WHERE id = p_session_id
      AND student_id = auth.uid()
      AND ended_at IS NOT NULL
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Session not found, not owned, or not completed';
  END IF;

  -- Ownership verified above via EXISTS on quiz_sessions.
  -- This SECURITY DEFINER function bypasses RLS — do not remove the guard.
  RETURN QUERY
  SELECT DISTINCT ON (sa.question_id)
    sa.question_id, q.correct_option_id  -- mig 114 #823: collapsed LATERAL scan to the REVOKE-gated column
  FROM quiz_session_answers sa
  JOIN questions q ON q.id = sa.question_id
  WHERE sa.session_id = p_session_id
  ORDER BY sa.question_id;
END;
$$;
```

#### `get_admin_report_correct_options` — admin variant (org-scoped)

Same return shape as `get_report_correct_options` but scoped by organization instead of student. Allows admins to view correct answers for any completed session in their org.

**Security:** Validates `auth.uid()`, `is_admin()`, org membership, session completion (`ended_at IS NOT NULL`), and soft-delete status. Added in migration `20260406000005` + `20260406000006`.

**Used by:** `lib/queries/admin-quiz-report.ts` → admin session report page at `/app/admin/dashboard/sessions/[id]`.

#### `get_report_answer_keys` — non-MC answer keys for reports

Type-aware sibling of `get_report_correct_options`: delivers the correct answers for the **non-MC** questions answered in a completed session owned by the caller, so the report can show the canonical answer alongside the student's response. MC keys still come from `get_report_correct_options` (this RPC returns no rows for MC questions). Added in migration 133 (#697, VFR RT Phase 4).

**Returns:** `(question_id uuid, question_type text, blank_index int, answer_key text)` —
- `short_answer`: one row per question, `blank_index = NULL`, `answer_key = canonical_answer`.
- `dialog_fill`: one row **per blank** (`blank_index` from `blanks_config` `'index'`, `answer_key` from `'canonical'`).
- `multiple_choice`: no rows.

**Security:** Same guard set as `get_report_correct_options` — `auth.uid()` not null, active-user gate (`deleted_at IS NULL`), session ownership (`student_id = auth.uid()`), completion (`ended_at IS NOT NULL`), session soft-delete, `SET search_path = public`. Reads the REVOKE-gated answer-key columns (`canonical_answer`, `blanks_config`) under SECURITY DEFINER. The `questions` JOIN omits `deleted_at` under the §15 frozen-config carve-out (`quiz_session_answers.question_id` is a write-once FK on the immutable, append-only answers table) — see `docs/security.md` §15. All body columns are table-qualified to avoid a deferred `42702` against the OUT params.

**Used by:** `lib/queries/quiz-report-questions.ts` → the post-session report at `/app/quiz/report` (and the shared internal-exam report).

#### `check_quiz_answer` — verify answer + return explanation

Verifies a student's answer for a question during an active quiz session. Returns correctness, correct option ID, and explanation. Requires session ownership.

**Key behavior:**
- Active-user gate: soft-deleted callers are rejected (closes issue #823 hardening)
- Practice-mode guard: only `smart_review` and `quick_quiz` sessions are accepted; all other modes (`mock_exam`, `internal_exam`, `vfr_rt_exam`) are rejected with `unsupported_session_mode` (prevents a mid-exam answer oracle; exam modes use dedicated submit RPCs)
- Validates that the session belongs to the current student and is still active
- Validates that the question belongs to the session's locked question set (via immutable config.question_ids)
- Validates config.question_ids is properly formed (explicit NULL check for the array key)
- Returns only the correct option ID and explanation — never exposes the full options array
- Used for immediate feedback during quiz sessions (answers are typically batched later via `batch_submit_quiz`)

**Parameters:**
- `p_question_id` — UUID of the question being answered
- `p_selected_option_id` — the selected option ('a', 'b', 'c', or 'd')
- `p_session_id` — UUID of the active quiz session (added in migration 029 for security hardening)

**Returns:**
- `is_correct` — boolean indicating correctness
- `correct_option_id` — the correct option ('a', 'b', 'c', or 'd')
- `explanation_text` — explanation text for the question
- `explanation_image_url` — optional explanation image URL

```sql
CREATE OR REPLACE FUNCTION check_quiz_answer(
  p_question_id        uuid,
  p_selected_option_id text,
  p_session_id         uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id        uuid := auth.uid();
  v_config            jsonb;
  v_mode              text;
  v_correct_option_id text;
  v_explanation_text  text;
  v_explanation_image text;
  v_is_correct        boolean;
  v_session_question_ids uuid[];
BEGIN
  -- Auth guard
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Active-user gate: soft-deleted callers fail closed before the session read
  -- (mirrors submit_quiz_answer / batch_submit_quiz, mig 095b/110)
  PERFORM 1
  FROM users
  WHERE id = v_student_id
    AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;

  -- Session ownership: verify the student owns an active session
  SELECT qs.config, qs.mode
  INTO v_config, v_mode
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id
    AND qs.student_id = v_student_id
    AND qs.ended_at IS NULL
    AND qs.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found or not owned';
  END IF;

  -- Practice-mode guard: reject mock_exam / internal_exam so this RPC cannot be used
  -- as a mid-exam answer oracle (exam submission goes through batch_submit_quiz /
  -- submit_vfr_rt_exam_answers, which never return the key mid-session)
  IF v_mode NOT IN ('smart_review', 'quick_quiz') THEN
    RAISE EXCEPTION 'unsupported_session_mode';
  END IF;

  -- Guard against malformed config (matches pattern in batch_submit_quiz).
  -- jsonb_typeof(v_config->'question_ids') is NULL when the key is absent, and
  -- NULL <> 'array' is NULL (not true) — so the explicit IS NULL check is required
  -- or jsonb_array_elements_text below would run on a missing key.
  IF v_config IS NULL
     OR v_config->'question_ids' IS NULL
     OR jsonb_typeof(v_config->'question_ids') <> 'array' THEN
    RAISE EXCEPTION 'session config is malformed — question_ids not set';
  END IF;

  -- Verify question belongs to this session
  v_session_question_ids := ARRAY(SELECT jsonb_array_elements_text(v_config->'question_ids'))::uuid[];
  IF NOT (p_question_id = ANY(v_session_question_ids)) THEN
    RAISE EXCEPTION 'question % does not belong to session %', p_question_id, p_session_id;
  END IF;

  -- Fetch correct option and explanation.
  -- §15 carve-out (same posture as batch_submit_quiz): no deleted_at filter — the
  -- question is fetched via the immutable write-once quiz_sessions.config.question_ids
  -- (membership verified above; locked at session start by trg_quiz_sessions_immutable_columns,
  -- mig 079), so a question soft-deleted mid-session must still be answerable for
  -- immediate feedback. See docs/security.md §15 and docs/database.md §3.
  -- The MC key now lives in questions.correct_option_id (#823), not options[].correct.
  SELECT
    q.correct_option_id,
    q.explanation_text,
    q.explanation_image_url
  INTO v_correct_option_id, v_explanation_text, v_explanation_image
  FROM questions q
  WHERE q.id = p_question_id;

  IF NOT FOUND OR v_correct_option_id IS NULL THEN
    RAISE EXCEPTION 'question not found or has no correct option';
  END IF;

  v_is_correct := (p_selected_option_id = v_correct_option_id);

  RETURN jsonb_build_object(
    'is_correct',           v_is_correct,
    'correct_option_id',    v_correct_option_id,
    'explanation_text',     v_explanation_text,
    'explanation_image_url', v_explanation_image
  );
END;
$$;
```

#### `check_non_mc_answer` — immediate-feedback grader for short_answer and dialog_fill (mig 119)

Added in **mig 119** (supabase `20260621000200`, #697 Phase 2). Companion to `check_quiz_answer` (mig 117): that RPC handles `multiple_choice`; this one handles `short_answer` and `dialog_fill`. Both are practice-mode-only immediate-feedback graders.

**Guard set (mirrors `check_quiz_answer` exactly — security.md rule 11c sibling-guard consistency):**
1. Auth check — `auth.uid()` NULL raises `not_authenticated`.
2. Active-caller gate — soft-deleted callers raise `user_not_found_or_inactive` before any session read.
3. Session ownership — `quiz_sessions` has multiple permissive SELECT policies; explicit `qs.student_id = v_student_id` scope required (security.md §3 / rule 11).
4. Practice-mode whitelist — only `smart_review` and `quick_quiz`; all others raise `unsupported_session_mode` (prevents a mid-exam answer oracle; exam grading goes through `submit_vfr_rt_exam_answers`).
5. Config-shape guard — explicit NULL check on `v_config->'question_ids'` before `jsonb_typeof`.
6. Membership check — `p_question_id` must be in `config.question_ids`; **must precede the answer-key column read** (§15 ordering).
7. Question row read (answer-key columns) — §15 carve-out: no `deleted_at` filter (accessed via immutable write-once `config.question_ids`; locked by `trg_quiz_sessions_immutable_columns`, mig 079).
8. Type gate — rejects `multiple_choice` with `unsupported_question_type` (those go through `check_quiz_answer`).

**§15 carve-out:** `check_non_mc_answer` joins the practice-grader family alongside `check_quiz_answer` in the `docs/security.md §15` carve-out list. See also §3 "Other functions sharing this carve-out" above.

**Return shape** (`RETURNS jsonb`):
```json
{
  "is_correct": true,
  "correct_answer": "Wilco",          // short_answer: canonical; null for dialog_fill
  "blanks": [                          // dialog_fill: per-blank results; null for short_answer
    { "index": 0, "is_correct": true, "canonical": "Wilco" },
    { "index": 1, "is_correct": false, "canonical": "Negative" }
  ],
  "explanation_text": "...",
  "explanation_image_url": null
}
```

**Grading semantics:**
- `short_answer` — `p_response_text` required, `p_blank_answers` must be NULL. Uses `normalize_answer()` (mig 101) for case/whitespace/punctuation-insensitive comparison against `canonical_answer` and `accepted_synonyms`.
- `dialog_fill` — `p_blank_answers` (jsonb array of `{blank_index, response_text}`) required, `p_response_text` must be NULL. Top-level `is_correct` is true only when every blank in `blanks_config` was both answered AND correct (full-coverage denominator via `DISTINCT count` — mirrors the exam grader `submit_vfr_rt_exam_answers`, mig 100).

**Parameters:**
- `p_question_id` — UUID of the question being answered
- `p_session_id` — UUID of the active quiz session
- `p_response_text` — student's free-text answer (`short_answer` only; NULL for `dialog_fill`)
- `p_blank_answers` — array of `{blank_index, response_text}` objects (`dialog_fill` only; NULL for `short_answer`)

**Signature:**
```sql
CREATE OR REPLACE FUNCTION check_non_mc_answer(
  p_question_id  uuid,
  p_session_id   uuid,
  p_response_text text DEFAULT NULL,
  p_blank_answers jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
```

`GRANT EXECUTE ON FUNCTION check_non_mc_answer(uuid, uuid, text, jsonb) TO authenticated;`

---

#### `get_study_questions` — MC answer keys for Study Mode (mig 135)

Added in **mig 135** (feat/study-mode-mc). Dedicated RPC for self-paced MC practice, deliberately returning the `correct_option_id` answer key and explanation immediately (this RPC reads keys only and writes nothing — no score). Since #1011 the discovery-backed Study flow has its **own active `mode='discovery'` session row** (`start_discovery_session`, mig 137), still non-resumable and nothing-scored; the mig 142 guard excludes that `discovery` row so Study does not self-trip (item 6 below). Exam-integrity is preserved by the active-exam-session guard, not by the absence of a session — mock/internal/VFR-RT exams grade from the same org MC pool, so without that guard a student mid-exam could read their live exam's keys.

**DELIBERATE answer-key exposure.** Unlike `get_quiz_questions` (mig 126, answer keys REVOKE-gated and never exposed during an active session) and the post-session report RPCs (answer keys returned only after `ended_at IS NOT NULL`), Study Mode is a **practice flashcard surface** where the student is **shown the correct answer on demand**. This RPC therefore returns `correct_option_id` and explanation directly as part of the question payload. It is SECURITY DEFINER so it can read the REVOKE-gated column; `correct_option_id` is **not exposed via any PostgREST column GRANT** (see docs/security.md rule 1) — only this guarded RPC reveals it.

**Guard set (mirrors `get_quiz_questions`+`get_report_answer_keys` — security.md rules 1, 7, 9, 11/12 / #883):**
1. Auth check — `auth.uid()` NULL raises `Not authenticated`.
2. Active-caller gate — soft-deleted callers raise `user_not_found_or_inactive` before any question read (security.md rule 12).
3. Tenant-scope gate — resolves the caller's `organization_id` in one deleted_at-filtered read from `users`. Scopes the question pool so a foreign-org ID cannot leak. SECURITY DEFINER bypasses RLS; without this gate a caller passing foreign `p_question_ids` could read another org's questions (and their answer keys).
4. Soft-delete filter — `q.deleted_at IS NULL` and `q.status = 'active'` (see §15 carve-out note below).
5. Type filter — `q.question_type = 'multiple_choice'` (Study Mode is MC-only).
6. **Mid-exam answer-oracle guard** — deny-by-default: raises `active_exam_session` when the caller has any active session (`ended_at IS NULL AND deleted_at IS NULL`) whose mode is outside the practice/discovery set (`mode NOT IN ('smart_review','quick_quiz','discovery')`, the `'discovery'` exclusion added in mig 142/#1011), so any current OR future exam-like mode is blocked automatically (the current exam modes are `mock_exam`/`internal_exam`/`vfr_rt_exam`). Server-side enforcement of the single-active-session rule: Study Mode reveals keys, and exams grade from the same MC pool with client-visible question IDs, so it must refuse mid-exam (the UI gate is bypassable; this RPC is `GRANT EXECUTE TO authenticated`). Practice modes (`smart_review`/`quick_quiz`) are excluded — they already reveal answers via `check_quiz_answer`; the caller's own `discovery` session is excluded (mig 142) because Discovery reveals answers via *this* RPC, so its own active session row must not self-trip the guard. Mirrors `check_quiz_answer`'s exam-mode rejection (mig 117). Red-team: Vector EO6.
7. SET search_path = public.

**§15 carve-out does NOT apply.** Report RPCs (`get_quiz_questions`, `get_report_answer_keys`) may omit the `deleted_at` filter because they read questions via the immutable, write-once `quiz_sessions.config.question_ids` column. Study Mode reads questions by **arbitrary caller-supplied `p_question_ids`**, so the soft-delete filter and `status='active'` guard are **REQUIRED** — a caller must not be able to surface a soft-deleted or retired question's answer key.

**Options format** — returned in **STORED order** (not shuffled). The answer is shown in Study Mode, so shuffling adds no value; a stable order is friendlier for students reviewing the same question multiple times.

**Return shape** (`RETURNS TABLE`):

```sql
id                    uuid,      -- question id
question_text         text,
question_image_url    text,
options               jsonb,     -- [{id, text}] in stored order (no shuffle)
correct_option_id     text,      -- MC answer key: 'a'|'b'|'c'|'d' (DELIBERATE exposure)
subject_code          text,
topic_name            text,
subtopic_name         text,
explanation_text      text,      -- revealed immediately
explanation_image_url text,
question_number       text,
difficulty            text
```

**Parameters:**
- `p_question_ids` — array of question UUIDs to fetch (no session association)

**Signature:**

```sql
CREATE OR REPLACE FUNCTION get_study_questions(p_question_ids uuid[])
RETURNS TABLE (
  id uuid, question_text text, question_image_url text, options jsonb,
  correct_option_id text, subject_code text, topic_name text, subtopic_name text,
  explanation_text text, explanation_image_url text, question_number text, difficulty text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
```

`GRANT EXECUTE ON FUNCTION get_study_questions(uuid[]) TO authenticated;`

---

#### `start_quiz_session` — locks question set atomically

**Migration history:** `20260430000008` — adds `AND deleted_at IS NULL` to the audit `actor_role` subquery on `users` (security.md §10, closes #573). `20260430000010` — replaces the scattered `users` subqueries with a single top-level active-user gate (`SELECT organization_id, role INTO v_org_id, v_role ... AND deleted_at IS NULL` + `IF NOT FOUND RAISE 'user not found or inactive'`); both INSERTs now read from the locals (PR #599 CR root-cause fix). `20260506000001_start_quiz_session_harden_input.sql` — adds input validation on `p_question_ids` (closes #622). `20260508000001_start_quiz_session_mode_whitelist.sql` — hard whitelist on `p_mode`: rejects `mock_exam` and `internal_exam` (which must be created exclusively by `start_exam_session` and `start_internal_exam_session`) with `mode_not_allowed` (closes #629). `20260606000002` — adds NULL guard to mode check (`p_mode IS NULL OR p_mode NOT IN (...)`) and a 500-element cap on `p_question_ids`: raises `too_many_questions` when `array_length(p_question_ids, 1) > 500` (mig 086, #275; matches the Zod cap in the Server Action). **mig 141 (`20260629000600`, #1011)** — adds the single-active-session guard: after the active-user gate it auto-soft-deletes the caller's own abandoned `discovery` row, then raises `another_session_active` if any other active session exists (the structural complement to the answer-key oracle guards — see §11d in `docs/security.md`); also adds an `array_ndims(p_question_ids) <> 1` flat-array guard (rejects a multidimensional array that `to_jsonb()` would persist as nested JSON) and wraps the INSERT in an `EXCEPTION WHEN unique_violation` handler mapping the global `uq_one_active_session_per_student` index (mig 136) race to the same `another_session_active` token.

**Validation contract** (raised in this order: auth → mode whitelist → active-user gate → single-active-session guard → input validation):
- `'Not authenticated'` — `auth.uid()` returns NULL.
- `'mode_not_allowed'` — `p_mode` IS NULL or is not in `('smart_review','quick_quiz')`. Runs immediately after the auth check (before the active-user gate) so attackers cannot probe `'user inactive'` vs `'mode invalid'` via timing or error differences. mock_exam sessions are created exclusively by `start_exam_session` (mig 040) after exam config validation; internal_exam sessions by `start_internal_exam_session` (mig 058).
- `'user not found or inactive'` — caller soft-deleted between auth and gate.
- `'another_session_active'` (mig 141, #1011) — the caller already holds another active session in any other mode. The guard first auto-soft-deletes the caller's own abandoned `discovery` row, then raises if any other active (`ended_at IS NULL AND deleted_at IS NULL`) session exists. Practice never resumes server-side, so there is no self-exclusion. Also raised by the INSERT's `unique_violation` handler as the concurrent-race backstop against the global `uq_one_active_session_per_student` index (mig 136).
- `'no_questions_provided'` — `p_question_ids` is NULL or empty (`array_length(...) IS NULL`).
- `'too_many_questions'` — `array_length(p_question_ids, 1) > 500` (mig 086, #275), checked immediately after the `no_questions_provided` guard. Cap matches the Zod schema in the Server Action; a direct RPC caller cannot bypass it.
- `'invalid_question_ids'` — raised in three cases: (a) `p_question_ids` contains a duplicate UUID (set-based `count(DISTINCT)` mismatch with `array_length`), (b) at least one UUID does not resolve to a question that is in the caller's organization, has `status = 'active'`, has `deleted_at IS NULL`, and matches `p_subject_id` / `p_topic_id` when those parameters are non-NULL, or (c) `p_question_ids` is multidimensional (`array_ndims <> 1`, mig 141).
- `p_subject_id` and `p_topic_id` MAY be NULL (smart_review mode crosses subjects/topics); the per-question subject/topic match is skipped for the NULL parameter, while the org + active + soft-delete checks always apply.

```sql
CREATE OR REPLACE FUNCTION start_quiz_session(
  p_mode         text,
  p_subject_id   uuid,
  p_topic_id     uuid,
  p_question_ids uuid[]    -- pre-selected by application, locked here
)
RETURNS uuid               -- session id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_role text;
  v_count int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Mode whitelist (mig 081/086, closes #629): only student-facing practice modes.
  -- NULL p_mode also raises mode_not_allowed (mig 086 null-guard).
  -- mock_exam => start_exam_session; internal_exam => start_internal_exam_session.
  IF p_mode IS NULL OR p_mode NOT IN ('smart_review', 'quick_quiz') THEN
    RAISE EXCEPTION 'mode_not_allowed';
  END IF;

  -- Top-level active-user gate (PR #599): one lookup, then reuse v_org_id / v_role
  -- in both INSERTs below. Replaces three scattered subqueries on `users`.
  SELECT organization_id, role
  INTO v_org_id, v_role
  FROM users
  WHERE id = v_uid
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;

  -- Single-active-session invariant (mig 141, #1011; index mig 136): at most one
  -- active session per student across ALL modes. Auto-clear an abandoned ephemeral
  -- Discovery row, then block on ANY other active session (practice never resumes
  -- server-side, so no self-exclusion).
  UPDATE quiz_sessions SET deleted_at = now()
   WHERE student_id = v_uid AND mode = 'discovery'
     AND ended_at IS NULL AND deleted_at IS NULL;
  IF EXISTS (
    SELECT 1 FROM quiz_sessions qs
     WHERE qs.student_id = v_uid
       AND qs.ended_at IS NULL AND qs.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'another_session_active';
  END IF;

  -- Input validation (mig 20260506000001, closes #622).
  IF p_question_ids IS NULL OR array_length(p_question_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no_questions_provided';
  END IF;

  -- Reject a multidimensional array (mig 141): to_jsonb() would otherwise persist
  -- nested JSON in config.question_ids. Practice ids must be a flat uuid[].
  IF array_ndims(p_question_ids) <> 1 THEN
    RAISE EXCEPTION 'invalid_question_ids';
  END IF;

  -- Array length cap (mig 086, #275): mirrors the Zod cap in the Server Action.
  IF array_length(p_question_ids, 1) > 500 THEN
    RAISE EXCEPTION 'too_many_questions';
  END IF;

  -- Reject duplicate UUIDs (would otherwise silently double-count below).
  SELECT count(DISTINCT qid) INTO v_count
  FROM unnest(p_question_ids) AS qid;
  IF v_count <> array_length(p_question_ids, 1) THEN
    RAISE EXCEPTION 'invalid_question_ids';
  END IF;

  -- Verify every UUID resolves to an active, in-org, non-deleted question
  -- matching the (subject, topic) scope. NULL p_subject_id / p_topic_id =>
  -- smart_review mode; the corresponding match is skipped, but org + active +
  -- soft-delete checks always apply.
  SELECT count(*) INTO v_count
  FROM unnest(p_question_ids) AS qid
  JOIN public.questions q ON q.id = qid
  WHERE q.organization_id = v_org_id
    AND (p_subject_id IS NULL OR q.subject_id = p_subject_id)
    AND (p_topic_id   IS NULL OR q.topic_id   = p_topic_id)
    AND q.status = 'active'
    AND q.deleted_at IS NULL;

  IF v_count <> array_length(p_question_ids, 1) THEN
    RAISE EXCEPTION 'invalid_question_ids';
  END IF;

  -- Race backstop (mig 141): the global uq_one_active_session_per_student index
  -- (mig 136) catches a concurrent start that also passed the pre-check guard;
  -- map it to the same single-active error.
  BEGIN
    INSERT INTO quiz_sessions
      (organization_id, student_id, mode, subject_id, topic_id,
       config, total_questions)
    VALUES (
      v_org_id,
      v_uid,
      p_mode,
      p_subject_id,
      p_topic_id,
      jsonb_build_object('question_ids', to_jsonb(p_question_ids)),
      array_length(p_question_ids, 1)
    )
    RETURNING id INTO v_session_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'another_session_active';
  END;

  -- Audit log
  INSERT INTO audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id)
  VALUES (
    v_org_id,
    v_uid,
    v_role,
    'quiz_session.started',
    'quiz_session',
    v_session_id
  );

  RETURN v_session_id;
END;
$$;
```

#### `get_daily_activity` — analytics: daily answer counts

Returns daily answer totals for the last N days, zero-filled via `generate_series`.

**Parameters:**
- `p_days` — clamped to [1, 365] via RAISE EXCEPTION if out of range

```sql
CREATE OR REPLACE FUNCTION get_daily_activity(
  p_student_id UUID,
  p_days       INT DEFAULT 30
)
RETURNS TABLE (day DATE, total BIGINT, correct BIGINT, incorrect BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
-- Auth: auth.uid() NULL check + IS DISTINCT FROM guard + WHERE clause
-- Validation: p_days must be 1–365, raises exception if outside range
```

#### `get_subject_scores` — analytics: average scores by subject

Returns average quiz scores for the N most recently tested subjects.

**Parameters:**
- `p_limit` — clamped to [1, 100] via RAISE EXCEPTION if out of range

```sql
CREATE OR REPLACE FUNCTION get_subject_scores(
  p_student_id UUID,
  p_limit      INT DEFAULT 5
)
RETURNS TABLE (subject_id UUID, subject_name TEXT, subject_short TEXT, avg_score NUMERIC, session_count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
-- Auth: auth.uid() NULL check + IS DISTINCT FROM guard + WHERE clause
-- Validation: p_limit must be 1–100, raises exception if outside range
```

#### `is_admin()` — Admin role check helper

Returns `boolean`. SECURITY DEFINER with `SET search_path = public`.
Checks `auth.uid()` against `users.role = 'admin'` AND `deleted_at IS NULL` (migration 20260429000001). Returns `false` (not an exception) when no user is authenticated, so it is safe to call from RLS policies without causing errors for unauthenticated requests.

Used by RLS policies on `easa_subjects`, `easa_topics`, `easa_subtopics` to gate INSERT/UPDATE/DELETE to active admin users only. Also used on `internal_exam_codes` — but as of migration `20260521000004`, only the admin SELECT policy remains. Admin issue/void RPCs (`issue_internal_exam_code`, `void_internal_exam_code`) re-check `is_admin()` internally; student code consumption via `start_internal_exam_session` is authorized by ownership/code validation, not admin role.

```sql
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin' AND deleted_at IS NULL
  );
END;
$$;
```

#### `record_login` — audit login events (CAA compliance)

Records a `student.login` event in `audit_events` after successful email+password sign-in. Called from the `/auth/login-complete` server route.

**Security:**
- `SECURITY DEFINER` with `SET search_path = public` and manual `auth.uid()` check.
- Queries `users` with `deleted_at IS NULL` — soft-deleted users cannot generate audit events (SECURITY DEFINER bypasses RLS, so this filter is mandatory).
- 60-second rate limit prevents duplicate events from rapid re-logins.

```sql
CREATE OR REPLACE FUNCTION record_login()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid    UUID := auth.uid();
  _org_id UUID;
  _role   TEXT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT organization_id, role INTO _org_id, _role
  FROM users WHERE id = _uid AND deleted_at IS NULL;

  IF _org_id IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;

  -- Rate-limit: skip if login recorded in last 60 seconds
  IF EXISTS (
    SELECT 1 FROM audit_events
    WHERE actor_id = _uid AND event_type = 'student.login'
      AND created_at > now() - interval '60 seconds'
  ) THEN RETURN; END IF;

  INSERT INTO audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, metadata)
  VALUES (_org_id, _uid, _role, 'student.login', 'session',
    jsonb_build_object('method', 'password'));
END;
$$;
```

#### `record_auth_event` — audit events for auth Server Actions

Records authentication-related audit events (`user.password_changed`, `user.password_reset`, `user.deactivated`, `user.created`) after successful auth mutations. Called from Server Actions: `changePassword`, `resetStudentPassword`, `toggleStudentStatus` (deactivate path), and `createStudent`. Auth mutations were previously unaudited; this RPC provides a generic, self-defending audit interface.

**Security:**
- `SECURITY DEFINER` with `SET search_path = public` and manual `auth.uid()` check.
- Actor ID and role are derived from `auth.uid()` via a `deleted_at`-filtered `users` lookup (security.md §7 + §10) — never from caller input.
- `event_type` is whitelisted. Self-service event (`user.password_changed`) forces `resource_id = actor_id`. Admin events (`user.password_reset`, `user.deactivated`, `user.created`) require the caller's role = `'admin'`. The RPC does **not** re-SELECT the resource to org-scope it: such a lookup would need an `AND deleted_at IS NULL` filter per security.md §9, which would reject the `user.deactivated` audit (whose target is already soft-deleted by audit time). The audit row's `organization_id` is always the **actor's** org, so a bogus `resource_id` only adds a self-referential row to the admin's own log — no cross-org read or write.
- Callers invoke the RPC through the **acting user's client** (the student for `changePassword`, the admin's `requireAdmin()` client for admin actions) so `auth.uid()` is the real actor — **never** through the service-role `adminClient` (which would have `auth.uid() = NULL`).
- Best-effort audit: if the RPC fails, the auth mutation has already succeeded. Failures are logged server-side, not surfaced to the caller.

**Parameters:**
- `p_event_type` — one of `'user.password_changed'`, `'user.password_reset'`, `'user.deactivated'`, `'user.created'`
- `p_resource_id` — UUID of the user record being acted upon (the actor for `password_changed`, the target for admin events)
- `p_metadata` — JSONB, optional additional event context (default `'{}'`)

**Returns:** void. Raises EXCEPTION if not authenticated, user not found/inactive, a non-admin attempts an admin event, a self event targets another user, or the event_type is not whitelisted.

```sql
CREATE OR REPLACE FUNCTION public.record_auth_event(
  p_event_type  TEXT,
  p_resource_id UUID,
  p_metadata    JSONB DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_org_id   UUID;
  v_role     TEXT;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT organization_id, role INTO v_org_id, v_role
  FROM users
  WHERE id = v_actor_id AND deleted_at IS NULL;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;

  IF p_event_type = 'user.password_changed' THEN
    -- Self-service: a user may only record their own password change.
    IF p_resource_id IS DISTINCT FROM v_actor_id THEN
      RAISE EXCEPTION 'self event resource must be the actor';
    END IF;
  ELSIF p_event_type IN ('user.password_reset', 'user.deactivated', 'user.created') THEN
    -- Admin-only. No resource re-SELECT: it would need AND deleted_at IS NULL per
    -- §9, which would reject the user.deactivated audit (target already soft-deleted).
    -- The audit row's org is always the actor's own org, so a bogus resource_id is
    -- only self-referential log noise — no cross-org read or write.
    IF v_role <> 'admin' THEN
      RAISE EXCEPTION 'not authorized';
    END IF;
  ELSE
    RAISE EXCEPTION 'unsupported event_type: %', p_event_type;
  END IF;

  INSERT INTO audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id, v_actor_id, v_role, p_event_type, 'user', p_resource_id,
    COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;
```

#### `record_consent` — GDPR consent audit logging

Records a single consent decision (TOS acceptance, privacy policy acceptance). Called from `/consent` Server Action after user submits the consent form. All writes to `user_consents` must go through this RPC — direct inserts are blocked by RLS.

**Security:**
- `SECURITY DEFINER` with `SET search_path = public` and manual `auth.uid()` check.
- Validates `p_document_type` (defense-in-depth: CHECK constraint + RPC validation).
- Verifies user exists and is not soft-deleted before INSERT.
- Captures IP address and user agent from request headers (optional).

**Returns:** void. Raises EXCEPTION on auth failure, invalid document_type, or user not found.

**Idempotency (mig 085, #386):** Before inserting an acceptance, the RPC runs an `EXISTS` pre-check for an existing `accepted = true` row with the same `(user_id, document_type, document_version)` and returns early (no-op) if one is found — the same idiom `check_consent_status` uses. A retried acceptance (double-submit, network retry, tab restore) therefore does not append a duplicate audit row. Rejections (`accepted = false`) are still inserted unconditionally — each rejection is a distinct event. An `ON CONFLICT` target was not used because `idx_user_consents_lookup` is a non-unique partial index; making it unique would require hard-deleting pre-existing duplicates from a GDPR table, so the EXISTS guard is preferred. A truly-concurrent pair of identical calls is not closed by this guard (would need the unique index) — this is no worse than prior behaviour and not the reported failure mode.

```sql
CREATE FUNCTION record_consent(
  p_document_type    TEXT,      -- 'terms_of_service', 'privacy_policy'
  p_document_version TEXT,      -- e.g. 'v1.0'
  p_accepted         BOOLEAN,   -- true = accepted, false = rejected
  p_ip_address       TEXT DEFAULT NULL,
  p_user_agent       TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate document_type (defense-in-depth)
  IF p_document_type NOT IN ('terms_of_service', 'privacy_policy') THEN
    RAISE EXCEPTION 'Invalid document_type: %', p_document_type;
  END IF;

  -- Verify user exists and is not soft-deleted
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = _uid AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Idempotent acceptance (mig 085, #386): no-op if an identical accepted=true
  -- row already exists. ON CONFLICT is not usable — idx_user_consents_lookup is a
  -- non-unique partial index. Rejections (accepted=false) still insert unconditionally.
  IF p_accepted AND EXISTS (
    SELECT 1 FROM user_consents
    WHERE user_id = _uid
      AND document_type = p_document_type
      AND document_version = p_document_version
      AND accepted = true
  ) THEN
    RETURN;
  END IF;

  INSERT INTO user_consents
    (user_id, document_type, document_version, accepted, ip_address, user_agent)
  VALUES (_uid, p_document_type, p_document_version, p_accepted, p_ip_address, p_user_agent);
END;
$$;

GRANT EXECUTE ON FUNCTION record_consent(TEXT, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;
```

#### `check_consent_status` — check if user has accepted TOS + Privacy Policy

Queries the `user_consents` table to determine whether the authenticated user has accepted specific versions of the Terms of Service and Privacy Policy. Used by `/auth/login-complete` to decide whether to redirect to `/consent`.

**Security:**
- `SECURITY DEFINER` with manual `auth.uid()` check.
- Verifies user exists and is not soft-deleted.
- Returns boolean flags (not documents) — no sensitive data leakage.

**Returns:** TABLE(has_tos BOOLEAN, has_privacy BOOLEAN) — true if the user has an accepted consent record matching the provided versions.

```sql
CREATE FUNCTION check_consent_status(
  p_tos_version     TEXT,       -- Current TOS version (e.g. 'v1.0')
  p_privacy_version TEXT        -- Current Privacy Policy version (e.g. 'v1.0')
)
RETURNS TABLE(has_tos BOOLEAN, has_privacy BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify user exists and is not soft-deleted
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = _uid AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN QUERY
  SELECT
    EXISTS (
      SELECT 1 FROM user_consents
      WHERE user_id = _uid
        AND document_type = 'terms_of_service'
        AND document_version = p_tos_version
        AND accepted = true
    ) AS has_tos,
    EXISTS (
      SELECT 1 FROM user_consents
      WHERE user_id = _uid
        AND document_type = 'privacy_policy'
        AND document_version = p_privacy_version
        AND accepted = true
    ) AS has_privacy;
END;
$$;

GRANT EXECUTE ON FUNCTION check_consent_status(TEXT, TEXT) TO authenticated;
```

#### `get_admin_dashboard_kpis` — admin dashboard KPI summary

Returns all admin dashboard KPI values in a single JSON response. Used by the admin dashboard to display top-level metrics without multiple round trips.

**Security:**
- `SECURITY DEFINER` with `SET search_path = public` and manual `auth.uid()` check.
- Calls `is_admin()` to verify caller is an admin; raises exception if not.
- Organisation is derived from the caller's `users` row — never passed as a parameter.

**Parameters:** `p_range_days INT DEFAULT 30`

**Returns:** `JSON` with keys:
- `activeStudents` — students whose `last_active_at` falls within the range window
- `totalStudents` — all non-deleted students in the org
- `avgMastery` — average mastery percentage across all students (all-time)
- `sessionsThisPeriod` — completed sessions within the range window
- `weakestSubject` — `{ name, short, avgMastery }` for the subject with the lowest average mastery
- `examReadyStudents` — count of students with mastery ≥ 90% across all subjects (all-time)

**Clamping:** `p_range_days = 0` means all-time; values < 0 or NULL default to 30; values > 1095 are clamped to 1095. Range applies only to `activeStudents` and `sessionsThisPeriod` — mastery KPIs are always all-time.

**Filters:** `deleted_at IS NULL` on `users` and `quiz_sessions`; `status = 'active'` on `questions`.

---

#### `get_admin_weak_topics` — weakest topics by correct rate

Returns the N weakest topics by average correct rate across all students in the admin's organisation. Used by the admin dashboard weak-topics table.

**Security:** Same as `get_admin_dashboard_kpis` (`SECURITY DEFINER`, `auth.uid()` check, `is_admin()` check, org-scoped).

**Parameters:** `p_limit INT DEFAULT 10`

**Returns:** `TABLE(topic_id UUID, topic_name TEXT, subject_name TEXT, subject_short TEXT, avg_score NUMERIC, student_count BIGINT)`

**Formula:** `avg_score = AVG(is_correct::int) * 100` — per-response accuracy across all `student_responses` rows for that topic, not mastery percentage.

**Clamping:** `p_limit` clamped to 1–100; default 10.

---

#### `get_admin_dashboard_students` — paginated, sorted student roster

Returns one page of the admin's student roster joined with each student's session count, average score, and mastery percentage — sorted and paginated entirely in Postgres. Used by the admin dashboard student table. Replaces the former `get_admin_student_stats` + client-side merge/sort/slice, which truncated at PostgREST `max_rows = 1000` (#682 / #668).

**Security:** Same as `get_admin_dashboard_kpis` (`SECURITY DEFINER`, `SET search_path = public`, `auth.uid()` check, `is_admin()` check, org derived from `auth.uid()`).

**Parameters:** `p_status TEXT DEFAULT NULL`, `p_sort TEXT DEFAULT 'name'`, `p_dir TEXT DEFAULT 'asc'`, `p_limit INT DEFAULT 10`, `p_offset INT DEFAULT 0`.

**Sort keys:** `name`, `lastActive`, `sessions`, `avgScore`, `mastery` (whitelisted via `CASE`; unknown keys fall back to a stable `id` sort). `p_dir` is normalised to `ASC`/`DESC` — no caller string reaches the dynamic `ORDER BY`. Sort parity with the prior TS code: `name` treats NULL as `''`, `avgScore` treats NULL as `-1`, `lastActive` is `NULLS LAST` in both directions, with `id` as the final tiebreak.

**Status filter:** `NULL` shows all students (active + soft-deleted); `'active'` → `deleted_at IS NULL`; `'inactive'` → `deleted_at IS NOT NULL`.

**Returns:** `TABLE(id UUID, full_name TEXT, email TEXT, last_active_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ, session_count BIGINT, avg_score NUMERIC, mastery NUMERIC, total_count BIGINT)`. `total_count` is `count(*) OVER()` — the full filtered roster size, identical on every row, and absent (caller reads 0) on an out-of-range page. **Always non-null:** `id`, `email`, `session_count` (COALESCE 0), `mastery` (CASE ELSE 0), `total_count`. **Nullable:** `full_name`, `last_active_at`, `deleted_at`, and `avg_score` (NULL for students with no completed sessions).

**Mastery formula:** Org-wide — `ROUND(COUNT(DISTINCT correct active questions) / COUNT(DISTINCT active questions) * 100)`, where "active" means `status = 'active' AND deleted_at IS NULL`. Identical to the dropped `get_admin_student_stats`. The roster includes both active and soft-deleted students (per #487) so the admin can view historical stats for inactive users — the documented `docs/security.md` §9 exception (admin-only, org-scoped, visibility controlled by `p_status`).

**avg_score:** `NULL` for students with no completed sessions (not 0).

**Migration:** `20260527000001_get_admin_dashboard_students_rpc.sql`

---

#### `get_session_reports` — paginated, sorted session reports

Returns paginated session reports for the authenticated student with subject name join. Used by the progress/session history page.

**Security:** `SECURITY DEFINER` + `auth.uid()` check + active-user gate (a soft-deleted caller with a live JWT is rejected — `PERFORM 1 FROM users u WHERE u.id = auth.uid() AND u.deleted_at IS NULL`, mig 122, #883) + `SET search_path = public`.

**Parameters:** `p_sort TEXT DEFAULT 'started_at'`, `p_dir TEXT DEFAULT 'desc'`, `p_limit INT DEFAULT 10`, `p_offset INT DEFAULT 0`

**Sort keys:** `started_at`, `score_percentage`, `subject_name` (whitelisted — invalid keys fall back to `started_at`).

**Filters:** `ended_at IS NOT NULL`, `deleted_at IS NULL`, `student_id = auth.uid()`.

**Returns:** `TABLE(id UUID, mode TEXT, total_questions INT, correct_count INT, score_percentage NUMERIC NULL, started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ, subject_id UUID, subject_name TEXT, total_count BIGINT)` — `score_percentage` is nullable (NULL for sessions with no scored result); consumers must handle null (the TS `RpcRow`/`SessionReport` type it as `number | null`).

**Migration:** `20260410000010_get_session_reports_rpc.sql` (created); `20260606000007_get_session_reports_drop_unused_answered_count.sql` (migration 091 — removed unused `answered_count` correlated subquery, #471); `20260623000100_get_session_reports_active_user_gate.sql` (migration 122 — added active-user gate, `u.id`-aliased to avoid 42702 vs the `id` OUT param, #883)

---

#### `get_question_counts` — per-(subject, topic, subtopic) question counts

Returns aggregated question counts grouped by `(subject_id, topic_id, subtopic_id)`. Used by the admin exam-config and syllabus pages, and by the student quiz builder (`lib/queries/quiz-subject-queries.ts` — the subject/topic/subtopic count functions), to show available-question totals per node without paging through the full question bank.

**Security:** `SECURITY INVOKER` (caller-context). RLS scopes the result to the caller's organization via the existing `tenant_isolation` policy on `questions` — no manual `auth.uid()` check needed.

**Parameters:** `p_status TEXT DEFAULT NULL`
- `NULL` — count all non-deleted questions (active + draft); used by `admin/syllabus/queries.ts`.
- `'active'` — count only active questions; used by `admin/exam-config/queries.ts` (drafts are not eligible for exams) and by the student quiz builder (`lib/queries/quiz-subject-queries.ts`).

**Returns:** `TABLE(subject_id UUID, topic_id UUID, subtopic_id UUID, n BIGINT)`

**Filters:** `deleted_at IS NULL` always; `status = p_status` when `p_status` is non-NULL.

**Migration:** `20260520000001_get_question_counts_rpc.sql`

**Rationale:** Replaces client-side counting that silently truncated at the PostgREST 1000-row cap once the question bank crossed 1000 rows (#614).

---

#### `get_random_question_ids` — random sample from the filtered question pool

Returns up to `p_count` random question IDs from the active, org-scoped, subject/topic/subtopic + per-user-filter (UNION) pool. Used by the student quiz builder (`apps/web/app/app/quiz/actions/start.ts` → `lib/queries/quiz-session-queries.ts:getRandomQuestionIds`) to seed `start_quiz_session` with a uniformly sampled question set, regardless of pool size.

**Security:** `SECURITY INVOKER`. The underlying `questions` table has a single permissive SELECT policy (`tenant_isolation`), so RLS alone gives correct org + `deleted_at IS NULL` scoping. The shared internal helper `_filtered_question_pool` additionally self-scopes the per-user filter subqueries with `sr.student_id = auth.uid()` on `student_responses` (LOAD-BEARING per security.md §3 (Multiple Permissive SELECT Policies) — `student_responses` has TWO permissive SELECT policies, `students_read_responses` + `instructors_read_students`, so RLS alone would over-scope to the instructor policy). The `fsrs_cards` and `active_flagged_questions` student_id filters are defense-in-depth (single policy each). No correct-answer columns are exposed — the RPC returns only `id`.

**Parameters:**
- `p_subject_id UUID` — required.
- `p_topic_ids UUID[]` — `NULL` = unconstrained on topic dimension; `'{}'` (empty array) = matches nothing on topic dimension; non-empty array = `q.topic_id = ANY (p_topic_ids)`.
- `p_subtopic_ids UUID[]` — same semantics as `p_topic_ids`. The two dimensions are combined with `OR`, so a question matching either is in the pool (this preserves leaf-topic questions whose `subtopic_id` is `NULL`).
- `p_count INT` — maximum number of IDs to return. `LIMIT LEAST(GREATEST(COALESCE(p_count, 0), 0), 500)` clamps NULL to zero first, then negatives to zero, AND caps at 500 (defense in depth — mirrors the Zod schema in `apps/web/app/app/quiz/actions/start.ts`; prevents a direct RPC caller from bypassing the Server Action with a NULL value — which would make `LIMIT NULL` uncapped — or an arbitrarily large value).
- `p_filters TEXT[]` — `NULL` or `'{}'` = no per-user filter; non-empty subset of `{'unseen', 'incorrect', 'flagged'}` = union of matches (a question passes if it matches ANY active filter).
- `p_calc_mode TEXT DEFAULT 'all'` — calculation filter on `has_calculations`. `'only'` = only calc questions; `'exclude'` = only non-calc questions; `'all'` / `NULL` / any unknown value = unrestricted (fail-open). Unlike `p_filters` (UNION), calc-mode **AND-restricts** the pool — it composes on top of the per-user filters (#837).
- `p_has_image TEXT DEFAULT 'all'` — image filter on `question_image_url` presence. `'only'` = only questions with images (`question_image_url IS NOT NULL`); `'exclude'` = only questions without images (`question_image_url IS NULL`); `'all'` / `NULL` / any unknown value = unrestricted (fail-open). Like calc-mode, has-image **AND-restricts** the pool independently of `p_filters` (#864).
- `p_question_type TEXT DEFAULT NULL` — question-type filter. `NULL` (default) = unrestricted (all types); a specific value (e.g. `'multiple_choice'`) = only that `question_type`. Like calc-mode/has-image, it **AND-restricts** the pool. Added for Study Mode (`lib/queries/study-queries.ts` passes `'multiple_choice'`) so the random-ID **fetch** is MC-only on mixed-type subjects — note this scopes the fetch, not the pre-start count badge, which still reuses the type-agnostic count path (tracked in #1003); existing callers omit it (DEFAULT NULL) and are unaffected (mig 134).

**Returns:** `TABLE(id UUID)` — up to `LEAST(GREATEST(COALESCE(p_count, 0), 0), 500)` rows (NULL or negative `p_count` yields 0 rows), sampled via `ORDER BY random() LIMIT LEAST(GREATEST(COALESCE(p_count, 0), 0), 500)` over the helper's pool.

**Volatility:** `VOLATILE` (because `random()` is volatile).

**Migration:** `20260528000001_filtered_question_pool_rpcs.sql`; `p_calc_mode` added in `20260611000400_calc_mode_filtered_question_pool.sql` (≡ packages/db 108), which DROPs + recreates the three functions (signature change) (#837); `p_question_type` added in `20260626000100_get_random_question_ids_question_type.sql` (≡ packages/db 134), which DROPs + recreates `get_random_question_ids` + `_filtered_question_pool` with the trailing optional param (Study Mode).

**Rationale:** Replaces a client-side fetch-then-shuffle that hit the PostgREST 1000-row cap once the active pool crossed 1000 rows — questions past row 1000 were never sampled, biasing the quiz toward the first 1000 by insertion order (#679, instance of umbrella #668). Sampling now happens server-side so every active, in-scope question has equal probability.

**Internal helper:** `_filtered_question_pool(p_subject_id, p_topic_ids, p_subtopic_ids, p_filters, p_calc_mode, p_has_image, p_question_type)` — shared `STABLE SECURITY INVOKER` SQL function. Defines the filtered pool exactly once so `get_random_question_ids` and `get_filtered_question_counts` are structurally guaranteed to agree (count == quiz). The guarantee holds only when both callers pass the SAME pool arguments — in particular both omitting `p_question_type` (its DEFAULT NULL), as every existing caller does. Discovery (Study Mode) is the current exception: it passes `p_question_type='multiple_choice'` to `get_random_question_ids` only, while the count badge still calls the type-agnostic `get_filtered_question_counts`, so on mixed-type subjects the badge can over-count relative to the MC-only fetch until the MC-aware count path lands (#1003). Both the calc-mode AND-clause (#837) and the has-image AND-clause (#864) live here (one place each), so both wrappers inherit them. Requires `GRANT SELECT (has_calculations)` to `authenticated` (mig 107) since it reads the column as the SECURITY INVOKER student. Prefer the wrapper RPCs over calling the helper directly: a direct call returns one row per pool member and can hit the 1000-row cap.

---

#### `get_filtered_question_counts` — per-(topic, subtopic) counts over the filtered question pool

Returns one row per distinct `(topic_id, subtopic_id)` in the same filtered pool as `get_random_question_ids`. Used by the student quiz builder (`apps/web/app/app/quiz/actions/lookup.ts:getFilteredCount`) to populate the count badge and per-topic/subtopic breakdowns alongside the subject filter UI.

**Security:** `SECURITY INVOKER`. Same scoping model as `get_random_question_ids` (shared `_filtered_question_pool` helper): `tenant_isolation` on `questions` + load-bearing `sr.student_id = auth.uid()` on `student_responses` per security.md §3 (Multiple Permissive SELECT Policies). No correct-answer columns selected.

**Parameters:** identical to `get_random_question_ids` except for the omitted `p_count`. Same NULL-vs-empty-array semantics on `p_topic_ids` / `p_subtopic_ids` / `p_filters`, and the same `p_calc_mode` and `p_has_image` AND-restrictions so the badge count reflects both filters (count == quiz).

**Returns:** `TABLE(topic_id UUID, subtopic_id UUID, n BIGINT)` — one row per `(topic_id, subtopic_id)` group present in the pool. Total count is `sum(n)`. Per-subtopic counts ignore rows where `subtopic_id IS NULL` at the TypeScript aggregation site.

**Volatility:** `STABLE`.

**Result-set size:** bounded by syllabus shape (one row per `(topic, subtopic)` present in the pool — low hundreds in production), so the result itself cannot hit the 1000-row cap that the legacy client-side counting was vulnerable to.

**Migration:** `20260528000001_filtered_question_pool_rpcs.sql`; `p_calc_mode` added in `20260611000400_calc_mode_filtered_question_pool.sql` (≡ packages/db 108) (#837).

**Rationale:** Replaces a client-side `SELECT id, topic_id, subtopic_id FROM questions WHERE …` read whose total truncated at the PostgREST 1000-row cap for any pool larger than 1000 rows, causing the badge count and per-(topic, subtopic) breakdown to under-report. The new RPC computes counts in SQL and reuses the same `_filtered_question_pool` definition as `get_random_question_ids`, so the badge is structurally guaranteed to equal the size of the pool the quiz samples from (count == quiz). Also fixes the prior AND-vs-OR mismatch between the badge and the quiz, and the `unseen + incorrect` mutex-then-AND-bug that produced a permanently-zero badge for any combination of those two filters (#678, instance of umbrella #668).

---

#### `get_student_mastery_stats` — per-subject & per-topic mastery counts for the calling student

Returns mastery counts at two granularities in one result set: a subject-level row (`topic_id IS NULL`) and topic-level rows (`topic_id NOT NULL`) per `(subject_id[, topic_id])`. Used by the student dashboard (`lib/queries/dashboard.ts`) and progress page (`lib/queries/progress.ts`) to compute per-subject/topic mastery without paging through the student's full response history.

**Security:** `SECURITY INVOKER` (caller-context). The denominator is org-scoped by `tenant_isolation` on `questions` (org + `deleted_at IS NULL`, any status). `student_responses` has TWO SELECT policies — `students_read_responses` (`student_id = auth.uid()`) and `instructors_read_students` (org + instructor/admin role) — so RLS alone would let an instructor/admin caller aggregate org-wide. The numerator therefore self-scopes with an explicit `sr.student_id = auth.uid()` in `correct_q` (load-bearing, not redundant — matches the legacy client read's `.eq('student_id', userId)`). No `SECURITY DEFINER` auth preamble is needed: an unauthenticated caller resolves `auth.uid()` to NULL and receives an empty set.

**Parameters:** none (caller is always self).

**Returns:** `TABLE(subject_id UUID, topic_id UUID, total BIGINT, correct BIGINT)`
- `total` — `COUNT(*)` of `status = 'active'` questions in the `active_q` CTE (denominator; rows are already unique by `questions.id` PK, so no `DISTINCT` keyword is needed).
- `correct` — count of **distinct** questions answered correctly, **any** status (numerator; the `correct_q` CTE dedups via `SELECT DISTINCT q.id`, then `COUNT(*)` over that set, so multiple correct attempts on one question count once); can exceed `total` when the student answered a now-draft question (orphan retention, #540/#664). The percentage clamp and the `total>0 OR correct>0` orphan-retention filter stay in TypeScript, which consumes the raw counts.
- `topic_id IS NULL` marks the subject-level aggregate row — a safe sentinel because `questions.topic_id` is `NOT NULL`.

**Migration:** `20260521000005_student_mastery_stats_rpc.sql`

**Rationale:** Replaces client-side numerator/denominator aggregation that silently truncated at the PostgREST 1000-row cap for students with >1000 responses or orgs with >1000 active questions (#540, instance #1 of umbrella #668).

---

#### `get_student_streak` — current + best daily-practice streak for the calling student

Returns one row with the caller's current and best (all-time) daily-practice streak in days, computed entirely in Postgres via a gaps-and-islands query over the DISTINCT UTC calendar dates on which the student answered any question. Used by the student dashboard (`lib/queries/dashboard.ts` → `getStreakData`).

**Security:** `SECURITY INVOKER`. `student_responses` has TWO permissive SELECT policies (`students_read_responses` = `student_id = auth.uid()`, and `instructors_read_students` = org + instructor/admin role), so RLS alone would let an instructor/admin caller streak over org-wide activity. The query self-scopes with an explicit `sr.student_id = auth.uid()` (load-bearing per security.md §3 (Multiple Permissive SELECT Policies)). Unauthenticated caller → `auth.uid()` NULL → zero dates → returns a single `{0, 0}` row.

**Parameters:** none (caller is always self).

**Returns:** `TABLE(current_streak INT, best_streak INT)` — exactly one row.
- `current_streak` — length (days) of the consecutive-day run ending today or yesterday (UTC), else `0` (mirrors the legacy `anchoredToNow` guard).
- `best_streak` — length (days) of the longest consecutive-day run, all-time.
- UTC date derivation (`created_at AT TIME ZONE 'UTC'`) matches the legacy TS `computeStreaks`, which used `created_at.toISOString().slice(0,10)`.

**Migration:** `20260521000006_dashboard_secondary_stats_rpcs.sql`

**Rationale:** Replaces client-side `computeStreaks` over a `.limit(10000)` read (ignored above the PostgREST 1000-row cap) that undercounted streaks for students with >1000 responses (#668, instance #2 of the truncation class).

---

#### `get_student_last_practiced` — most recent response timestamp per subject for the calling student

Returns one row per subject the caller has answered, with the most recent response timestamp, over ALL responses (any correctness). Used by the student dashboard (`lib/queries/dashboard.ts` → `applyLastPracticed`).

**Security:** `SECURITY INVOKER`. The `questions` JOIN is org-scoped + `deleted_at IS NULL` via the `tenant_isolation` policy (reproducing the legacy `questionSubjectMap`, which was built from non-deleted questions). `student_responses` self-scopes with an explicit `sr.student_id = auth.uid()` (load-bearing per security.md §3 (Multiple Permissive SELECT Policies), same two-policy reason as `get_student_streak`). Unauthenticated caller → empty set. No question text, options, or correct-answer data is selected — only `subject_id` and a timestamp.

**Parameters:** none (caller is always self).

**Returns:** `TABLE(subject_id UUID, last_practiced_at TIMESTAMPTZ)` — one row per practiced subject.
- `last_practiced_at` — `MAX(created_at)` over all the caller's responses to questions in that subject (correct or not), matching the legacy `applyLastPracticed` (no `is_correct` filter).

**Migration:** `20260521000006_dashboard_secondary_stats_rpcs.sql`

**Rationale:** Replaces client-side last-practiced attribution over a `.limit(5000)` read (ignored above the 1000-row cap) that falsely NULLed `lastPracticedAt` for subjects answered outside the most-recent ~1000 responses, and retires the coupled truncated `questions` read (the `questionSubjectMap`) deferred from PR #674 (#668).

---

#### `get_student_profile_stats` — completed-session count + average score for the calling student

Returns a single aggregate row with the caller's completed-session count and average score, computed in Postgres via `COUNT(*)` + `AVG(score_percentage)`. Used by the settings/profile page (`lib/queries/profile.ts` → `getProfileStats`).

**Security:** `SECURITY INVOKER`. `quiz_sessions` has MORE THAN ONE permissive SELECT policy (`students_select_sessions` = `student_id = auth.uid()`, and `instructors_read_sessions` = org + instructor/admin role), so RLS alone would let an instructor/admin caller average org-wide. The query self-scopes with an explicit `qs.student_id = auth.uid()` (load-bearing per security.md §3 (Multiple Permissive SELECT Policies), same multi-policy reason as `get_student_mastery_stats`). Unauthenticated caller → `auth.uid()` NULL → zero rows → `{0, NULL}`.

**Parameters:** none (caller is always self).

**Returns:** `TABLE(total_sessions BIGINT, avg_score NUMERIC)` — a no-`GROUP BY` aggregate always yields exactly one row.
- `total_sessions` — `COUNT(*)` of the caller's `quiz_sessions` with `ended_at IS NOT NULL`, `deleted_at IS NULL`, and `score_percentage IS NOT NULL`. The non-null-score predicate makes the count match the legacy `.filter(s => s.score_percentage !== null)` set.
- `avg_score` — raw `AVG(score_percentage)` over the same filtered set (`NULL` when none). `Math.round()` and the `totalSessions > 0 ? .. : 0` guard stay in TypeScript, which consumes the raw value (`avg_score` arrives as a JSON string because `score_percentage` is `NUMERIC(5,2)`; the caller coerces with `Number()`).

**Migration:** `20260529000001_student_profile_stats_rpc.sql`

**Rationale:** Replaces a client-side count/average over an unpaginated `quiz_sessions` read that silently truncated at the PostgREST 1000-row cap, skewing `totalSessions` and `averageScore` for high-volume students (#668 P2, profile.ts).

#### `start_vfr_rt_exam_session` — VFR RT mock exam start

Student-facing RPC (migration 099). Creates a timed (30-minute) `vfr_rt_exam` session with a frozen, per-question-type sampled question set: Part 1 (short_answer), Part 2 (dialog_fill), Part 3 (multiple_choice).

**Security:** `SECURITY DEFINER`, `SET search_path = public`. Auth check (`auth.uid()` guard, user lookup with `deleted_at IS NULL`), org-scoped exam config read, soft-delete filters on all questions, soft-delete filter on old session (mig 102 auto-complete). Idempotent resume on in-flight non-overdue session (returns frozen config unchanged, no INSERT).

**Parameters:**
- `p_subject_id UUID` — the target subject (RT)

**Returns:** `jsonb` with keys:
- `session_id UUID` — the created/resumed session
- `question_ids UUID[]` — flat array in Part-1, Part-2, Part-3 order
- `time_limit_seconds INT` — always 1800 (30 minutes)
- `parts JSONB` — `{p1_end, p2_end, p3_end}` boundaries for slicing the question_ids array
- `started_at TIMESTAMPTZ` — session creation timestamp

**Exam config lookup:** Reads `exam_configs.parts_config` to determine per-part counts (defaults 8/9/8 over topic codes P1_ACRONYMS/P2_DIALOG/P3_MC if parts_config is empty). Per-part question sampling is random, ordered by `question_id` to avoid trivial repetition.

**Error codes:**
- `exam_config_required` — no enabled exam config for this org+subject
- `insufficient_questions_for_vfr_rt_exam` — shortfall on any part; DETAIL returns `{p1_have, p2_have, p3_have}`

**Audit:** `vfr_rt_exam.started` event logged with subject_id, total_questions, and parts breakdown.

**Idempotency:** Resume guards against duplicate active sessions — if the student has an in-flight (not overdue) vfr_rt_exam session, it is returned as-is instead of creating a new one.

**Duplicate-active-session hardening (mig 096 + 099):** The idempotent-resume SELECT alone is racy on the first call — two concurrent callers can both observe no active session and both INSERT. `uq_vfr_rt_exam_session_active` (mig 096), a partial unique index on `quiz_sessions (student_id, organization_id, subject_id) WHERE mode = 'vfr_rt_exam' AND ended_at IS NULL AND deleted_at IS NULL`, closes the race at the schema level (sibling of `uq_active_exam_session` for mock_exam, mig 088, and `uq_internal_exam_session_active` for internal_exam). The mig 099 `EXCEPTION WHEN unique_violation` handler then re-reads and **returns the winner's session** instead of raising — unlike the sibling RPCs' raise-only handlers. This divergence is intentional: the RPC's contract is idempotent resume, so the racing loser receives the same payload a sequential second call would. The loser's path skips the audit INSERT (it created no session).

#### `get_vfr_rt_exam_questions` — type-aware, answer-key-stripped VFR RT question reads

Student-facing RPC (migration 099b, sibling of `get_quiz_questions`; redefined in migration `20260611000100` / mig 105, #833 + #840 — old `(p_question_ids uuid[])` signature dropped, replaced by `(p_session_id uuid)` with server-side ID derivation, explanation fields removed). Returns the mixed-type questions (multiple_choice, short_answer, dialog_fill) of a caller-owned `vfr_rt_exam` session with all grading keys stripped, in the session's frozen `config.question_ids` order.

**Security:** `SECURITY DEFINER`, `SET search_path = public`. Auth check, active-user gate (single `deleted_at`-filtered `users` read that also resolves the caller's `organization_id`). The session fetch scopes `student_id = auth.uid() AND mode = 'vfr_rt_exam' AND deleted_at IS NULL` explicitly (multiple permissive SELECT policies on `quiz_sessions`, security.md §3) and deliberately has **no** `ended_at` condition — the RPC is callable both in-flight and post-exam (it is the display-field source for the Phase C review screen as well as the live exam). Question IDs are derived inside the function from the session's frozen `quiz_sessions.config.question_ids` — an immutable, write-once column (locked by `trg_quiz_sessions_immutable_columns`, mig 079) — so the security.md §15 carve-out now applies by construction (the 099b version took caller-supplied IDs, which misapplied the carve-out; closed by mig 105, #833). Soft-deleted questions are intentionally included (historical-record posture for in-flight exams). The questions read is additionally tenant-scoped to the caller's `organization_id`, retained as defense-in-depth (issue #831) — with session-derived IDs, foreign-org question IDs are already unreachable by construction.

**Parameters:**
- `p_session_id UUID` — the caller-owned `vfr_rt_exam` session whose frozen question set is returned

**Returns:** `TABLE` with columns (rows ordered by the session's `config.question_ids` order):
- `id UUID`, `question_type TEXT`, `question_text TEXT`, `question_image_url TEXT`
- `subject_code TEXT`, `topic_code TEXT`, `difficulty TEXT`, `question_number TEXT`
- `options JSONB` — multiple_choice only: `[{id, text}]`, shuffled; `NULL` for other types
- `dialog_template TEXT` — dialog_fill only: raw template with `{{n}}` markers (canonicals/synonyms stripped); `NULL` for other types
- `blanks_safe JSONB` — dialog_fill only: `[{index}]` (positions only, no canonicals/synonyms); `NULL` for other types

`explanation_text` / `explanation_image_url` were removed from the output in mig 105 (#840) so explanations cannot leak mid-exam — they are revealed only via `get_vfr_rt_exam_results` (mig 106), behind its `ended_at IS NOT NULL` gate.

**Answer-key stripping guarantees (security.md rule 1):**
- Multiple_choice: `correct` flag removed from options, shuffled via `ORDER BY random()`
- Short_answer: canonical_answer and accepted_synonyms never selected
- Dialog_fill: dialog_template rewritten from `{{n|canonical; syn...}}` to `{{n}}`, blanks_safe drops canonicals/synonyms

**Error codes:**
- `not_authenticated` — no `auth.uid()`
- `user_not_found_or_inactive` — caller is soft-deleted/inactive
- `Session not found or not owned` — session missing, not owned by the caller, wrong mode, or soft-deleted
- `session_config_malformed` — session `config.question_ids` is null, missing, or not an array (family guard, migs 100/105)

#### `submit_vfr_rt_exam_answers` — atomic VFR RT answers submission + grading

Student-facing RPC (migration 100). Submits an array of typed answers (one per blank), normalizes + grades per-blank, computes per-part percentages, scores overall ≥75% pass rule per part, logs audit event.

**Security:** `SECURITY DEFINER`, `SET search_path = public`. Auth check, student_id ownership scope (explicit `student_id = auth.uid()`, mandatory per security.md §3), session soft-delete filter, ended_at guard (idempotent replay).

**Parameters:**
- `p_session_id UUID` — the target vfr_rt_exam session
- `p_answers JSONB` — array of answer objects; each object has `{question_id UUID, selected_option_id text?, response_text text?, blank_index int?, response_time_ms int?}`. One entry per (question_id, blank_index) — blank_index NULL for MC/short_answer, int for dialog_fill. response_time_ms optional (default 0).

**Returns:** `jsonb` with keys:
- `session_id UUID`
- `part1_pct NUMERIC(5,2)`, `part2_pct NUMERIC(5,2)`, `part3_pct NUMERIC(5,2)` — per-part percentages (0–100)
- `passed_overall BOOLEAN` — `v_p1 >= 75 AND v_p2 >= 75 AND v_p3 >= 75`
- `correct_count INT` — count of correct answer rows (per-blank; dialog_fill may have multiple per question)
- `total_questions INT` — session's total_questions (8+9+8 = 25 default)
- `expired BOOLEAN` — present only if session expired past grace period; returns zeroed result if true

**Grading (per-part formulas):**
- Part 1 (short_answer): correct count / 8 (default) * 100
- Part 2 (dialog_fill): mean of (correct blanks / total blanks) per question * 100
- Part 3 (multiple_choice): correct count / 8 (default) * 100
- Unanswered questions contribute 0

**Answer normalization:** `normalize_answer(text)` helper (mig 101) — trim, lowercase, collapse hyphens/underscores, strip punctuation, preserve diacritics (Slovenian č/š/ž). Matching: canonical_answer or any accepted_synonym.

**Timer expiry guard (design.md § Migration 100):** Submit past `started_at + time_limit_seconds + 30s` grace → expires the session (zeroed result, `expired: true`), logged as `vfr_rt_exam.expired`.

**Idempotency:** On replay (session already ended), returns previously-computed result; no writes. If the session expired (timer grace period), detects the expiry via the append-only `vfr_rt_exam.expired` audit event and re-adds `expired:true` to the JSONB return (mig 129, #839), ensuring a retry returns the same payload as the original. Also catches expiry via `complete_overdue_exam_session` / `complete_empty_exam_session` (same event_type).

**Error codes:**
- `session_not_found_or_not_accessible` — owner/mode/deleted check
- `session_config_malformed` — session `config.question_ids` is null, missing, or not an array (mig 100 guard; pre-existing doc omission fixed alongside migs 105/106)
- `invalid_answers_payload` — payload is null, not array, or empty
- `duplicate_answer_entry` — (question_id, blank_index) pair appears twice
- `invalid_question_id_for_session` — question not in session's frozen question_ids
- `answer_type_mismatch` — answer entry has wrong field set for question type
- `invalid_option_for_question` — selected_option_id not in options array
- `invalid_blank_index` — blank_index not in blanks_config array
- `question_missing_correct_option` — MC question has no correct option (data error)

**Audit:** `vfr_rt_exam.completed` event on fresh submit (part pcts, passed_overall, total_questions). `vfr_rt_exam.expired` event on timer expiry.

#### `get_vfr_rt_exam_results` — gated results/review read path for VFR RT exams

Student-facing RPC (migration 103; redefined in migration `20260611000200` / mig 106, #840 — adds `explanation_text` / `explanation_image_url` to the per-question review payload; only functional delta). Fetches completion-time answer key + explanations + per-question grading breakdown. Requires session to be ended.

**Security:** `SECURITY DEFINER`, `SET search_path = public`. Auth check, active-user gate (`users.deleted_at IS NULL`, #838 — family pattern of migs 099/099b/100), explicit `student_id = auth.uid() AND mode = 'vfr_rt_exam' AND ended_at IS NOT NULL` scope (multiple permissive policies on quiz_sessions, security.md §3).

**Parameters:**
- `p_session_id UUID` — the target session

**Returns:** `jsonb` with keys:
- `part1_pct NUMERIC`, `part2_pct NUMERIC`, `part3_pct NUMERIC` — per-part percentages (recomputed from quiz_session_answers)
- `passed_overall BOOLEAN` — `v_p1 >= 75 AND v_p2 >= 75 AND v_p3 >= 75`
- `passed_per_part JSONB` — `{part1, part2, part3}` boolean flags
- `correct_count INT` — total correct answer rows (counted per-blank for `dialog_fill`, so it can exceed `total_questions`; informational only — pass/fail derives from the per-part percentages)
- `total_questions INT` — session's total_questions
- `questions JSONB` — array of question review objects (one per session question, in config.question_ids order); each object has:
  - `question_id UUID`, `question_type TEXT`, `question_text TEXT`
  - `explanation_text TEXT`, `explanation_image_url TEXT` — added in mig 106 (#840); explanations are revealed only here among the VFR RT RPCs, behind the `ended_at IS NOT NULL` gate (stripped from the in-flight path, `get_vfr_rt_exam_questions`, by mig 105; the columns themselves remain in the mig 094 column GRANT and are PostgREST-readable — #823-family privilege-layer scope)
  - `answers JSONB` — array of the student's answers `[{blank_index?, selected_option_id?, response_text?, is_correct}]`
  - `key JSONB` — the revealed answer key per type:
    - Multiple_choice: `{correct_option_id}`
    - Short_answer: `{canonical_answer, accepted_synonyms}`
    - Dialog_fill: `{blanks: [{index, canonical, synonyms}]}`

**Per-part recomputation:** Same formulas as `submit_vfr_rt_exam_answers`. Single source of truth for both fresh grading and idempotent replay.

**Error codes:**
- `user_not_found_or_inactive` — caller is soft-deleted (active-user gate, #838)
- `Session not found, not owned, or not completed` — ownership/mode/ended check
- `session_config_malformed` — session `config.question_ids` is null, missing, or not an array (family guard, migs 100/106)

#### `get_question_authoring_fields` — gated answer-key column reads for admin authoring

Admin-only RPC (migration 094b; `correct_option_id` added mig 116, #823). Fetches the five answer-key columns (canonical_answer, accepted_synonyms, dialog_template, blanks_config, correct_option_id) that are REVOKED from authenticated at the privilege layer (mig 094 / mig 111). Allows admin authoring UI to load question details without requiring a service-role client.

**Security:** `SECURITY DEFINER`, `SET search_path = public`. Auth check (`auth.uid()`), `is_admin()` gate.

**Parameters:**
- `p_question_id UUID` — the target question

**Returns:** `TABLE` with columns:
- `canonical_answer TEXT` — may be NULL for non-short_answer types
- `accepted_synonyms TEXT[]`
- `dialog_template TEXT` — may be NULL for non-dialog_fill types
- `blanks_config JSONB`
- `correct_option_id TEXT` — MC answer key ('a'/'b'/'c'/'d'); NULL for non-MC (added mig 116, #823)

**Error code:**
- `question_not_found` — question doesn't exist

#### `normalize_answer` — IMMUTABLE SQL helper for answer grading

Helper RPC (migration 101). Normalizes free-text exam answers for grading comparison. Pure function (IMMUTABLE, PARALLEL SAFE).

**Logic (mirrors `apps/web/lib/grading/normalize-answer.ts` exactly):**
1. Trim leading/trailing whitespace
2. Lowercase (preserves diacritics under UTF-8 non-Turkish locales)
3. Collapse hyphen/underscore runs to single space
4. Strip punctuation `.`,`,`,`;`,`:`,`!`,`?`,`"`,`'`,`(`,`)`,`[`,`]`
5. Collapse whitespace runs to single space
6. Trim again (final trim, **mig 128 / #921**) — steps 4–5 can leave a stray edge space when punctuation was adjacent to a leading/trailing space (`". hello"` → `" hello"`); without this, grading penalizes a correct answer (comparison is `normalize_answer(response)` vs `normalize_answer(canonical)`). Wraps the outermost `regexp_replace` in `trim()`; CREATE OR REPLACE, no signature change. The TS mirror gains the matching final `.trim()` in the same change.

**Deploy-time locale guard (mig 101):** The migration includes a DO-block that raises an exception if `lower('Č') <> 'č'` — catches misconfigured locales (e.g. tr_TR, C/POSIX) that fold Slovenian diacritics before the function is created, preventing silent answer miscount at runtime.

**Parameters:**
- `text` — the answer to normalize

**Returns:** `text` — the normalized answer (empty string if all punctuation)

---

## 4b. Triggers & Defensive Constraints

### Column-level protection on `users`

RLS controls which **rows** can be updated, not which **columns**. A `BEFORE UPDATE` trigger on `users` prevents non-service-role connections from changing sensitive columns:

| Column | Why protected |
|--------|--------------|
| `role` | Prevents student → admin privilege escalation |
| `organization_id` | Prevents cross-tenant data access |
| `deleted_at` | Soft-delete must go through service role |

```sql
-- Trigger: trg_protect_users_sensitive_columns (20260316000041_protect_users_sensitive_columns.sql)
-- Only fires when role, organization_id, or deleted_at is in the UPDATE SET clause.
-- Service-role connections (current_role = 'service_role') bypass the check.
-- All other connections get EXCEPTION if they attempt to change these columns.
```

If profile editing is needed in the future, use a `SECURITY DEFINER` RPC that accepts only safe fields (`full_name`, etc.) — never a blanket UPDATE policy on `users`.

### Other triggers

| Trigger | Table | Purpose |
|---------|-------|---------|
| `trg_enforce_draft_limit` | `quiz_drafts` | DB-enforced max drafts per student (migration 021; `SET search_path = public` added in `20260430000007` — closes #588; `20260430000011` adds `pg_advisory_xact_lock(hashtext(NEW.student_id::text))` to serialize the 20-draft cap check under concurrency — PR #599 CR root-cause fix) |
| `trg_protect_users_sensitive_columns` | `users` | Blocks role/org/deleted_at changes (20260316000041) |
| `trg_block_exam_config_reactivation` | `exam_configs` | Blocks `UPDATE SET deleted_at = NULL` (unconditional — no role exemption); enforces that reactivation goes through `upsert_exam_config`, whose UPDATE branch never writes `deleted_at` (mig 089, #755) |
| `trg_sanitize_question_options` | `questions` | BEFORE INSERT OR UPDATE OF `options`: strips any `correct` key from the options JSONB, rebuilding the array as `{id,text}` only. Defense-in-depth: guarantees the MC answer key never re-enters the readable JSONB (it lives in `correct_option_id` column, mig 111, #823). Fires on every write, including raw PostgREST updates that bypass the app-layer Zod contract. |
| `trg_stamp_last_active_on_session_complete` | `quiz_sessions` | AFTER UPDATE OF `ended_at`: stamps `users.last_active_at = now()` on the NULL→NOT NULL transition, guarded to the student who owns the session (`auth.uid() = NEW.student_id`). Fires on all four student-completion paths (`batch_submit_quiz`, `complete_overdue_exam_session`, `complete_empty_exam_session`, deprecated `complete_quiz_session`), and is skipped on admin voids (`void_internal_exam_code` with `auth.uid() = admin`). Centralizes the stamp operation outside of RPC bodies, closing the bug where only the deprecated path updated activity (mig 092, #532). |

---

## 5. Indexes

```sql
-- Tenant scoping (on every org-scoped table)
CREATE INDEX idx_questions_org       ON questions(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_lessons_org         ON lessons(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_quiz_sessions_org   ON quiz_sessions(organization_id);
CREATE INDEX idx_student_responses_org ON student_responses(organization_id);
CREATE INDEX idx_users_org           ON users(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_org_role      ON users(organization_id, role);  -- Non-partial: serves queries including soft-deleted users (20260410000008)
CREATE INDEX idx_courses_org         ON courses(organization_id) WHERE deleted_at IS NULL;

-- fsrs_cards lookup (for filtering by last_was_correct)
CREATE INDEX idx_fsrs_cards_student  ON fsrs_cards(student_id, last_was_correct);

-- Student data queries
CREATE INDEX idx_student_responses_student ON student_responses(student_id, created_at DESC);
CREATE INDEX idx_quiz_sessions_student     ON quiz_sessions(student_id, created_at DESC);

-- Question bank browsing
CREATE INDEX idx_questions_subject   ON questions(subject_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_questions_topic     ON questions(topic_id)   WHERE deleted_at IS NULL;
CREATE INDEX idx_questions_subtopic  ON questions(subtopic_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_questions_bank      ON questions(bank_id)    WHERE deleted_at IS NULL;

-- Question dedup (unique question_number per bank)
CREATE UNIQUE INDEX idx_questions_bank_number ON questions(bank_id, question_number)
  WHERE deleted_at IS NULL AND question_number IS NOT NULL;

-- Quiz analytics queries
CREATE INDEX idx_quiz_sessions_subject ON quiz_sessions(subject_id) WHERE subject_id IS NOT NULL;

-- Audit log queries (compliance exports)
CREATE INDEX idx_audit_events_org    ON audit_events(organization_id, created_at DESC);
CREATE INDEX idx_audit_events_actor  ON audit_events(actor_id, created_at DESC);
```

---

## 6. Migration Rules

1. **Every migration is forward-only and immutable.** Never edit or delete a migration that has been applied. If you need to undo or change something, write a new migration.
2. **Never rename a column in production** — add the new column, migrate data, drop the old column in three separate migrations.
3. **Never change a column type** without a migration that handles existing data.
4. **Every migration file is named** `YYYYMMDDHHMMSS_short_description.sql` — e.g., `20260311000001_initial_schema.sql` (Supabase CLI timestamp format).
5. **RLS must be enabled in the same migration as the table creation** — never in a separate file.
6. **RPC signature changes require DROP FUNCTION first.** Postgres `CREATE OR REPLACE FUNCTION` cannot change a function's return type or parameter list. If modifying an RPC signature, precede the `CREATE OR REPLACE` with `DROP FUNCTION IF EXISTS function_name(param_types);`
7. **Test every migration** against a local Supabase instance before pushing.

---

## 7. What the Security Auditor Checks (DB-specific)

The `security-auditor` agent flags:
- Any new `CREATE TABLE` without `ENABLE ROW LEVEL SECURITY` in the same migration
- Any RLS policy with `USING` but no `WITH CHECK`
- Any `DELETE FROM` statement in application code (must be `UPDATE ... SET deleted_at`)
- Any `SECURITY DEFINER` function without a manual auth check inside
- Any `SECURITY DEFINER` function without `SET search_path = public`
- Any query that returns `options` JSONB directly from `questions` to a student endpoint

---

*Last updated: 2026-06-26 (migs 134–135 / feat/study-mode-mc: `get_random_question_ids` + `_filtered_question_pool` gain an optional `p_question_type text DEFAULT NULL` parameter [mig 134, backward-compatible — NULL preserves existing all-types behavior]; new `get_study_questions(p_question_ids uuid[])` SECURITY DEFINER RPC returns MC questions WITH `correct_option_id` answer key + explanation for self-paced study mode [mig 135]; guard set mirrors `get_quiz_questions` + `get_report_answer_keys` per security.md rules 1/7/9/11/12; options returned in STORED order [no shuffle]; §15 frozen-config carve-out does NOT apply — reads arbitrary caller-supplied IDs so `deleted_at IS NULL` is required; **mid-exam answer-oracle guard** — raises `active_exam_session` when the caller has a live mock/internal/vfr_rt exam session, since exams grade from the same MC pool with client-visible question IDs [mirrors check_quiz_answer mig 117; red-team EO6]; Decision 48) | Earlier 2026-06-24 (mig 131 / #828: `enforce_answer_blank_index_shape()` BEFORE INSERT trigger on quiz_session_answers + student_responses enforces `question_type = 'dialog_fill' ⇔ blank_index IS NOT NULL` via a cross-table question_type read the single-row CHECK cannot do; SECURITY INVOKER (repo trigger convention), no deleted_at filter (§15 frozen-config carve-out); closes the gap where a future inserter/admin-form/import bug persists a malformed blank_index; integration suite 211 +9 trigger tests) | Earlier 2026-06-24 (migs 129–130 / #839: submit_vfr_rt_exam_answers + batch_submit_quiz idempotent-replay branch restores `expired:true` via append-only audit-event lookup; detects expiry via the append-only `<mode>.expired` audit event (`event_type LIKE '%.expired'`, migs 129/130), also catches `complete_overdue_/complete_empty_exam_session` expiry; integration suite 202 +2 replay tests) | Earlier 2026-06-23 (mig 128 / #921: normalize_answer final trim to close stray edge spaces in grading, TS/SQL parity + integration test parity) | Earlier 2026-06-21 (VFR RT Phase 2 — migs 118–121, #697: get_quiz_questions widened to 15 RETURNS TABLE columns + active-user gate (mig 118); check_non_mc_answer NEW SECURITY DEFINER RPC — short_answer + dialog_fill immediate-feedback grader, practice-mode only, §15 carve-out (mig 119); batch_submit_quiz redefined as per-type dispatcher with internal helpers _grade_record_mc/_short_answer/_dialog_fill REVOKE EXECUTE FROM PUBLIC, anon, authenticated + DISTINCT-question partial-credit scoring, Decision 47 (migs 120–121)) | Earlier 2026-06-19 (PR #856 / #823 MC answer-key relocation, renumbered onto master: get_report_correct_options active-user gate (mig 114); submit_quiz_answer idempotency-gate + re-read on dup-submit + intentional-divergence doc (mig 112); submit_vfr_rt blank_index dup-key canonicalization (mig 113); check_quiz_answer active-user gate + practice-mode guard + null-check (mig 117); batch_submit_quiz replay JOIN removed deleted_at filter (mig 112b); correct_option_id column relocation migs 111–117; integration tests +2) | Earlier 2026-06-18 (mig 110, internal-exam code email feature: `record_internal_exam_code_emailed(p_code_id)` SECURITY DEFINER RPC for audit-event writes; guard set mirrors issue_/void_internal_exam_code per security.md rule 11b; audit payload event_type=`internal_exam.code_emailed` / resource_type=`internal_exam_code`; invoked from Server Action sendInternalExamCodeEmail) | Earlier 2026-06-14 (mig 109, #864: `p_has_image` {all|only|exclude} AND-restriction added to `_filtered_question_pool` / `get_random_question_ids` / `get_filtered_question_counts` via DROP-then-recreate, mirrors p_calc_mode pattern #837; filters on question_image_url presence) | Earlier 2026-06-11 (migs 107–108, #837: `questions.has_calculations` BOOLEAN column + `GRANT SELECT (has_calculations)` to authenticated; `p_calc_mode` {all|only|exclude} AND-restriction added to `_filtered_question_pool` / `get_random_question_ids` / `get_filtered_question_counts` via DROP-then-recreate) | Earlier 2026-06-11 (migs 105–106, #833/#840: get_vfr_rt_exam_questions redefined session-derived — `(p_session_id uuid)` signature, IDs from frozen config.question_ids, explanation fields removed; get_vfr_rt_exam_results gains explanation_text/explanation_image_url behind the ended_at gate) | Previous: 2026-06-10 (Phase A migrations 094–104: VFR RT schema + 6 new RPCs + legacy-RPC mode whitelist (mig 104 complete_quiz_session redefinition, #838); questions type+answer-key columns + column-level REVOKE/GRANT; quiz_session_answers + student_responses per-blank support + UNIQUE NULLS NOT DISTINCT; quiz_sessions mode+config; exam_configs parts_config; start_vfr_rt_exam_session, get_vfr_rt_exam_questions, submit_vfr_rt_exam_answers, get_vfr_rt_exam_results, get_question_authoring_fields, normalize_answer RPCs) | Companion: docs/security.md*
