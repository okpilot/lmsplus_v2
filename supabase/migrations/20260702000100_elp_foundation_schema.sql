-- Migration 150: AI ICAO ELP — foundation schema (Slice 0).
--
-- Candidate-facing AI mock ELP (oral) exam prep. Async-scored: a student records
-- audio per section, a Supabase Edge Function transcribes (ElevenLabs Scribe) and
-- scores (Claude) off the request path, and writes back per-descriptor 1..6 levels.
-- Final overall level = MIN across the 6 aggregate descriptor rows (weakest link).
--
-- Four tables + their RLS. Conventions mirror 001_initial_schema.sql:
--   * ENABLE + FORCE ROW LEVEL SECURITY on every table.
--   * Tenant isolation via organization_id; owner scope via student_id = auth.uid().
--   * Soft-delete (deleted_at/deleted_by) on the session; the child rows are
--     immutable append-only from the authenticated surface (FOR UPDATE/DELETE
--     USING(false), like quiz_session_answers / student_responses / audit_events).
--   * CHECK columns, not Postgres enums (repo convention).
--
-- RLS-BYPASS MODEL (load-bearing — see 152_write_oral_section_grade.sql):
-- All mutations flow through SECURITY DEFINER RPCs owned by `postgres`, which has
-- rolbypassrls = true, so those RPCs write through FORCE RLS. The policies below
-- therefore govern ONLY direct PostgREST access by the `authenticated`/`anon`
-- roles (no BYPASSRLS): students may read their own rows; NOBODY may write
-- directly. The student-facing RPCs (151) and the grader RPC (152) are the only
-- sanctioned write paths.
--
-- Storage bucket `elp-recordings` + its policies live in the supabase/migrations
-- mirror only (storage schema): 20260702000400_elp_recordings_storage.sql.

-- ============================================================
-- oral_exam_sessions — one mock oral exam attempt (mutable state machine)
-- ============================================================
CREATE TABLE oral_exam_sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES organizations(id),
  student_id         UUID NOT NULL REFERENCES users(id),
  status             TEXT NOT NULL DEFAULT 'in_progress'
                       CHECK (status IN ('in_progress', 'grading', 'graded', 'discarded')),
  config             JSONB NOT NULL DEFAULT '{}',
  started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at           TIMESTAMPTZ NULL,
  total_final_level  SMALLINT NULL CHECK (total_final_level IS NULL OR total_final_level BETWEEN 1 AND 6),
  deleted_at         TIMESTAMPTZ NULL,
  deleted_by         UUID NULL REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE oral_exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE oral_exam_sessions FORCE ROW LEVEL SECURITY;

-- One active oral exam per student. Independent of quiz_sessions'
-- uq_one_active_session_per_student (mig 136): oral exams share no MC answer pool,
-- so the #1011 cross-surface oracle does not apply here — this index only enforces
-- the "one attempt at a time" product invariant for oral exams themselves.
CREATE UNIQUE INDEX uq_one_active_oral_exam_per_student
  ON oral_exam_sessions (student_id)
  WHERE ended_at IS NULL AND deleted_at IS NULL;

CREATE INDEX idx_oral_exam_sessions_student
  ON oral_exam_sessions (student_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_oral_exam_sessions_org
  ON oral_exam_sessions (organization_id) WHERE deleted_at IS NULL;

-- Reads: student sees own; instructor/admin see own org. No direct writes (RPC-only).
CREATE POLICY "students_own_oral_sessions" ON oral_exam_sessions
  FOR SELECT USING (student_id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY "staff_read_oral_sessions" ON oral_exam_sessions
  FOR SELECT USING (
    deleted_at IS NULL
    AND organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) IN ('instructor', 'admin')
  );

-- ============================================================
-- oral_exam_section_responses — one recorded answer per section (append-only)
-- ============================================================
CREATE TABLE oral_exam_section_responses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID NOT NULL REFERENCES oral_exam_sessions(id),
  section_no       SMALLINT NOT NULL CHECK (section_no BETWEEN 1 AND 5),
  audio_path       TEXT NOT NULL,
  transcript_text  TEXT NULL,
  transcript_meta  JSONB NULL,
  duration_ms      INT NULL CHECK (duration_ms IS NULL OR duration_ms >= 0),
  status           TEXT NOT NULL DEFAULT 'grading'
                     CHECK (status IN ('grading', 'graded', 'failed')),
  recorded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, section_no)
);

ALTER TABLE oral_exam_section_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE oral_exam_section_responses FORCE ROW LEVEL SECURITY;

