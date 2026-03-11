-- 001_initial_schema.sql
-- Full schema for LMS Plus v2
-- RLS enabled inline with every table creation

-- ============================================================
-- organizations
-- ============================================================
CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  settings    JSONB NOT NULL DEFAULT '{}',
  deleted_at  TIMESTAMPTZ NULL,
  deleted_by  UUID NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;

-- ============================================================
-- users
-- ============================================================
CREATE TABLE users (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  email           TEXT NOT NULL,
  full_name       TEXT NULL,
  role            TEXT NOT NULL CHECK (role IN ('admin', 'instructor', 'student')),
  deleted_at      TIMESTAMPTZ NULL,
  deleted_by      UUID NULL,
  last_active_at  TIMESTAMPTZ NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

-- Back-reference for organizations.deleted_by
ALTER TABLE organizations
  ADD CONSTRAINT fk_organizations_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id);

-- Back-reference for users.deleted_by
ALTER TABLE users
  ADD CONSTRAINT fk_users_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id);

-- ============================================================
-- easa_subjects / easa_topics / easa_subtopics (reference data)
-- ============================================================
CREATE TABLE easa_subjects (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  short      TEXT NOT NULL,
  sort_order INT NOT NULL
);

ALTER TABLE easa_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE easa_subjects FORCE ROW LEVEL SECURITY;

CREATE TABLE easa_topics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id  UUID NOT NULL REFERENCES easa_subjects(id),
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  sort_order  INT NOT NULL,
  UNIQUE (subject_id, code)
);

ALTER TABLE easa_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE easa_topics FORCE ROW LEVEL SECURITY;

CREATE TABLE easa_subtopics (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id   UUID NOT NULL REFERENCES easa_topics(id),
  code       TEXT NOT NULL,
  name       TEXT NOT NULL,
  sort_order INT NOT NULL,
  UNIQUE (topic_id, code)
);

ALTER TABLE easa_subtopics ENABLE ROW LEVEL SECURITY;
ALTER TABLE easa_subtopics FORCE ROW LEVEL SECURITY;

-- ============================================================
-- question_banks
-- ============================================================
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

ALTER TABLE question_banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_banks FORCE ROW LEVEL SECURITY;

-- ============================================================
-- questions
-- ============================================================
CREATE TABLE questions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id),
  bank_id               UUID NOT NULL REFERENCES question_banks(id),
  subject_id            UUID NOT NULL REFERENCES easa_subjects(id),
  topic_id              UUID NOT NULL REFERENCES easa_topics(id),
  subtopic_id           UUID REFERENCES easa_subtopics(id) NULL,
  lo_reference          TEXT NULL,
  question_text         TEXT NOT NULL,
  question_image_url    TEXT NULL,
  options               JSONB NOT NULL,
  explanation_text      TEXT NOT NULL,
  explanation_image_url TEXT NULL,
  difficulty            TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  status                TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'draft')),
  version               INT NOT NULL DEFAULT 1,
  created_by            UUID NOT NULL REFERENCES users(id),
  deleted_at            TIMESTAMPTZ NULL,
  deleted_by            UUID REFERENCES users(id) NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions FORCE ROW LEVEL SECURITY;

-- ============================================================
-- courses
-- ============================================================
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

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses FORCE ROW LEVEL SECURITY;

-- ============================================================
-- lessons
-- ============================================================
CREATE TABLE lessons (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id            UUID NOT NULL REFERENCES organizations(id),
  course_id                  UUID REFERENCES courses(id) NULL,
  title                      TEXT NOT NULL,
  subject                    TEXT NOT NULL,
  learning_objectives        TEXT[] NOT NULL DEFAULT '{}',
  estimated_duration_minutes INT NOT NULL DEFAULT 90,
  content                    JSONB NOT NULL DEFAULT '{}',
  status                     TEXT NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft', 'ready')),
  schema_version             TEXT NOT NULL DEFAULT '1.0.0',
  version                    INT NOT NULL DEFAULT 1,
  created_by                 UUID NOT NULL REFERENCES users(id),
  deleted_at                 TIMESTAMPTZ NULL,
  deleted_by                 UUID REFERENCES users(id) NULL,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons FORCE ROW LEVEL SECURITY;

-- ============================================================
-- quiz_sessions (immutable record — no soft delete)
-- ============================================================
CREATE TABLE quiz_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  student_id       UUID NOT NULL REFERENCES users(id),
  mode             TEXT NOT NULL CHECK (mode IN ('smart_review', 'quick_quiz', 'mock_exam')),
  subject_id       UUID REFERENCES easa_subjects(id) NULL,
  topic_id         UUID REFERENCES easa_topics(id) NULL,
  config           JSONB NOT NULL DEFAULT '{}',
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at         TIMESTAMPTZ NULL,
  total_questions  INT NOT NULL DEFAULT 0,
  correct_count    INT NOT NULL DEFAULT 0,
  score_percentage NUMERIC(5,2) NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE quiz_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_sessions FORCE ROW LEVEL SECURITY;

-- ============================================================
-- quiz_session_answers (IMMUTABLE — no UPDATE, no DELETE)
-- ============================================================
CREATE TABLE quiz_session_answers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         UUID NOT NULL REFERENCES quiz_sessions(id),
  question_id        UUID NOT NULL REFERENCES questions(id),
  selected_option_id TEXT NOT NULL CHECK (selected_option_id IN ('a','b','c','d')),
  is_correct         BOOLEAN NOT NULL,
  response_time_ms   INT NOT NULL,
  answered_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, question_id)
);

ALTER TABLE quiz_session_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_session_answers FORCE ROW LEVEL SECURITY;

