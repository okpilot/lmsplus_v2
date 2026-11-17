-- get_exam_sitting_issue_preview: what issue_sitting_exam_codes would do, from the same plan. STABLE; no prune, no write.
-- p_user_ids NULL = all live candidates (<=500); explicit: no NULL element, 1..500 distinct, non-candidates dropped.
-- row_kind count (per COALESCE(reason, action)) | students_to_issue | detail (skipped, not already_issued, <=200).
-- Tokens: sitting_not_found, sitting_closed, sitting_day_ended, invalid_input.
CREATE OR REPLACE FUNCTION public.get_exam_sitting_issue_preview(p_sitting_id uuid, p_user_ids uuid[] DEFAULT NULL)
RETURNS TABLE(row_kind text, reason text, n int, entry_id uuid, student_name text, subject_short text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_g record;
  v_s public.exam_sittings;
  v_ids uuid[];
BEGIN
  SELECT * INTO v_g FROM private.sitting_admin_guard();
  IF p_user_ids IS NOT NULL AND (array_position(p_user_ids, NULL) IS NOT NULL OR cardinality(p_user_ids) = 0
       OR (SELECT count(DISTINCT x) FROM unnest(p_user_ids) x) > 500) THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  SELECT * INTO v_s FROM public.exam_sittings s
   WHERE s.id = p_sitting_id AND s.organization_id = v_g.org_id AND s.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'sitting_not_found'; END IF;
  IF v_s.status = 'closed' THEN RAISE EXCEPTION 'sitting_closed'; END IF;
  IF private.sitting_day_ended(v_s.scheduled_at) THEN RAISE EXCEPTION 'sitting_day_ended'; END IF;
  v_ids := private.sitting_resolve_user_ids(v_g.org_id, p_sitting_id, p_user_ids, 500);
  RETURN QUERY
  WITH plan AS MATERIALIZED (SELECT * FROM private.sitting_issue_plan(v_g.org_id, p_sitting_id, v_ids, NULL))
  SELECT 'count'::text, COALESCE(p.reason, p.action), count(*)::int, NULL::uuid, NULL::text, NULL::text
    FROM plan p GROUP BY COALESCE(p.reason, p.action)
  UNION ALL
  SELECT 'students_to_issue'::text, NULL::text, count(DISTINCT p.user_id)::int, NULL::uuid, NULL::text, NULL::text
    FROM plan p WHERE p.action <> 'skip'
  UNION ALL
  (SELECT 'detail'::text, p.reason, 1, p.entry_id, COALESCE(u.full_name, u.email), sj.short
     FROM plan p
     -- security.md §15 exception (f): deactivated students are shown by name
     JOIN public.users u ON u.id = p.user_id AND u.organization_id = v_g.org_id
     LEFT JOIN public.easa_subjects sj ON sj.id = p.subject_id AND sj.deleted_at IS NULL
    WHERE p.action = 'skip' AND p.reason <> 'already_issued'
    ORDER BY p.reason COLLATE "C", COALESCE(u.full_name, u.email) COLLATE "C", p.entry_id
    LIMIT 200);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_exam_sitting_issue_preview(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_exam_sitting_issue_preview(uuid, uuid[]) TO authenticated;
