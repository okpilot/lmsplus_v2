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
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

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
  options         JSONB NOT NULL,              -- [{id,text,correct}] — correct stripped by RPC
  explanation_text TEXT NOT NULL,
  explanation_image_url TEXT NULL,
  difficulty      TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'draft')),
  version         INT NOT NULL DEFAULT 1,
  created_by      UUID NOT NULL REFERENCES users(id),
  deleted_at      TIMESTAMPTZ NULL,            -- soft delete = question retired from bank
  deleted_by      UUID REFERENCES users(id) NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Note: status='archived' is replaced by deleted_at IS NOT NULL
```

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
```sql
CREATE TABLE quiz_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  student_id       UUID NOT NULL REFERENCES users(id),
  mode             TEXT NOT NULL CHECK (mode IN ('smart_review', 'quick_quiz', 'mock_exam')),
  subject_id       UUID REFERENCES easa_subjects(id) NULL,  -- NULL for smart_review
  topic_id         UUID REFERENCES easa_topics(id) NULL,
  config           JSONB NOT NULL DEFAULT '{}',             -- question IDs locked at start
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at         TIMESTAMPTZ NULL,
  total_questions  INT NOT NULL DEFAULT 0,
  correct_count    INT NOT NULL DEFAULT 0,
  score_percentage NUMERIC(5,2) NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ NULL     -- added in migration 023 for discarded sessions
  -- No updated_at: only ended_at is set once, on completion
);
```

### quiz_session_answers
```sql
-- Immutable. No UPDATE, no DELETE, no soft delete.
CREATE TABLE quiz_session_answers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID NOT NULL REFERENCES quiz_sessions(id),
  question_id           UUID NOT NULL REFERENCES questions(id),
  selected_option_id    TEXT NOT NULL CHECK (selected_option_id IN ('a','b','c','d')),
  is_correct            BOOLEAN NOT NULL,
  response_time_ms      INT NOT NULL,
  answered_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, question_id)  -- one answer per question per session, enforced at DB level
);
```

### student_responses
```sql
-- Immutable. Every answer ever given, across all contexts.
CREATE TABLE student_responses (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES organizations(id),
  student_id         UUID NOT NULL REFERENCES users(id),
  question_id        UUID NOT NULL REFERENCES questions(id),
  session_id         UUID REFERENCES quiz_sessions(id) NULL,
  selected_option_id TEXT NOT NULL CHECK (selected_option_id IN ('a','b','c','d')),
  is_correct         BOOLEAN NOT NULL,
  response_time_ms   INT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
  -- No updated_at: this record is immutable by design
);
```

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
- SELECT: `student_id = auth.uid()` (app filters `deleted_at IS NULL` in flag.ts)
- INSERT: `student_id = auth.uid()`
- UPDATE: `student_id = auth.uid()` (soft-delete via `deleted_at = now()` in app code)

**Why `deleted_at` is not in RLS:** With `FORCE ROW LEVEL SECURITY`, Postgres checks SELECT visibility of the NEW row after UPDATE. Filtering `deleted_at IS NULL` in the policy would prevent soft-deletes from succeeding. Instead, application code filters deleted records via `.is('deleted_at', null)` in flag.ts. RLS only enforces ownership.

#### View: `active_flagged_questions`

```sql
CREATE OR REPLACE VIEW active_flagged_questions
WITH (security_invoker = true) AS
  SELECT * FROM flagged_questions WHERE deleted_at IS NULL;
