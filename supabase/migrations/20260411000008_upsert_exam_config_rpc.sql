-- upsert_exam_config: atomically upserts an exam configuration and replaces
-- its topic/subtopic question distribution in a single transaction.
--
-- Parameters:
--   p_subject_id:         EASA subject UUID
--   p_enabled:            whether exam mode is active for this subject
--   p_total_questions:    number of questions in the exam
--   p_time_limit_seconds: exam duration in seconds
--   p_pass_mark:          pass percentage (1-100)
--   p_distributions:      JSONB array of {topic_id, subtopic_id, question_count}
--
-- Returns: UUID of the upserted exam_configs row
--
-- Security: SECURITY DEFINER with admin role check + org scoping

CREATE OR REPLACE FUNCTION upsert_exam_config(
  p_subject_id         uuid,
  p_enabled            boolean,
  p_total_questions    int,
  p_time_limit_seconds int,
  p_pass_mark          int,
  p_distributions      jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_org_id    uuid;
  v_role      text;
  v_config_id uuid;
  v_dist      jsonb;
BEGIN
  -- Auth + admin check
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT organization_id, role INTO v_org_id, v_role
  FROM users
  WHERE id = v_user_id AND deleted_at IS NULL;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;

  IF v_role != 'admin' THEN
    RAISE EXCEPTION 'admin access required';
  END IF;

  -- Upsert exam_configs: lookup then insert or update
  SELECT id INTO v_config_id
  FROM exam_configs
  WHERE organization_id = v_org_id
    AND subject_id = p_subject_id
    AND deleted_at IS NULL;

  IF v_config_id IS NOT NULL THEN
    -- Update existing
    UPDATE exam_configs SET
      enabled            = p_enabled,
      total_questions    = p_total_questions,
      time_limit_seconds = p_time_limit_seconds,
      pass_mark          = p_pass_mark,
      updated_at         = now()
    WHERE id = v_config_id;
  ELSE
    -- Insert new
    INSERT INTO exam_configs (
      organization_id, subject_id, enabled,
      total_questions, time_limit_seconds, pass_mark
    ) VALUES (
      v_org_id, p_subject_id, p_enabled,
      p_total_questions, p_time_limit_seconds, p_pass_mark
    ) RETURNING id INTO v_config_id;
  END IF;

  -- Replace distributions atomically
  DELETE FROM exam_config_distributions
  WHERE exam_config_id = v_config_id;

  FOR v_dist IN SELECT * FROM jsonb_array_elements(p_distributions)
  LOOP
    INSERT INTO exam_config_distributions (
      exam_config_id, topic_id, subtopic_id, question_count
    ) VALUES (
      v_config_id,
      (v_dist->>'topic_id')::uuid,
      NULLIF(v_dist->>'subtopic_id', '')::uuid,
      (v_dist->>'question_count')::int
    );
  END LOOP;

  RETURN v_config_id;
END;
$$;
