-- list RPC gains sitting fields (NULL for legacy codes); a not-yet-started sitting's code stays listed.
DROP FUNCTION public.list_my_active_internal_exam_codes();
CREATE FUNCTION public.list_my_active_internal_exam_codes()
RETURNS TABLE (
  id uuid,
  subject_id uuid,
  subject_name text,
  subject_short text,
  expires_at timestamptz,
  issued_at timestamptz,
  sitting_id uuid,
  sitting_scheduled_at timestamptz,
  sitting_mode text,
  sitting_status text,
  permitted_materials text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  SELECT u.organization_id INTO v_org FROM users u WHERE u.id = v_user_id AND u.deleted_at IS NULL;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;
  PERFORM private.close_expired_sittings(v_org);

  RETURN QUERY
  SELECT iec.id, iec.subject_id, s.name, s.short, iec.expires_at, iec.issued_at,
         es.id, es.scheduled_at, es.mode, es.status, es.permitted_materials
  FROM public.internal_exam_codes iec
  LEFT JOIN public.easa_subjects s ON s.id = iec.subject_id
  LEFT JOIN public.exam_sitting_entries e ON e.id = iec.sitting_entry_id AND e.deleted_at IS NULL
  LEFT JOIN public.exam_sittings es ON es.id = e.sitting_id AND es.deleted_at IS NULL
  WHERE iec.student_id = v_user_id
    AND iec.consumed_at IS NULL
    AND iec.voided_at IS NULL
    AND iec.deleted_at IS NULL
    AND (iec.expires_at > now() OR es.status = 'scheduled')
    AND (es.id IS NULL OR NOT private.sitting_day_ended(es.scheduled_at))
  ORDER BY COALESCE(es.scheduled_at, iec.expires_at) ASC
  LIMIT 100;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.list_my_active_internal_exam_codes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_active_internal_exam_codes() TO authenticated;
