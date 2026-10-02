-- get_daily_subjects(p_days) — (day, subject_id) pairs the calling student practised, for the
-- dashboard day tooltip. Day bucketing (created_at::date, CURRENT_DATE window) matches
-- get_daily_activity. Active-user gate per docs/security.md §11c (mig 20260824000300 form).
-- Every column is qualified: the OUT params `day` / `subject_id` shadow bare names (42702).
CREATE FUNCTION public.get_daily_subjects(p_days int)
RETURNS TABLE (day date, subject_id uuid)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  PERFORM 1 FROM users u WHERE u.id = auth.uid() AND u.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found or inactive'; END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 365 THEN
    RAISE EXCEPTION 'p_days must be between 1 and 365';
  END IF;
  RETURN QUERY
    SELECT DISTINCT sr.created_at::date, q.subject_id
    FROM student_responses sr
    JOIN questions q ON q.id = sr.question_id
    WHERE sr.student_id = auth.uid()
      AND sr.created_at::date >= CURRENT_DATE - (p_days - 1)
    ORDER BY 1, 2;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_subjects(int) TO authenticated;

COMMENT ON FUNCTION public.get_daily_subjects(int) IS
  'Distinct (day, subject_id) pairs the calling student answered in the last p_days days (1-365). SECURITY INVOKER; explicit sr.student_id = auth.uid() per security.md §11 (student_responses has 2 permissive SELECT policies). Active-user gate raises ''user not found or inactive''. The questions JOIN is org + non-deleted via RLS, so a soft-deleted question drops out.';
