---
date: 2026-03-11
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

**Immutable tables (no UPDATE, no DELETE, ever):**
- `student_responses` — every answer a student ever gave
- `quiz_session_answers` — same, tied to a specific session
- `audit_events` — compliance log

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
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
  -- No deleted_at: sessions are immutable records of what happened
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
| `quiz_sessions` | No | Immutable record of what happened |
| `quiz_session_answers` | No | Immutable |
| `student_responses` | No | Immutable |
| `fsrs_cards` | No | Updated in place; deletion would break FSRS state |
| `audit_events` | No | Immutable compliance log |
| `easa_subjects/topics/subtopics` | No | Reference data, never deleted |

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
  get_quiz_questions        ← read, strips correct answers
  submit_quiz_answer        ← write, atomic: response + fsrs + audit
  start_quiz_session        ← write, atomic: session + locked question set
  complete_quiz_session     ← write, atomic: session end + score + audit
  soft_delete_question      ← write, sets deleted_at
  get_student_progress      ← read, aggregated progress view
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
  explanation_image_url text
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
    NULL::text AS explanation_image_url    -- returned by get_question_explanation after submit
  FROM questions q
  JOIN easa_subjects  s  ON s.id = q.subject_id
  JOIN easa_topics    t  ON t.id = q.topic_id
  LEFT JOIN easa_subtopics st ON st.id = q.subtopic_id,
  LATERAL jsonb_array_elements(q.options) AS opt
  WHERE q.id = ANY(p_question_ids)
    AND q.deleted_at IS NULL
    AND q.status = 'active'
  GROUP BY q.id, s.code, t.name, st.name;
END;
$$;
```

#### `submit_quiz_answer` — atomic answer submission

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
  v_student_id      uuid := auth.uid();
  v_org_id          uuid;
  v_correct_option  text;
  v_is_correct      boolean;
  v_expl_text       text;
  v_expl_image_url  text;
  v_session_ended   boolean;
BEGIN
  -- Auth check
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Verify session belongs to this student and is still active
  SELECT
    qs.organization_id,
    qs.ended_at IS NOT NULL
  INTO v_org_id, v_session_ended
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id
    AND qs.student_id = v_student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found';
  END IF;

  IF v_session_ended THEN
    RAISE EXCEPTION 'session already completed';
  END IF;

  -- Get correct answer and explanation (service-level access)
  SELECT
    (SELECT opt->>'id' FROM jsonb_array_elements(q.options) opt WHERE (opt->>'correct')::boolean LIMIT 1),
    q.explanation_text,
    q.explanation_image_url
  INTO v_correct_option, v_expl_text, v_expl_image_url
  FROM questions q
  WHERE q.id = p_question_id
    AND q.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'question not found';
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

  -- Upsert FSRS card state (handled by application layer calling ts-fsrs,
  -- then calling update_fsrs_card RPC with computed values)

  RETURN QUERY SELECT v_is_correct, v_expl_text, v_expl_image_url, v_correct_option;
END;
$$;
```

#### `start_quiz_session` — locks question set atomically

```sql
CREATE OR REPLACE FUNCTION start_quiz_session(
  p_mode        text,
  p_subject_id  uuid,
  p_topic_id    uuid,
  p_question_ids uuid[]    -- pre-selected by application, locked here
)
RETURNS uuid               -- session id
LANGUAGE plpgsql
AS $$
DECLARE
  v_session_id uuid;
BEGIN
  INSERT INTO quiz_sessions
    (organization_id, student_id, mode, subject_id, topic_id,
     config, total_questions)
  VALUES (
    (SELECT organization_id FROM users WHERE id = auth.uid()),
    auth.uid(),
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
    (SELECT organization_id FROM users WHERE id = auth.uid()),
    auth.uid(),
    (SELECT role FROM users WHERE id = auth.uid()),
    'quiz_session.started',
    'quiz_session',
    v_session_id
  );

  RETURN v_session_id;
END;
$$;
```

---

## 5. Indexes

```sql
-- Tenant scoping (on every org-scoped table)
CREATE INDEX idx_questions_org       ON questions(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_lessons_org         ON lessons(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_quiz_sessions_org   ON quiz_sessions(organization_id);
CREATE INDEX idx_student_responses_org ON student_responses(organization_id);

-- FSRS queue (the hot path — runs every time a student opens Smart Review)
CREATE INDEX idx_fsrs_cards_due      ON fsrs_cards(student_id, due)
  WHERE state != 'new';

-- Student data queries
CREATE INDEX idx_student_responses_student ON student_responses(student_id, created_at DESC);
CREATE INDEX idx_quiz_sessions_student     ON quiz_sessions(student_id, created_at DESC);

-- Question bank browsing
CREATE INDEX idx_questions_subject   ON questions(subject_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_questions_topic     ON questions(topic_id)   WHERE deleted_at IS NULL;
CREATE INDEX idx_questions_bank      ON questions(bank_id)    WHERE deleted_at IS NULL;

-- Audit log queries (compliance exports)
CREATE INDEX idx_audit_events_org    ON audit_events(organization_id, created_at DESC);
CREATE INDEX idx_audit_events_actor  ON audit_events(actor_id, created_at DESC);
```

---

## 6. Migration Rules

1. **Every migration is forward-only.** No rollback scripts. If you need to undo, write a new migration.
2. **Never rename a column in production** — add the new column, migrate data, drop the old column in three separate migrations.
3. **Never change a column type** without a migration that handles existing data.
4. **Every migration file is named** `NNN_short_description.sql` — e.g., `001_initial_schema.sql`.
5. **RLS must be enabled in the same migration as the table creation** — never in a separate file.
6. **Test every migration** against a local Supabase instance before pushing.

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

*Last updated: 2026-03-11 | Companion: docs/security.md*