-- Student reads own (poll grading status; own transcript is own speech — not
-- reveal-gated). Scores live in oral_exam_descriptor_scores, which IS reveal-gated.
CREATE POLICY "students_own_oral_responses" ON oral_exam_section_responses
  FOR SELECT USING (
    session_id IN (
      SELECT id FROM oral_exam_sessions
      WHERE student_id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE POLICY "staff_read_oral_responses" ON oral_exam_section_responses
  FOR SELECT USING (
    session_id IN (
      SELECT s.id FROM oral_exam_sessions s
      WHERE s.organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
        AND s.deleted_at IS NULL
        AND (SELECT role FROM users WHERE id = auth.uid()) IN ('instructor', 'admin')
    )
  );

CREATE POLICY "oral_responses_no_update" ON oral_exam_section_responses
  FOR UPDATE USING (false);
CREATE POLICY "oral_responses_no_delete" ON oral_exam_section_responses
  FOR DELETE USING (false);

-- ============================================================
-- oral_exam_descriptor_scores — per-descriptor 1..6 levels (append-only, reveal-gated)
--   section_no NOT NULL = per-section score; section_no NULL = aggregate/final row.
-- ============================================================
CREATE TABLE oral_exam_descriptor_scores (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES oral_exam_sessions(id),
  section_no   SMALLINT NULL CHECK (section_no IS NULL OR section_no BETWEEN 1 AND 5),
  descriptor   TEXT NOT NULL CHECK (descriptor IN
                 ('pronunciation', 'structure', 'vocabulary', 'fluency', 'comprehension', 'interaction')),
  level        SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 6),
  rationale    TEXT NULL,
  evidence     JSONB NULL,
  scored_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE oral_exam_descriptor_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE oral_exam_descriptor_scores FORCE ROW LEVEL SECURITY;

-- Aggregate-row dedup: a plain UNIQUE treats each NULL section_no as distinct, so
-- a grader replay would insert a duplicate final row (or throw). Partial unique on
-- the aggregate rows keeps exactly one (session_id, descriptor) final row.
CREATE UNIQUE INDEX uq_oral_descriptor_aggregate
  ON oral_exam_descriptor_scores (session_id, descriptor)
  WHERE section_no IS NULL;

-- Per-section dedup: at most one (session_id, section_no, descriptor) row.
CREATE UNIQUE INDEX uq_oral_descriptor_per_section
  ON oral_exam_descriptor_scores (session_id, section_no, descriptor)
  WHERE section_no IS NOT NULL;

-- NO student SELECT policy: scores are read only through get_oral_exam_report
-- (151), which is ended_at-gated. Direct authenticated reads are denied by
-- default-deny under FORCE RLS. Staff may read own-org for review.
CREATE POLICY "staff_read_oral_scores" ON oral_exam_descriptor_scores
  FOR SELECT USING (
    session_id IN (
      SELECT s.id FROM oral_exam_sessions s
      WHERE s.organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
        AND s.deleted_at IS NULL
        AND (SELECT role FROM users WHERE id = auth.uid()) IN ('instructor', 'admin')
    )
  );

CREATE POLICY "oral_scores_no_update" ON oral_exam_descriptor_scores
  FOR UPDATE USING (false);
CREATE POLICY "oral_scores_no_delete" ON oral_exam_descriptor_scores
  FOR DELETE USING (false);

-- ============================================================
-- elp_usage_events — immutable metering ledger (grader-written only)
--   The billing seam V2 (Stripe + credits) reads from here. Written ONLY by the
--   service-role grader (152) via the postgres-owned definer bypass — students get
--   NO INSERT policy (copying audit_events' authenticated-INSERT would let a student
--   insert negative-quantity rows to zero out their metered usage). BIGINT/NUMERIC
--   serialize as JSON strings — any TS reader must Number()-coerce (code-style §5).
-- ============================================================
CREATE TABLE elp_usage_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id),
  student_id            UUID NOT NULL REFERENCES users(id),
  session_id            UUID NULL REFERENCES oral_exam_sessions(id),
  section_no            SMALLINT NULL CHECK (section_no IS NULL OR section_no BETWEEN 1 AND 5),
  event_type            TEXT NOT NULL CHECK (event_type IN
                          ('stt_seconds', 'tts_chars', 'convai_seconds', 'llm_input_tokens', 'llm_output_tokens')),
  quantity              NUMERIC NOT NULL CHECK (quantity >= 0),
  provider              TEXT NULL,
  cost_estimate_micros  BIGINT NULL CHECK (cost_estimate_micros IS NULL OR cost_estimate_micros >= 0),
  metadata              JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE elp_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE elp_usage_events FORCE ROW LEVEL SECURITY;

CREATE INDEX idx_elp_usage_student ON elp_usage_events (student_id);
CREATE INDEX idx_elp_usage_session ON elp_usage_events (session_id);

-- Student may read own usage (V2 billing UI). NO INSERT/UPDATE/DELETE for anyone
-- on the authenticated surface — the grader writes via the postgres BYPASSRLS definer.
CREATE POLICY "students_own_usage" ON elp_usage_events
  FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "staff_read_usage" ON elp_usage_events
  FOR SELECT USING (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) IN ('instructor', 'admin')
  );

CREATE POLICY "elp_usage_no_update" ON elp_usage_events
  FOR UPDATE USING (false);
CREATE POLICY "elp_usage_no_delete" ON elp_usage_events
  FOR DELETE USING (false);
