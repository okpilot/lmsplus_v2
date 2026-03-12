-- Fix: convert analytics RPCs from LANGUAGE sql to LANGUAGE plpgsql
-- Adds explicit auth.uid() NULL check with RAISE EXCEPTION per docs/security.md §7

CREATE OR REPLACE FUNCTION public.get_daily_activity(
  p_student_id UUID,
  p_days INT DEFAULT 30
)
RETURNS TABLE (
  day DATE,
  total BIGINT,
  correct BIGINT,
  incorrect BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    d.day::DATE,
    COALESCE(COUNT(sr.id), 0) AS total,
    COALESCE(COUNT(sr.id) FILTER (WHERE sr.is_correct = TRUE), 0) AS correct,
    COALESCE(COUNT(sr.id) FILTER (WHERE sr.is_correct = FALSE), 0) AS incorrect
  FROM generate_series(
    (CURRENT_DATE - (p_days - 1)),
    CURRENT_DATE,
    '1 day'::INTERVAL
  ) AS d(day)
  LEFT JOIN student_responses sr
    ON sr.student_id = p_student_id
    AND sr.created_at::DATE = d.day::DATE
  WHERE auth.uid() = p_student_id
  GROUP BY d.day
  ORDER BY d.day;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_subject_scores(
  p_student_id UUID,
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  subject_id UUID,
  subject_name TEXT,
  subject_short TEXT,
  avg_score NUMERIC,
  session_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    es.id AS subject_id,
    es.name AS subject_name,
    es.short AS subject_short,
    ROUND(AVG(qs.score_percentage), 1) AS avg_score,
    COUNT(qs.id) AS session_count
  FROM quiz_sessions qs
  JOIN easa_subjects es ON es.id = qs.subject_id
  WHERE qs.student_id = p_student_id
    AND qs.ended_at IS NOT NULL
    AND qs.score_percentage IS NOT NULL
    AND auth.uid() = p_student_id
  GROUP BY es.id, es.name, es.short
  ORDER BY MAX(qs.started_at) DESC
  LIMIT p_limit;
END;
$$;
