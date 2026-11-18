-- list sittings by scope: upcoming (scheduled), open, past (closed), cancelled. Lazy-closes expired sittings first.
CREATE OR REPLACE FUNCTION public.list_exam_sittings(p_scope text, p_limit int DEFAULT 50, p_offset int DEFAULT 0)
RETURNS TABLE(id uuid, scheduled_at timestamptz, mode text, status text, invigilator_id uuid,
              invigilator_name text, invigilator_active boolean, permitted_materials text,
              started_at timestamptz, closed_at timestamptz, candidates int, entries int,
              entries_without_code int, entries_finished int, entries_absent int,
              ended_automatically boolean, total_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_g record;
BEGIN
  SELECT * INTO v_g FROM private.sitting_admin_guard();
  IF p_scope IS NULL OR p_limit IS NULL OR p_offset IS NULL OR p_scope NOT IN ('upcoming', 'open', 'past', 'cancelled') OR p_limit < 1 OR p_limit > 200 OR p_offset < 0 THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  PERFORM private.close_expired_sittings(v_g.org_id);
  RETURN QUERY
  SELECT s.id, s.scheduled_at, s.mode, s.status, s.invigilator_id,
         COALESCE(iu.full_name, iu.email, 'Unknown'),
         (iu.id IS NOT NULL AND iu.deleted_at IS NULL AND iu.role IN ('admin', 'instructor')),
         s.permitted_materials, s.started_at, s.closed_at,
         (SELECT count(*)::int FROM public.exam_sitting_candidates c WHERE c.sitting_id = s.id AND c.deleted_at IS NULL),
         (SELECT count(*)::int FROM public.exam_sitting_entries e WHERE e.sitting_id = s.id AND e.deleted_at IS NULL),
         (SELECT count(*)::int FROM public.exam_sitting_entries e WHERE e.sitting_id = s.id AND e.deleted_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM public.internal_exam_codes c WHERE c.sitting_entry_id = e.id
                             AND c.deleted_at IS NULL AND (c.voided_at IS NULL OR c.consumed_at IS NOT NULL))),
         (SELECT count(*)::int FROM public.exam_sitting_entries e WHERE e.sitting_id = s.id AND e.deleted_at IS NULL
            AND EXISTS (SELECT 1 FROM public.internal_exam_codes c
                          JOIN public.quiz_sessions q ON q.id = c.consumed_session_id
                         WHERE c.sitting_entry_id = e.id AND c.consumed_at IS NOT NULL AND q.ended_at IS NOT NULL
                           AND q.deleted_at IS NULL AND c.deleted_at IS NULL)),
         (SELECT count(*)::int FROM public.exam_sitting_entries e WHERE s.status = 'closed'
            AND e.sitting_id = s.id AND e.deleted_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM public.internal_exam_codes c
                             WHERE c.sitting_entry_id = e.id AND c.consumed_at IS NOT NULL
                              AND c.deleted_at IS NULL)),
         s.ended_automatically,
         count(*) OVER ()
    -- security.md §15 exception (g): cancelled sittings are soft-deleted and stay readable
    FROM public.exam_sittings s
    -- security.md §15 exception (f)
    LEFT JOIN public.users iu ON iu.id = s.invigilator_id
   WHERE s.organization_id = v_g.org_id
     AND s.status = CASE p_scope WHEN 'upcoming' THEN 'scheduled' WHEN 'past' THEN 'closed' ELSE p_scope END
   ORDER BY CASE WHEN p_scope IN ('upcoming', 'open') THEN s.scheduled_at END ASC, s.scheduled_at DESC, s.id
   LIMIT p_limit OFFSET p_offset;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.list_exam_sittings(text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_exam_sittings(text, int, int) TO authenticated;