```

This view filters soft-deleted flags and has `security_invoker = true` (migration 051), which means RLS policies on `flagged_questions` are enforced when the view is queried. Use this view instead of querying `flagged_questions` directly to ensure:
1. Only non-deleted flags are visible
2. Ownership RLS policies are applied via the view

**Why `security_invoker`?** By default, views run with owner-context permission checks, bypassing caller RLS. Setting `security_invoker = true` switches to invoker-context, so RLS on `flagged_questions` is evaluated as the calling user — ensuring `student_id = auth.uid()` is enforced when querying `active_flagged_questions`.

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

1. **Membership was validated at session start** — `quiz_sessions.config.question_ids` was locked when the session began, before the question could be deleted.
2. **Explanations are preserved** — the question record still exists (soft-deleted, not hard-deleted), so we can still retrieve explanation text and images.
3. **Historical integrity** — we score the response as it was when the student answered, not based on the question's current (deleted) state.

**Implementation:** `batch_submit_quiz` does NOT filter `WHERE deleted_at IS NULL` when fetching questions for explanation. RLS policies do not apply inside SECURITY DEFINER functions, so the RPC can access deleted questions as needed to complete historical scoring.

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
| `question_comments` | Hard DELETE (explicit exception — low audit value) | deleted_at exists as safety net but not used by application code |

> **Admin write access (migration 039):** `easa_subjects`, `easa_topics`, and `easa_subtopics` have RLS policies granting INSERT/UPDATE/DELETE to users where `is_admin()` returns `true`. All other users have SELECT-only access. These policies exist to support the Admin Syllabus Manager feature.

> **Admin question management (migrations 052–055):** The `questions` table has admin INSERT and UPDATE policies with org scoping — `is_admin() AND organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())`. No admin DELETE policy exists; questions use soft-delete via UPDATE to `deleted_at`. Students access questions only through the `get_quiz_questions()` RPC, which strips the `correct` field from options.

> **Storage: `question-images` bucket (migrations 053, 055):** Admin INSERT/UPDATE/DELETE policies enforce org-scoped path isolation — images are stored at `{org_id}/{filename}` and policies check `(storage.foldername(name))[1]` matches the admin's org. Authenticated SELECT allows all users to read images (for quiz display). The upload action (`uploadQuestionImage`) resolves the admin's org and prefixes the path automatically.

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
  get_quiz_questions         ← read, strips correct answers
  get_report_correct_options ← read, returns correct option IDs for completed-session reports
  check_quiz_answer          ← read, verify answer + return explanation (immediate feedback)
  submit_quiz_answer         ← write, atomic: single answer + response log + last_was_correct
  batch_submit_quiz          ← write, atomic: all answers + session complete + score + audit (deferred writes pattern)
  start_quiz_session         ← write, atomic: session + locked question set
  complete_quiz_session      ← write, atomic: session end + score + audit (DEPRECATED — use batch_submit_quiz)
  soft_delete_question       ← write, sets deleted_at
  get_student_progress       ← read, aggregated progress view
  get_daily_activity         ← read, analytics: daily answer counts (zero-filled)
  get_subject_scores         ← read, analytics: avg scores by subject
```

### Security Model

