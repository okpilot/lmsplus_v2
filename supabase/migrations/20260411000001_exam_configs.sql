-- exam_configs: per-subject exam configuration (one per org+subject)
-- exam_config_distributions: question distribution per topic/subtopic

-- ============================================================
-- exam_configs
-- ============================================================
CREATE TABLE exam_configs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  subject_id        UUID NOT NULL REFERENCES easa_subjects(id),
  enabled           BOOLEAN NOT NULL DEFAULT false,
  total_questions   INT NOT NULL CHECK (total_questions > 0),
  time_limit_seconds INT NOT NULL CHECK (time_limit_seconds > 0),
  pass_mark         INT NOT NULL CHECK (pass_mark > 0 AND pass_mark <= 100),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ NULL,
  UNIQUE (organization_id, subject_id)
);

ALTER TABLE exam_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_configs FORCE ROW LEVEL SECURITY;

-- ============================================================
-- exam_config_distributions
-- ============================================================
CREATE TABLE exam_config_distributions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_config_id    UUID NOT NULL REFERENCES exam_configs(id) ON DELETE CASCADE,
  topic_id          UUID NOT NULL REFERENCES easa_topics(id),
  subtopic_id       UUID REFERENCES easa_subtopics(id) NULL,
  question_count    INT NOT NULL CHECK (question_count > 0),
  UNIQUE (exam_config_id, topic_id, subtopic_id)
);

ALTER TABLE exam_config_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_config_distributions FORCE ROW LEVEL SECURITY;

-- ============================================================
-- RLS: admin-only access (students cannot read exam distributions)
-- Uses existing is_admin() function from migration 039
-- ============================================================

-- exam_configs: admin SELECT, INSERT, UPDATE, DELETE
CREATE POLICY admin_select_exam_configs ON exam_configs
  FOR SELECT TO authenticated
  USING (public.is_admin() AND organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY admin_insert_exam_configs ON exam_configs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() AND organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY admin_update_exam_configs ON exam_configs
  FOR UPDATE TO authenticated
  USING (public.is_admin() AND organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()))
  WITH CHECK (public.is_admin() AND organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY admin_delete_exam_configs ON exam_configs
  FOR DELETE TO authenticated
  USING (public.is_admin() AND organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

-- exam_config_distributions: admin SELECT, INSERT, DELETE
-- (distributions are replaced on save, not updated individually)
CREATE POLICY admin_select_exam_distributions ON exam_config_distributions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM exam_configs ec
      WHERE ec.id = exam_config_distributions.exam_config_id
        AND ec.organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
        AND public.is_admin()
    )
  );

CREATE POLICY admin_insert_exam_distributions ON exam_config_distributions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM exam_configs ec
      WHERE ec.id = exam_config_distributions.exam_config_id
        AND ec.organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
        AND public.is_admin()
    )
  );

CREATE POLICY admin_delete_exam_distributions ON exam_config_distributions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM exam_configs ec
      WHERE ec.id = exam_config_distributions.exam_config_id
        AND ec.organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
        AND public.is_admin()
    )
  );

-- Students need read-only access to exam_configs (NOT distributions)
-- so the quiz setup page can show exam parameters for enabled subjects
CREATE POLICY student_select_exam_configs ON exam_configs
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    AND enabled = true
    AND deleted_at IS NULL
  );

-- Index for common query patterns
CREATE INDEX idx_exam_configs_org_subject ON exam_configs(organization_id, subject_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_exam_distributions_config ON exam_config_distributions(exam_config_id);
