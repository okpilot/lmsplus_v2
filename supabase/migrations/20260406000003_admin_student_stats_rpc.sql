-- Admin Student Stats RPC
-- Returns per-student session count, avg score, and mastery

CREATE OR REPLACE FUNCTION public.get_admin_student_stats()
RETURNS TABLE (
  user_id UUID,
  session_count BIGINT,
  avg_score NUMERIC,
  mastery NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_org_id UUID;
  v_total_questions BIGINT;
BEGIN
  -- Auth + admin check
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Resolve caller's org
  SELECT organization_id INTO v_org_id
  FROM users WHERE id = v_uid AND deleted_at IS NULL;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  -- Overall mastery: total distinct correct active questions / total active questions in org.
  -- Not per-subject — see lib/queries/dashboard.ts for the per-subject student dashboard view.
  SELECT COUNT(DISTINCT id) INTO v_total_questions
  FROM questions
  WHERE organization_id = v_org_id AND status = 'active' AND deleted_at IS NULL;

  RETURN QUERY
  WITH session_stats AS (
    SELECT
      qs.student_id,
      COUNT(*) AS sess_count,
      ROUND(AVG(qs.score_percentage)) AS avg_sc
    FROM quiz_sessions qs
    WHERE qs.organization_id = v_org_id
      AND qs.ended_at IS NOT NULL
      AND qs.deleted_at IS NULL
    GROUP BY qs.student_id
  ),
  mastery_stats AS (
    SELECT
      sr.student_id,
      COUNT(DISTINCT sr.question_id) AS correct_count
    FROM student_responses sr
    JOIN questions q ON q.id = sr.question_id
    WHERE q.organization_id = v_org_id
      AND q.status = 'active'
      AND q.deleted_at IS NULL
      AND sr.is_correct = true
    GROUP BY sr.student_id
  )
  SELECT
    u.id AS user_id,
    COALESCE(ss.sess_count, 0) AS session_count,
    ss.avg_sc AS avg_score,
    CASE WHEN v_total_questions > 0 THEN
      ROUND(COALESCE(ms.correct_count, 0)::numeric / v_total_questions * 100)
    ELSE 0
    END AS mastery
  FROM users u
  LEFT JOIN session_stats ss ON ss.student_id = u.id
  LEFT JOIN mastery_stats ms ON ms.student_id = u.id
  WHERE u.organization_id = v_org_id
    AND u.role = 'student'
    AND u.deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_student_stats() TO authenticated;
