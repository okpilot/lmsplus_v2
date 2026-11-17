-- list_exam_sitting_roster: live candidates of a sitting with their entries, codes and attempts. Admin only; STABLE; any sitting status.
-- p_show all | needs_code (an entry without a live code) | not_emailed (a live code with emailed_at NULL) | has_attempts; applied before paging.
-- code is returned only for an unvoided code that is consumed or unexpired (admin-only, org-scoped, same exposure as the admin codes tab).
-- Tokens: sitting_not_found, invalid_input.
CREATE OR REPLACE FUNCTION public.list_exam_sitting_roster(
  p_sitting_id uuid, p_q text DEFAULT NULL, p_limit int DEFAULT 50, p_offset int DEFAULT 0, p_show text DEFAULT 'all'
)
RETURNS TABLE(user_id uuid, full_name text, email text, deactivated boolean, has_attempt boolean,
              entries jsonb, total_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_g record;
  v_s public.exam_sittings;
  v_q text := NULLIF(lower(btrim(COALESCE(p_q, ''))), '');
  v_show text := COALESCE(p_show, 'all');
BEGIN
  SELECT * INTO v_g FROM private.sitting_admin_guard();
  IF p_limit IS NULL OR p_offset IS NULL OR p_limit < 1 OR p_limit > 100 OR p_offset < 0
     OR length(COALESCE(p_q, '')) > 100 OR v_show NOT IN ('all', 'needs_code', 'not_emailed', 'has_attempts') THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  -- No deleted_at filter: cancelled sittings stay readable for admins (security.md §15).
  -- security.md §15 exception (g): cancelled sittings are soft-deleted and stay readable
  SELECT * INTO v_s FROM public.exam_sittings s WHERE s.id = p_sitting_id AND s.organization_id = v_g.org_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sitting_not_found'; END IF;
  RETURN QUERY
  WITH page AS (
    SELECT u.id AS uid, u.full_name AS fname, u.email AS mail, (u.deleted_at IS NOT NULL) AS deact,
           COALESCE(u.full_name, u.email) AS sortkey, count(*) OVER () AS total
      FROM public.exam_sitting_candidates c
      -- security.md §15 exception (f): deactivated candidates are listed with a badge
      JOIN public.users u ON u.id = c.user_id AND u.organization_id = v_g.org_id
     WHERE c.sitting_id = p_sitting_id AND c.organization_id = v_g.org_id AND c.deleted_at IS NULL
       AND (v_q IS NULL OR position(v_q IN lower(COALESCE(u.full_name, ''))) > 0 OR position(v_q IN lower(u.email)) > 0)
       AND CASE v_show
             WHEN 'needs_code' THEN EXISTS (
               SELECT 1 FROM public.exam_sitting_entries e
                WHERE e.sitting_id = p_sitting_id AND e.user_id = u.id AND e.organization_id = v_g.org_id
                  AND e.deleted_at IS NULL
                  AND NOT EXISTS (SELECT 1 FROM public.internal_exam_codes k
                                   WHERE k.sitting_entry_id = e.id AND k.deleted_at IS NULL
                                     AND (k.voided_at IS NULL OR k.consumed_at IS NOT NULL)))
             WHEN 'not_emailed' THEN EXISTS (
               SELECT 1 FROM public.exam_sitting_entries e
                 JOIN public.internal_exam_codes k ON k.sitting_entry_id = e.id AND k.deleted_at IS NULL
                      AND k.voided_at IS NULL AND k.consumed_at IS NULL AND k.expires_at > now() AND k.emailed_at IS NULL
                WHERE e.sitting_id = p_sitting_id AND e.user_id = u.id AND e.organization_id = v_g.org_id
                  AND e.deleted_at IS NULL)
             WHEN 'has_attempts' THEN EXISTS (
               SELECT 1 FROM public.internal_exam_codes k
                 JOIN public.exam_sitting_entries e ON e.id = k.sitting_entry_id
                WHERE e.sitting_id = p_sitting_id AND e.user_id = u.id AND e.organization_id = v_g.org_id
                  AND e.deleted_at IS NULL AND k.deleted_at IS NULL AND k.consumed_at IS NOT NULL)
             ELSE true END
     ORDER BY COALESCE(u.full_name, u.email), u.id
     LIMIT p_limit OFFSET p_offset
  )
  SELECT pg.uid, pg.fname, pg.mail, pg.deact,
         EXISTS (SELECT 1 FROM public.internal_exam_codes k
                   JOIN public.exam_sitting_entries e ON e.id = k.sitting_entry_id
                  WHERE e.sitting_id = p_sitting_id AND e.user_id = pg.uid AND e.organization_id = v_g.org_id
                    AND e.deleted_at IS NULL AND k.deleted_at IS NULL AND k.consumed_at IS NOT NULL),
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'entry_id', x.entry_id, 'subject_id', x.subject_id, 'subject_short', x.short,
                    'subject_name', x.sname, 'course_id', x.course_id, 'course_name', x.course_name,
                    'status', x.status, 'attempt_number', x.attempt_number,
                    'passed', x.passed, 'score', x.score,
                    'code_id', x.code_id,
                    'code', CASE WHEN x.code_voided_at IS NULL AND (x.consumed OR x.code_expires_at > now()) THEN x.code END,
                    'code_expires_at', x.code_expires_at,
                    'code_emailed_at', x.code_emailed_at, 'void_reason', x.void_reason,
                    'session_id', x.session_id, 'session_started_at', x.session_started_at)
                  ORDER BY x.course_name NULLS LAST, x.sort_order, x.short, x.entry_id)
             FROM (
               SELECT e.id AS entry_id, e.subject_id, sj.short, sj.name AS sname, sj.course_id, co.name AS course_name,
                      sj.sort_order,
                      CASE WHEN lc.consumed_at IS NOT NULL AND lc.voided_at IS NOT NULL THEN 'voided_attempt'
                           WHEN lc.consumed_at IS NOT NULL THEN CASE WHEN q.ended_at IS NULL THEN 'running' ELSE 'finished' END
                           WHEN v_s.status = 'closed' THEN 'absent'
                           WHEN lc.id IS NULL THEN 'no_code'
                           WHEN lc.voided_at IS NOT NULL THEN 'voided'
                           WHEN lc.expires_at <= now() THEN 'expired'
                           WHEN v_s.status = 'scheduled' THEN 'waiting'
                           ELSE 'ready' END AS status,
                      CASE WHEN lc.consumed_at IS NOT NULL AND lc.voided_at IS NOT NULL THEN NULL
                           WHEN lc.consumed_at IS NOT NULL THEN
                             (SELECT count(*)::int FROM public.quiz_sessions q2
                               WHERE q2.student_id = e.user_id AND q2.subject_id = e.subject_id AND q2.organization_id = v_g.org_id
                                 AND q2.mode = 'internal_exam' AND q2.deleted_at IS NULL AND q2.started_at <= q.started_at
                                 AND NOT EXISTS (SELECT 1 FROM public.internal_exam_codes c3
                                                  WHERE c3.consumed_session_id = q2.id AND c3.voided_at IS NOT NULL
                                                    AND c3.deleted_at IS NULL))
                           ELSE
                             (SELECT count(*)::int FROM public.quiz_sessions q2
                               WHERE q2.student_id = e.user_id AND q2.subject_id = e.subject_id AND q2.organization_id = v_g.org_id
                                 AND q2.mode = 'internal_exam' AND q2.deleted_at IS NULL AND q2.ended_at IS NOT NULL
                                 AND NOT EXISTS (SELECT 1 FROM public.internal_exam_codes c3
                                                  WHERE c3.consumed_session_id = q2.id AND c3.voided_at IS NOT NULL
                                                    AND c3.deleted_at IS NULL)) + 1
                           END AS attempt_number,
                      q.passed AS passed, q.score_percentage AS score,
                      lc.id AS code_id, lc.code AS code, lc.expires_at AS code_expires_at,
                      lc.emailed_at AS code_emailed_at, lc.void_reason AS void_reason, lc.voided_at AS code_voided_at,
                      (lc.consumed_at IS NOT NULL) AS consumed,
                      q.id AS session_id, q.started_at AS session_started_at
                 FROM public.exam_sitting_entries e
                 -- security.md §15 exception (d): easa_subjects is the FK parent of this live entry
                 JOIN public.easa_subjects sj ON sj.id = e.subject_id
                 LEFT JOIN public.courses co ON co.id = sj.course_id
                 LEFT JOIN LATERAL (
                   SELECT c.* FROM public.internal_exam_codes c
                    WHERE c.sitting_entry_id = e.id AND c.deleted_at IS NULL
                    ORDER BY (c.voided_at IS NULL OR c.consumed_at IS NOT NULL) DESC, c.issued_at DESC, c.id
                    LIMIT 1) lc ON true
                 LEFT JOIN public.quiz_sessions q ON q.id = lc.consumed_session_id AND q.deleted_at IS NULL
                WHERE e.sitting_id = p_sitting_id AND e.organization_id = v_g.org_id
                  AND e.user_id = pg.uid AND e.deleted_at IS NULL
             ) x
         ), '[]'::jsonb),
         pg.total
    FROM page pg
   ORDER BY pg.sortkey, pg.uid;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.list_exam_sitting_roster(uuid, text, int, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_exam_sitting_roster(uuid, text, int, int, text) TO authenticated;
