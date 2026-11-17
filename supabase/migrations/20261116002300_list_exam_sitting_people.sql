-- Add people popup read. People already in the sitting are not listed. STABLE, scheduled/open sittings only.
CREATE OR REPLACE FUNCTION public.list_exam_sitting_people(
  p_sitting_id uuid, p_q text DEFAULT NULL, p_group_id uuid DEFAULT NULL, p_course_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL, p_limit int DEFAULT 50, p_offset int DEFAULT 0
)
RETURNS TABLE(user_id uuid, full_name text, email text, deactivated boolean,
              groups text, courses text, total_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_g record;
  v_s public.exam_sittings;
  v_q text := NULLIF(lower(btrim(COALESCE(p_q, ''))), '');
BEGIN
  SELECT * INTO v_g FROM private.sitting_admin_guard();
  IF p_limit < 1 OR p_limit > 200 OR p_offset < 0 OR length(COALESCE(p_q, '')) > 100 OR (p_status IS NOT NULL AND p_status NOT IN ('active', 'inactive')) THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  SELECT * INTO v_s FROM public.exam_sittings s
   WHERE s.id = p_sitting_id AND s.organization_id = v_g.org_id AND s.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'sitting_not_found'; END IF;
  IF v_s.status = 'closed' THEN RAISE EXCEPTION 'sitting_closed'; END IF;
  IF private.sitting_day_ended(v_s.scheduled_at) THEN RAISE EXCEPTION 'sitting_day_ended'; END IF;
  RETURN QUERY
  SELECT u.id, u.full_name, u.email, (u.deleted_at IS NOT NULL),
         COALESCE((SELECT string_agg(g.name, ', ' ORDER BY g.name) FROM public.student_group_members m
                     JOIN public.student_groups g ON g.id = m.group_id AND g.deleted_at IS NULL
                    WHERE m.user_id = u.id AND m.deleted_at IS NULL), ''),
         COALESCE((SELECT string_agg(co.name, ', ' ORDER BY co.name) FROM public.course_enrolments ce
                     JOIN public.courses co ON co.id = ce.course_id
                    WHERE ce.user_id = u.id AND ce.deleted_at IS NULL), ''),
         count(*) OVER ()
    FROM public.users u
   WHERE u.organization_id = v_g.org_id AND u.role = 'student'
     AND NOT EXISTS (SELECT 1 FROM public.exam_sitting_candidates c WHERE c.sitting_id = p_sitting_id
                      AND c.user_id = u.id AND c.deleted_at IS NULL)
     AND (p_status IS NULL OR (p_status = 'active' AND u.deleted_at IS NULL) OR (p_status = 'inactive' AND u.deleted_at IS NOT NULL))
     AND (v_q IS NULL OR position(v_q IN lower(COALESCE(u.full_name, ''))) > 0 OR position(v_q IN lower(u.email)) > 0)
     AND (p_group_id IS NULL OR EXISTS (SELECT 1 FROM public.student_group_members m
            WHERE m.user_id = u.id AND m.group_id = p_group_id AND m.deleted_at IS NULL))
     AND (p_course_id IS NULL OR EXISTS (SELECT 1 FROM public.course_enrolments ce
            WHERE ce.user_id = u.id AND ce.course_id = p_course_id AND ce.deleted_at IS NULL))
   ORDER BY COALESCE(u.full_name, u.email), u.id
   LIMIT p_limit OFFSET p_offset;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.list_exam_sitting_people(uuid, text, uuid, uuid, text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_exam_sitting_people(uuid, text, uuid, uuid, text, int, int) TO authenticated;
