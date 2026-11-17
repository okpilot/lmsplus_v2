-- get_exam_sitting_subject_eligibility: one row per subject with a live enabled exam config, aggregated over the picked people.
-- p_user_ids NULL = every live candidate (<=500, else invalid_input; none = empty result); explicit: no NULL element, 1..100 distinct,
-- non-candidates dropped, none left = invalid_input. Detail columns are non-NULL only for exactly one person. STABLE, no audit.
-- Tokens: sitting_not_found, sitting_closed, sitting_day_ended, invalid_input.
CREATE OR REPLACE FUNCTION public.get_exam_sitting_subject_eligibility(p_sitting_id uuid, p_user_ids uuid[] DEFAULT NULL)
RETURNS TABLE(subject_id uuid, subject_name text, subject_short text, course_id uuid, course_name text,
              people int, eligible int, entered_here int, passed int, attempt_running int,
              entered_elsewhere int, not_enrolled int, deactivated int,
              state text, attempt_count int, passed_at timestamptz, passed_score numeric,
              elsewhere_sitting_id uuid, elsewhere_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_g record;
  v_s public.exam_sittings;
  v_users uuid[];
  v_subjects uuid[];
  v_single boolean;
BEGIN
  SELECT * INTO v_g FROM private.sitting_admin_guard();
  SELECT * INTO v_s FROM public.exam_sittings s
   WHERE s.id = p_sitting_id AND s.organization_id = v_g.org_id AND s.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'sitting_not_found'; END IF;
  IF v_s.status = 'closed' THEN RAISE EXCEPTION 'sitting_closed'; END IF;
  IF private.sitting_day_ended(v_s.scheduled_at) THEN RAISE EXCEPTION 'sitting_day_ended'; END IF;
  v_users := private.sitting_resolve_user_ids(v_g.org_id, p_sitting_id, p_user_ids, 100);
  v_single := cardinality(v_users) = 1;
  -- courses is global reference data and is never deleted: no deleted_at filter.
  v_subjects := COALESCE(ARRAY(
    SELECT sj.id FROM public.easa_subjects sj
      LEFT JOIN public.courses co ON co.id = sj.course_id
     WHERE sj.deleted_at IS NULL
       AND EXISTS (SELECT 1 FROM public.exam_configs ec WHERE ec.organization_id = v_g.org_id
                    AND ec.subject_id = sj.id AND ec.enabled = true AND ec.deleted_at IS NULL)
     ORDER BY co.name NULLS LAST, sj.sort_order, sj.short, sj.id
     LIMIT 200), '{}');

  RETURN QUERY
  WITH st AS MATERIALIZED (
    SELECT * FROM private.sitting_pair_state(v_g.org_id, p_sitting_id, v_users, v_subjects)
  )
  SELECT sj.id, sj.name, sj.short, sj.course_id, co.name,
         count(*)::int,
         (count(*) FILTER (WHERE x.state = 'eligible'))::int,
         (count(*) FILTER (WHERE x.state = 'entered_here'))::int,
         (count(*) FILTER (WHERE x.state = 'passed'))::int,
         (count(*) FILTER (WHERE x.state = 'attempt_running'))::int,
         (count(*) FILTER (WHERE x.state = 'entered_elsewhere'))::int,
         (count(*) FILTER (WHERE x.state = 'not_enrolled'))::int,
         (count(*) FILTER (WHERE x.state = 'deactivated'))::int,
         CASE WHEN v_single THEN min(x.state) END,
         CASE WHEN v_single THEN max(x.attempt_count) END,
         CASE WHEN v_single THEN max(x.passed_at) END,
         CASE WHEN v_single THEN max(x.passed_score) END,
         CASE WHEN v_single THEN (array_agg(x.elsewhere_sitting_id))[1] END,
         CASE WHEN v_single THEN max(x.elsewhere_at) END
    FROM st x
    JOIN public.easa_subjects sj ON sj.id = x.subject_id AND sj.deleted_at IS NULL
    LEFT JOIN public.courses co ON co.id = sj.course_id
   GROUP BY sj.id, sj.name, sj.short, sj.course_id, co.name, sj.sort_order
   ORDER BY co.name NULLS LAST, sj.sort_order, sj.short, sj.id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_exam_sitting_subject_eligibility(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_exam_sitting_subject_eligibility(uuid, uuid[]) TO authenticated;