```sql
-- SECURITY INVOKER (default): RPC runs as the calling user, RLS applies
-- Use for: most reads and writes — RLS is your safety net
CREATE FUNCTION get_quiz_questions(...)
LANGUAGE plpgsql
AS $$ ... $$;

-- SECURITY DEFINER: RPC runs as the function owner (bypasses RLS)
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

```sql
CREATE OR REPLACE FUNCTION get_quiz_questions(p_question_ids uuid[])
RETURNS TABLE (
  id                    uuid,
  question_text         text,
  question_image_url    text,
  options               jsonb,    -- correct field removed
  subject_code          text,
  topic_name            text,
  subtopic_name         text,
  lo_reference          text,
  difficulty            text,
  explanation_text      text,     -- returned ONLY after answer submitted
  explanation_image_url text,
  question_number       text      -- external ID from source QDB (e.g. '688864')
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    q.id,
    q.question_text,
    q.question_image_url,
    jsonb_agg(
      jsonb_build_object('id', opt->>'id', 'text', opt->>'text')
      ORDER BY opt->>'id'
    ) AS options,
    s.code    AS subject_code,
    t.name    AS topic_name,
    st.name   AS subtopic_name,
    q.lo_reference,
    q.difficulty,
    NULL::text AS explanation_text,        -- not returned here
    NULL::text AS explanation_image_url,   -- returned by get_question_explanation after submit
    q.question_number
  FROM questions q
  JOIN easa_subjects  s  ON s.id = q.subject_id
  JOIN easa_topics    t  ON t.id = q.topic_id
  LEFT JOIN easa_subtopics st ON st.id = q.subtopic_id,
  LATERAL jsonb_array_elements(q.options) AS opt
  WHERE q.id = ANY(p_question_ids)
    AND q.deleted_at IS NULL
    AND q.status = 'active'
  GROUP BY q.id, q.question_text, q.question_image_url, s.code, t.name, st.name, q.lo_reference, q.difficulty, q.question_number;
END;
$$;
```

#### `submit_quiz_answer` — atomic answer submission (deprecated: use `batch_submit_quiz`)

This RPC is superseded by `batch_submit_quiz` for new code. Kept for backwards compatibility.

**Security (migration 036):**
- Validates `p_question_id` is in the session's `config.question_ids` (migration 033). Prevents submitting answers for questions outside the session's question set.
- Soft-delete guard: `deleted_at IS NULL` prevents submitting to a discarded (soft-deleted) session.
- Option membership validation: verifies `p_selected_option` exists in the question's options JSONB array. Prevents attackers from submitting arbitrary strings as option IDs.

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
  -- deleted_at filter applied: active sessions should only reference active questions.
  SELECT
    (SELECT opt->>'id' FROM jsonb_array_elements(q.options) opt WHERE (opt->>'correct')::boolean LIMIT 1),
    q.explanation_text,
    q.explanation_image_url,
    q.options
  INTO v_correct_option, v_expl_text, v_expl_image_url, v_options
  FROM questions q
  WHERE q.id = p_question_id
    AND q.deleted_at IS NULL;

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

  -- Insert answer (idempotent: ignore duplicate on retry)
  INSERT INTO quiz_session_answers
    (session_id, question_id, selected_option_id, is_correct, response_time_ms)
  VALUES
    (p_session_id, p_question_id, p_selected_option, v_is_correct, p_response_time_ms)
  ON CONFLICT (session_id, question_id) DO NOTHING;

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

  RETURN QUERY SELECT v_is_correct, v_expl_text, v_expl_image_url, v_correct_option;
END;
$$;
```

#### `batch_submit_quiz` — atomic batch submission (all-or-nothing)

Submits all quiz answers in a single transaction. Replaces the per-answer `submit_quiz_answer` loop + separate `complete_quiz_session` call. Calculates scores and completes the session atomically — if any answer fails, the entire batch rolls back.

**Key behavior:**
- Allows partial submissions (students may skip questions; score = `correct / answered`, not `correct / total`)
- Updates `fsrs_cards.last_was_correct` atomically within the RPC transaction
- Returns both `answered_count` (actual answers submitted) and `correct_count` (correct answers)
- Hardens input validation (migration 025): validates `p_answers` is non-null JSON array, guards against malformed session config, rejects duplicates, verifies question membership in session
- Hardens field validation (migration 026): validates `jsonb_typeof(v_config->'question_ids')` = 'array' BEFORE extraction (fixes eval-before-guard issue); validates `selected_option` and `response_time_ms` per answer AFTER extraction
- Uses case-insensitive UUID regex (migration 028): validates question_id with `!~*` instead of `!~` to accept uppercase UUIDs (valid per RFC 4122); defense-in-depth hardening
- Hardens null guard (migration 030): adds explicit `IS NULL` check on `v_config->'question_ids'` BEFORE calling `jsonb_typeof` (prevents SQL NULL vs missing key ambiguity); raises if no correct option found for a question (data integrity check)
- Option membership validation (migration 037): verifies each `selected_option` exists in the question's options JSONB array. Prevents attackers from submitting arbitrary strings as option IDs in batch operations.
- **N+1 fix (migration 041):** uses `CREATE TEMP TABLE _batch_questions` to bulk-fetch all questions for the session in a single query before the answer loop, then reads from the temp table per-answer instead of issuing N separate SELECT statements. Reduces query overhead from O(N) to O(1) for question lookups.

**Use this for:** finishing a quiz session with accumulated answers (deferred writes pattern).

```sql
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
  v_org_id          uuid;
  v_config          jsonb;
  v_answer          jsonb;
  v_correct_option  text;
  v_is_correct      boolean;
  v_expl_text       text;
  v_expl_image_url  text;
  v_question_id     uuid;
  v_selected_option text;
  v_response_time   int;
  v_results         jsonb := '[]'::jsonb;
  v_total           int;
  v_answered        int;
  v_correct_count   int;
  v_score           numeric(5,2);
  v_session_question_ids uuid[];
  v_qid_text        text;
  v_rt_text         text;
  v_ended_at        timestamptz;
  v_options         jsonb;
BEGIN
  -- Auth check
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Step 1: Fetch session row (allow already-completed sessions for idempotent replay)
  SELECT qs.organization_id, qs.total_questions, qs.config, qs.ended_at,
         qs.correct_count, qs.score_percentage
  INTO v_org_id, v_total, v_config, v_ended_at, v_correct_count, v_score
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
  IF v_ended_at IS NOT NULL THEN
    SELECT count(*)::int INTO v_answered
    FROM quiz_session_answers WHERE session_id = p_session_id;

    SELECT jsonb_agg(jsonb_build_object(
      'question_id', qsa.question_id,
      'is_correct', qsa.is_correct,
      'correct_option_id', (
        SELECT opt->>'id' FROM jsonb_array_elements(q.options) opt
        WHERE (opt->>'correct')::boolean LIMIT 1
      ),
      'explanation_text', q.explanation_text,
      'explanation_image_url', q.explanation_image_url
    ))
    INTO v_results
    FROM quiz_session_answers qsa
    JOIN questions q ON q.id = qsa.question_id
    WHERE qsa.session_id = p_session_id;

    RETURN jsonb_build_object(
      'results', COALESCE(v_results, '[]'::jsonb),
      'total_questions', v_total,
      'answered_count', v_answered,
      'correct_count', v_correct_count,
      'score_percentage', v_score
    );
  END IF;

  -- Step 2: Guard against malformed config BEFORE extracting question_ids
  IF v_config IS NULL OR v_config->'question_ids' IS NULL OR jsonb_typeof(v_config->'question_ids') <> 'array' THEN
    RAISE EXCEPTION 'session config is malformed — question_ids not set';
  END IF;

  -- Step 3: Now safe to extract question_ids
  v_session_question_ids := ARRAY(SELECT jsonb_array_elements_text(v_config->'question_ids'))::uuid[];

  -- Validate p_answers is a non-null JSON array
  IF p_answers IS NULL
     OR jsonb_typeof(p_answers) <> 'array'
     OR jsonb_array_length(p_answers) = 0 THEN
    RAISE EXCEPTION 'answers must be a non-empty JSON array';
  END IF;

  -- Reject duplicate question_id entries in payload (compare as text, no cast)
  IF (
    SELECT count(*) <> count(DISTINCT lower(e->>'question_id'))
    FROM jsonb_array_elements(p_answers) AS e
  ) THEN
    RAISE EXCEPTION 'duplicate question_id in answers payload';
  END IF;

  -- Bulk-fetch all questions for this session into a temp table (fixes N+1).
  -- Intentionally no deleted_at filter: session membership was verified against
  -- config.question_ids (a snapshot locked at session start via FOR UPDATE).
  -- A question soft-deleted after that point must still score correctly.
  CREATE TEMP TABLE _batch_questions ON COMMIT DROP AS
  SELECT
    q.id,
    (SELECT opt->>'id' FROM jsonb_array_elements(q.options) opt
     WHERE (opt->>'correct')::boolean LIMIT 1) AS correct_option,
    q.explanation_text,
    q.explanation_image_url,
    q.options
  FROM questions q
  WHERE q.id = ANY(v_session_question_ids);

  -- Process each provided answer (partial submission is allowed)
  FOR v_answer IN SELECT * FROM jsonb_array_elements(p_answers)
  LOOP
    -- Extract as text first, validate format, THEN cast
    v_qid_text        := v_answer->>'question_id';
    v_selected_option := v_answer->>'selected_option';
    v_rt_text         := v_answer->>'response_time_ms';

    IF v_qid_text IS NULL OR v_qid_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'invalid question_id format: %', coalesce(v_qid_text, 'NULL');
    END IF;
    IF v_selected_option IS NULL OR v_selected_option = '' THEN
      RAISE EXCEPTION 'answer for question % has empty selected_option', v_qid_text;
    END IF;
    IF v_rt_text IS NULL OR v_rt_text !~ '^\d{1,9}$' THEN
      RAISE EXCEPTION 'answer for question % has invalid response_time_ms', v_qid_text;
    END IF;

    v_question_id   := v_qid_text::uuid;
    v_response_time := v_rt_text::int;

    -- Validate question belongs to this session
    IF NOT (v_question_id = ANY(v_session_question_ids)) THEN
      RAISE EXCEPTION 'question % does not belong to session %', v_question_id, p_session_id;
    END IF;

    -- Look up from pre-fetched temp table (single query for all questions)
    SELECT bq.correct_option, bq.explanation_text, bq.explanation_image_url, bq.options
    INTO v_correct_option, v_expl_text, v_expl_image_url, v_options
    FROM _batch_questions bq
    WHERE bq.id = v_question_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'question not found: %', v_question_id;
    END IF;

    IF v_correct_option IS NULL THEN
      RAISE EXCEPTION 'question % has no correct option', v_question_id;
    END IF;

    -- Validate selected option belongs to this question's options array
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_options) opt
      WHERE opt->>'id' = v_selected_option
    ) THEN
      RAISE EXCEPTION 'selected option % does not belong to question %', v_selected_option, v_question_id;
    END IF;

    v_is_correct := (v_selected_option = v_correct_option);

    -- Insert answer (idempotent)
    INSERT INTO quiz_session_answers
      (session_id, question_id, selected_option_id, is_correct, response_time_ms)
    VALUES
      (p_session_id, v_question_id, v_selected_option, v_is_correct, v_response_time)
    ON CONFLICT (session_id, question_id) DO NOTHING;

    -- Insert to immutable response log (idempotent)
    INSERT INTO student_responses
      (organization_id, student_id, question_id, session_id,
       selected_option_id, is_correct, response_time_ms)
    VALUES
      (v_org_id, v_student_id, v_question_id, p_session_id,
       v_selected_option, v_is_correct, v_response_time)
    ON CONFLICT DO NOTHING;

    -- Update last_was_correct atomically within this transaction.
    INSERT INTO fsrs_cards (student_id, question_id, last_was_correct, updated_at)
    VALUES (v_student_id, v_question_id, v_is_correct, now())
    ON CONFLICT (student_id, question_id)
    DO UPDATE SET
      last_was_correct = EXCLUDED.last_was_correct,
      updated_at = now();

    -- Accumulate result
    v_results := v_results || jsonb_build_object(
      'question_id', v_question_id,
      'is_correct', v_is_correct,
      'correct_option_id', v_correct_option,
      'explanation_text', v_expl_text,
      'explanation_image_url', v_expl_image_url
    );
  END LOOP;

  -- Count answered and correct from this session (idempotent ON CONFLICT means re-runs are safe)
  SELECT
    count(*)::int,
    count(*) FILTER (WHERE qsa.is_correct)::int
  INTO v_answered, v_correct_count
  FROM quiz_session_answers qsa
  WHERE qsa.session_id = p_session_id;

  -- Score over answered questions only (unanswered questions are excluded from the denominator)
  v_score := CASE WHEN v_answered > 0 THEN round((v_correct_count::numeric / v_answered) * 100, 2) ELSE 0 END;

  -- Complete session
  UPDATE quiz_sessions
  SET
    ended_at         = now(),
    correct_count    = v_correct_count,
    score_percentage = v_score
  WHERE id = p_session_id;

  -- Audit log
  INSERT INTO audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id,
    v_student_id,
    (SELECT role FROM users WHERE id = v_student_id),
    'quiz_session.batch_submitted',
    'quiz_session',
    p_session_id,
    jsonb_build_object(
      'total_questions', v_total,
      'answered', v_answered,
      'correct', v_correct_count,
      'score', v_score
    )
  );

  RETURN jsonb_build_object(
    'results', v_results,
    'total_questions', v_total,
    'answered_count', v_answered,
    'correct_count', v_correct_count,
    'score_percentage', v_score
  );
END;
$$;
```

#### `get_report_correct_options` — correct option IDs for reports

Returns correct option IDs for the questions answered in a completed session owned by the caller. The RPC derives that question set from `quiz_session_answers`, so the TypeScript layer never reads the raw `correct` boolean from options JSONB.

**Security:** Validates session ownership (`student_id = auth.uid()`), completion (`ended_at IS NOT NULL`), and soft-delete status. Raises exception if any check fails.

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
    sa.question_id, (opt.value->>'id')::text
  FROM quiz_session_answers sa
  JOIN questions q ON q.id = sa.question_id
  CROSS JOIN LATERAL jsonb_array_elements(q.options) WITH ORDINALITY AS opt(value, ord)
  WHERE sa.session_id = p_session_id
    AND (opt.value->>'correct')::boolean = true
  ORDER BY sa.question_id, opt.ord;
END;
$$;
```

#### `check_quiz_answer` — verify answer + return explanation

Verifies a student's answer for a question during an active quiz session. Returns correctness, correct option ID, and explanation. Requires session ownership.

**Key behavior:**
- Validates that the session belongs to the current student and is still active
- Validates that the question belongs to the session's locked question set
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

  -- Session ownership: verify the student owns an active session
  SELECT qs.config
  INTO v_config
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id
    AND qs.student_id = v_student_id
    AND qs.ended_at IS NULL
    AND qs.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found or not owned by this student';
  END IF;

  -- Guard against malformed config (matches pattern in batch_submit_quiz)
  IF v_config IS NULL OR v_config->'question_ids' IS NULL OR jsonb_typeof(v_config->'question_ids') <> 'array' THEN
    RAISE EXCEPTION 'session config is malformed — question_ids not set';
  END IF;

  -- Verify question belongs to this session
  v_session_question_ids := ARRAY(SELECT jsonb_array_elements_text(v_config->'question_ids'))::uuid[];
  IF NOT (p_question_id = ANY(v_session_question_ids)) THEN
    RAISE EXCEPTION 'question % does not belong to session %', p_question_id, p_session_id;
  END IF;

  -- Fetch correct option and explanation.
  -- Intentionally no deleted_at filter: session membership was verified against
  -- config.question_ids (a snapshot locked at session start via FOR UPDATE).
  -- A question soft-deleted after that point must still be answerable.
  SELECT
    (SELECT opt->>'id'
       FROM jsonb_array_elements(q.options) opt
      WHERE (opt->>'correct')::boolean
      LIMIT 1),
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

#### `start_quiz_session` — locks question set atomically

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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO quiz_sessions
    (organization_id, student_id, mode, subject_id, topic_id,
     config, total_questions)
  VALUES (
    (SELECT organization_id FROM users WHERE id = v_uid),
    v_uid,
    p_mode,
    p_subject_id,
    p_topic_id,
    jsonb_build_object('question_ids', to_jsonb(p_question_ids)),
    array_length(p_question_ids, 1)
  )
  RETURNING id INTO v_session_id;

  -- Audit log
  INSERT INTO audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id)
  VALUES (
    (SELECT organization_id FROM users WHERE id = v_uid),
    v_uid,
    (SELECT role FROM users WHERE id = v_uid),
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
Checks `auth.uid()` against `users.role = 'admin'`. Returns `false` (not an exception) when no user is authenticated, so it is safe to call from RLS policies without causing errors for unauthenticated requests.

Used by RLS policies on `easa_subjects`, `easa_topics`, and `easa_subtopics` to gate INSERT/UPDATE/DELETE to admin users only (migration 039).

```sql
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
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
| `trg_enforce_draft_limit` | `quiz_drafts` | DB-enforced max drafts per student (migration 021) |
| `trg_protect_users_sensitive_columns` | `users` | Blocks role/org/deleted_at changes (20260316000041) |

---

## 5. Indexes

```sql
-- Tenant scoping (on every org-scoped table)
CREATE INDEX idx_questions_org       ON questions(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_lessons_org         ON lessons(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_quiz_sessions_org   ON quiz_sessions(organization_id);
CREATE INDEX idx_student_responses_org ON student_responses(organization_id);
CREATE INDEX idx_users_org           ON users(organization_id) WHERE deleted_at IS NULL;
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

*Last updated: 2026-03-24 (migrations 052-055: admin question editor RLS + storage policies) | Companion: docs/security.md*