-- ============================================================
-- student_responses (IMMUTABLE — every answer ever given)
-- ============================================================
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
);

ALTER TABLE student_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_responses FORCE ROW LEVEL SECURITY;

-- ============================================================
-- fsrs_cards (upsert-only)
-- ============================================================
CREATE TABLE fsrs_cards (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID NOT NULL REFERENCES users(id),
  question_id    UUID NOT NULL REFERENCES questions(id),
  due            TIMESTAMPTZ NOT NULL DEFAULT now(),
  stability      FLOAT NOT NULL DEFAULT 0,
  difficulty     FLOAT NOT NULL DEFAULT 0,
  elapsed_days   INT NOT NULL DEFAULT 0,
  scheduled_days INT NOT NULL DEFAULT 0,
  reps           INT NOT NULL DEFAULT 0,
  lapses         INT NOT NULL DEFAULT 0,
  state          TEXT NOT NULL DEFAULT 'new'
                   CHECK (state IN ('new', 'learning', 'review', 'relearning')),
  last_review    TIMESTAMPTZ NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, question_id)
);

ALTER TABLE fsrs_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE fsrs_cards FORCE ROW LEVEL SECURITY;

-- ============================================================
-- audit_events (IMMUTABLE — append-only compliance log)
-- ============================================================
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

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- ---------- organizations ----------
CREATE POLICY "tenant_isolation" ON organizations
  USING (
    id = (SELECT organization_id FROM users WHERE id = auth.uid())
  )
  WITH CHECK (
    id = (SELECT organization_id FROM users WHERE id = auth.uid())
  );

-- ---------- users ----------
CREATE POLICY "tenant_isolation" ON users
  USING (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    AND deleted_at IS NULL
  )
  WITH CHECK (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    AND deleted_at IS NULL
  );

-- ---------- easa_subjects (read-only for all authenticated) ----------
CREATE POLICY "authenticated_read" ON easa_subjects
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ---------- easa_topics (read-only for all authenticated) ----------
CREATE POLICY "authenticated_read" ON easa_topics
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ---------- easa_subtopics (read-only for all authenticated) ----------
CREATE POLICY "authenticated_read" ON easa_subtopics
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ---------- question_banks ----------
CREATE POLICY "tenant_isolation" ON question_banks
  USING (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    AND deleted_at IS NULL
  )
  WITH CHECK (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    AND deleted_at IS NULL
  );

-- ---------- questions ----------
CREATE POLICY "tenant_isolation" ON questions
  USING (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    AND deleted_at IS NULL
  )
  WITH CHECK (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    AND deleted_at IS NULL
  );

-- ---------- courses ----------
CREATE POLICY "tenant_isolation" ON courses
  USING (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    AND deleted_at IS NULL
  )
  WITH CHECK (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    AND deleted_at IS NULL
  );

-- ---------- lessons ----------
CREATE POLICY "tenant_isolation" ON lessons
  USING (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    AND deleted_at IS NULL
  )
  WITH CHECK (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    AND deleted_at IS NULL
  );

-- ---------- quiz_sessions ----------
CREATE POLICY "students_own_sessions" ON quiz_sessions
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "instructors_read_sessions" ON quiz_sessions
  FOR SELECT
  USING (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) IN ('instructor', 'admin')
  );

-- ---------- quiz_session_answers (IMMUTABLE) ----------
CREATE POLICY "students_own_answers" ON quiz_session_answers
  USING (
    session_id IN (SELECT id FROM quiz_sessions WHERE student_id = auth.uid())
  )
  WITH CHECK (
    session_id IN (SELECT id FROM quiz_sessions WHERE student_id = auth.uid())
  );

CREATE POLICY "no_update" ON quiz_session_answers
  FOR UPDATE USING (false);

CREATE POLICY "no_delete" ON quiz_session_answers
  FOR DELETE USING (false);

-- ---------- student_responses (IMMUTABLE) ----------
CREATE POLICY "students_own_data" ON student_responses
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "instructors_read_students" ON student_responses
  FOR SELECT
  USING (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) IN ('instructor', 'admin')
  );

CREATE POLICY "no_update" ON student_responses
  FOR UPDATE USING (false);

CREATE POLICY "no_delete" ON student_responses
  FOR DELETE USING (false);

-- ---------- fsrs_cards ----------
CREATE POLICY "students_own_cards" ON fsrs_cards
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- ---------- audit_events (IMMUTABLE — append-only) ----------
CREATE POLICY "audit_insert_own_org" ON audit_events
  FOR INSERT WITH CHECK (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "audit_read_instructors" ON audit_events
  FOR SELECT USING (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) IN ('instructor', 'admin')
  );

CREATE POLICY "audit_no_update" ON audit_events
  FOR UPDATE USING (false);

CREATE POLICY "audit_no_delete" ON audit_events
  FOR DELETE USING (false);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_questions_org          ON questions(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_lessons_org            ON lessons(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_quiz_sessions_org      ON quiz_sessions(organization_id);
CREATE INDEX idx_student_responses_org  ON student_responses(organization_id);

CREATE INDEX idx_fsrs_cards_due         ON fsrs_cards(student_id, due) WHERE state != 'new';

CREATE INDEX idx_student_responses_student ON student_responses(student_id, created_at DESC);
CREATE INDEX idx_quiz_sessions_student     ON quiz_sessions(student_id, created_at DESC);

CREATE INDEX idx_questions_subject      ON questions(subject_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_questions_topic        ON questions(topic_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_questions_bank         ON questions(bank_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_audit_events_org       ON audit_events(organization_id, created_at DESC);
CREATE INDEX idx_audit_events_actor     ON audit_events(actor_id, created_at DESC);
