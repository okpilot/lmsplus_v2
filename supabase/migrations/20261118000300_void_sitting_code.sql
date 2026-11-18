-- void_sitting_code: voids ONE unused code of an editable sitting. Refuses consumed (code_in_use), voided and foreign codes.
CREATE OR REPLACE FUNCTION public.void_sitting_code(p_sitting_id uuid, p_code_id uuid, p_reason text)
RETURNS TABLE(code_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_g record;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_entry uuid;
  v_consumed timestamptz;
  v_voided timestamptz;
BEGIN
  SELECT * INTO v_g FROM private.sitting_admin_guard();
  IF char_length(v_reason) < 1 OR char_length(v_reason) > 500 THEN RAISE EXCEPTION 'invalid_input'; END IF;
  PERFORM private.sitting_lock(v_g.org_id, p_sitting_id, true);

  SELECT c.consumed_at, c.voided_at, e.id INTO v_consumed, v_voided, v_entry
    FROM public.internal_exam_codes c
    JOIN public.exam_sitting_entries e ON e.id = c.sitting_entry_id
   WHERE c.id = p_code_id AND e.sitting_id = p_sitting_id
     AND c.organization_id = v_g.org_id AND e.organization_id = v_g.org_id
     AND c.deleted_at IS NULL AND e.deleted_at IS NULL
     FOR UPDATE OF c;
  IF NOT FOUND THEN RAISE EXCEPTION 'code_not_found'; END IF;
  IF v_voided IS NOT NULL THEN RAISE EXCEPTION 'code_voided'; END IF;
  IF v_consumed IS NOT NULL THEN RAISE EXCEPTION 'code_in_use'; END IF;

  IF private.void_unused_sitting_codes(p_sitting_id, ARRAY[v_entry], v_reason, v_g.admin_id, v_g.admin_role, v_g.org_id) <> 1 THEN
    RAISE EXCEPTION 'code_in_use';
  END IF;
  RETURN QUERY SELECT p_code_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.void_sitting_code(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_sitting_code(uuid, uuid, text) TO authenticated;
