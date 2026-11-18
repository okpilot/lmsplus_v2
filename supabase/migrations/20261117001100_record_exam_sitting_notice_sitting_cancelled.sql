-- record that a notice email was sent. kind changed | cancelled | sitting_cancelled (code ids) | entry_auto_removed (entry ids).
CREATE OR REPLACE FUNCTION public.record_exam_sitting_notice(
  p_sitting_id uuid, p_kind text, p_code_ids uuid[] DEFAULT '{}', p_entry_ids uuid[] DEFAULT '{}'
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_g record;
  v_codes uuid[] := COALESCE(ARRAY(SELECT DISTINCT x FROM unnest(p_code_ids) x), '{}');
  v_entries uuid[] := COALESCE(ARRAY(SELECT DISTINCT x FROM unnest(p_entry_ids) x), '{}');
  v_n int;
BEGIN
  SELECT * INTO v_g FROM private.sitting_admin_guard();
  IF p_kind IS NULL OR p_kind NOT IN ('changed', 'cancelled', 'sitting_cancelled', 'entry_auto_removed')
     OR cardinality(v_codes) + cardinality(v_entries) = 0
     OR cardinality(v_codes) > 2000 OR cardinality(v_entries) > 2000
     OR (p_kind = 'entry_auto_removed' AND cardinality(v_codes) > 0)
     OR (p_kind <> 'entry_auto_removed' AND cardinality(v_entries) > 0) THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  -- security.md §15 exception (g): cancelled sittings are soft-deleted and stay readable
  PERFORM 1 FROM public.exam_sittings s
   WHERE s.id = p_sitting_id AND s.organization_id = v_g.org_id
     AND (s.deleted_at IS NULL OR p_kind IN ('cancelled', 'sitting_cancelled', 'entry_auto_removed'));
  IF NOT FOUND THEN RAISE EXCEPTION 'sitting_not_found'; END IF;

  IF p_kind = 'entry_auto_removed' THEN
    SELECT count(*) INTO v_n FROM public.audit_events a
     WHERE a.organization_id = v_g.org_id AND a.resource_id = p_sitting_id
       AND a.event_type = 'exam_sitting.entry_auto_removed' AND (a.metadata ->> 'entry_id')::uuid = ANY(v_entries);
    IF v_n <> cardinality(v_entries) THEN RAISE EXCEPTION 'invalid_input'; END IF;
    INSERT INTO public.audit_events
      (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
    SELECT v_g.org_id, v_g.admin_id, v_g.admin_role, 'exam_sitting.notice_emailed', 'exam_sitting', p_sitting_id,
           jsonb_build_object('kind', p_kind, 'entry_id', a.metadata ->> 'entry_id', 'student_id', a.metadata ->> 'user_id')
      FROM public.audit_events a
     WHERE a.organization_id = v_g.org_id AND a.resource_id = p_sitting_id
       AND a.event_type = 'exam_sitting.entry_auto_removed' AND (a.metadata ->> 'entry_id')::uuid = ANY(v_entries);
    RETURN v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.internal_exam_codes c
    JOIN public.exam_sitting_entries e ON e.id = c.sitting_entry_id
   WHERE c.id = ANY(v_codes) AND e.sitting_id = p_sitting_id AND c.organization_id = v_g.org_id
     AND c.deleted_at IS NULL AND e.deleted_at IS NULL
     AND CASE p_kind WHEN 'changed' THEN c.voided_at IS NULL
                     WHEN 'sitting_cancelled' THEN c.void_reason = 'sitting_cancelled'
                     ELSE EXISTS (SELECT 1 FROM public.exam_sittings s
                                   WHERE s.id = p_sitting_id AND s.deleted_at IS NOT NULL) END;
  IF v_n <> cardinality(v_codes) THEN RAISE EXCEPTION 'invalid_input'; END IF;
  INSERT INTO public.audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  SELECT v_g.org_id, v_g.admin_id, v_g.admin_role, 'exam_sitting.notice_emailed', 'exam_sitting', p_sitting_id,
         jsonb_build_object('kind', p_kind, 'code_id', c.id, 'student_id', c.student_id)
    FROM public.internal_exam_codes c WHERE c.id = ANY(v_codes) AND c.deleted_at IS NULL;
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_exam_sitting_notice(uuid, text, uuid[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_exam_sitting_notice(uuid, text, uuid[], uuid[]) TO authenticated;
