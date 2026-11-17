-- validate a user-id selection. NULL = every live candidate of the sitting.
-- Explicit array: no NULL element, 1..p_max distinct ids; ids that are not live candidates are dropped.
CREATE OR REPLACE FUNCTION private.sitting_resolve_user_ids(p_org uuid, p_sitting_id uuid, p_user_ids uuid[], p_max int)
RETURNS uuid[]
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  IF p_user_ids IS NULL THEN
    v_ids := COALESCE(ARRAY(SELECT c.user_id FROM public.exam_sitting_candidates c
                             WHERE c.sitting_id = p_sitting_id AND c.organization_id = p_org AND c.deleted_at IS NULL), '{}');
    IF cardinality(v_ids) > 500 THEN RAISE EXCEPTION 'invalid_input'; END IF;
    RETURN v_ids;
  END IF;
  IF array_position(p_user_ids, NULL) IS NOT NULL OR cardinality(p_user_ids) = 0 THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;
  v_ids := ARRAY(SELECT DISTINCT x FROM unnest(p_user_ids) x);
  IF cardinality(v_ids) > p_max THEN RAISE EXCEPTION 'invalid_input'; END IF;
  v_ids := COALESCE(ARRAY(SELECT c.user_id FROM public.exam_sitting_candidates c
                           WHERE c.sitting_id = p_sitting_id AND c.organization_id = p_org AND c.deleted_at IS NULL
                             AND c.user_id = ANY(v_ids)), '{}');
  IF cardinality(v_ids) = 0 THEN RAISE EXCEPTION 'invalid_input'; END IF;
  RETURN v_ids;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.sitting_resolve_user_ids(uuid, uuid, uuid[], int) FROM PUBLIC, anon, authenticated;
