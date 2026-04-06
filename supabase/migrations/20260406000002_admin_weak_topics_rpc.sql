-- Admin Weak Topics RPC
-- Returns the N weakest topics by average correct rate

CREATE OR REPLACE FUNCTION public.get_admin_weak_topics(
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  topic_id UUID,
  topic_name TEXT,
  subject_name TEXT,
  subject_short TEXT,
  avg_score NUMERIC,
  student_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_org_id UUID;
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

  -- Clamp limit
  IF p_limit IS NULL OR p_limit < 1 THEN
    p_limit := 10;
  ELSIF p_limit > 100 THEN
    p_limit := 100;
  END IF;

  RETURN QUERY
  SELECT
    et.id AS topic_id,
    et.name AS topic_name,
    es.name AS subject_name,
    es.short AS subject_short,
    ROUND(AVG(sr.is_correct::int) * 100) AS avg_score,
    COUNT(DISTINCT sr.student_id) AS student_count
  FROM student_responses sr  -- immutable table, no deleted_at column
  JOIN questions q ON q.id = sr.question_id
  JOIN easa_topics et ON et.id = q.topic_id
  JOIN easa_subjects es ON es.id = q.subject_id
  WHERE q.organization_id = v_org_id
    AND q.status = 'active'
    AND q.deleted_at IS NULL
  GROUP BY et.id, et.name, es.name, es.short
  ORDER BY avg_score ASC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_weak_topics(INT) TO authenticated;
