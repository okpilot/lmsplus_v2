-- Adds explicit student x subject pairs. The caller guards and holds the sitting lock.
-- not_candidate is classified before sitting_pair_state runs, so the user x subject cross product is bounded.
CREATE OR REPLACE FUNCTION private.add_sitting_entries_core(
  p_org uuid, p_sitting_id uuid, p_user_ids uuid[], p_subject_ids uuid[], p_actor uuid, p_role text
)
RETURNS TABLE(added int, skipped_existing int, skipped_not_candidate int, skipped_deactivated int,
              skipped_not_enrolled int, skipped_passed int, skipped_entered_elsewhere int,
              skipped_attempt_running int, skipped jsonb)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pairs int;
  v_n int;
  v_subjects uuid[];
  v_cand uuid[];
  v_cls jsonb;
  v_live int;
  v_elig int;
  v_added int;
BEGIN
  IF p_user_ids IS NULL OR p_subject_ids IS NULL OR cardinality(p_user_ids) <> cardinality(p_subject_ids)
     OR cardinality(p_user_ids) = 0 OR array_position(p_user_ids, NULL) IS NOT NULL
     OR array_position(p_subject_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('exam_sitting_entries:' || p_org::text, 0));

  SELECT count(*), COALESCE(array_agg(DISTINCT d.s), '{}') INTO v_pairs, v_subjects
    FROM (SELECT DISTINCT a.u, a.s FROM unnest(p_user_ids, p_subject_ids) AS a(u, s)) d;
  IF v_pairs > 1000 THEN RAISE EXCEPTION 'invalid_input'; END IF;

  SELECT count(*) INTO v_n FROM (
    SELECT s.id FROM public.easa_subjects s
     WHERE s.id = ANY(v_subjects) AND s.deleted_at IS NULL FOR KEY SHARE) t;
  IF v_n <> cardinality(v_subjects) THEN RAISE EXCEPTION 'subject_not_found'; END IF;
  SELECT count(*) INTO v_n FROM (
    SELECT ec.subject_id FROM public.exam_configs ec
     WHERE ec.organization_id = p_org AND ec.subject_id = ANY(v_subjects)
       AND ec.enabled = true AND ec.deleted_at IS NULL FOR SHARE) t;
  IF v_n <> cardinality(v_subjects) THEN RAISE EXCEPTION 'exam_config_required'; END IF;

  SELECT COALESCE(array_agg(c.user_id), '{}') INTO v_cand
    FROM public.exam_sitting_candidates c
   WHERE c.sitting_id = p_sitting_id AND c.organization_id = p_org AND c.deleted_at IS NULL
     AND c.user_id = ANY(p_user_ids);

  WITH pairs AS (
    SELECT DISTINCT a.u, a.s FROM unnest(p_user_ids, p_subject_ids) AS a(u, s)
  ), st AS MATERIALIZED (
    SELECT * FROM private.sitting_pair_state(p_org, p_sitting_id, v_cand, v_subjects)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'uid', pr.u, 'sid', pr.s,
           'reason', CASE WHEN pr.u <> ALL (v_cand) OR s.state IS NULL THEN 'not_candidate'
                          WHEN s.state = 'entered_here' THEN 'existing'
                          WHEN s.state = 'attempt_running' THEN 'attempt_running'
                          ELSE s.state END,
           'detail_at', CASE s.state WHEN 'passed' THEN s.passed_at WHEN 'entered_elsewhere' THEN s.elsewhere_at END)), '[]')
    INTO v_cls
    FROM pairs pr LEFT JOIN st s ON s.user_id = pr.u AND s.subject_id = pr.s;

  SELECT count(*)::int INTO v_elig FROM jsonb_array_elements(v_cls) j WHERE j ->> 'reason' = 'eligible';
  SELECT count(*)::int INTO v_live FROM public.exam_sitting_entries e
   WHERE e.sitting_id = p_sitting_id AND e.organization_id = p_org AND e.deleted_at IS NULL;
  IF v_live + v_elig > 2000 THEN RAISE EXCEPTION 'too_many_entries'; END IF;

  INSERT INTO public.exam_sitting_entries (organization_id, sitting_id, user_id, subject_id)
    SELECT p_org, p_sitting_id, (j ->> 'uid')::uuid, (j ->> 'sid')::uuid
      FROM jsonb_array_elements(v_cls) j WHERE j ->> 'reason' = 'eligible';
  GET DIAGNOSTICS v_added = ROW_COUNT;

  RETURN QUERY
  SELECT v_added,
    (SELECT count(*)::int FROM jsonb_array_elements(v_cls) j WHERE j ->> 'reason' = 'existing'),
    (SELECT count(*)::int FROM jsonb_array_elements(v_cls) j WHERE j ->> 'reason' = 'not_candidate'),
    (SELECT count(*)::int FROM jsonb_array_elements(v_cls) j WHERE j ->> 'reason' = 'deactivated'),
    (SELECT count(*)::int FROM jsonb_array_elements(v_cls) j WHERE j ->> 'reason' = 'not_enrolled'),
    (SELECT count(*)::int FROM jsonb_array_elements(v_cls) j WHERE j ->> 'reason' = 'passed'),
    (SELECT count(*)::int FROM jsonb_array_elements(v_cls) j WHERE j ->> 'reason' = 'entered_elsewhere'),
    (SELECT count(*)::int FROM jsonb_array_elements(v_cls) j WHERE j ->> 'reason' = 'attempt_running'),
    COALESCE((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                'user_id', k.uid, 'subject_id', k.sid, 'reason', k.reason, 'detail_at', k.detail_at)))
                FROM (SELECT j ->> 'uid' AS uid, j ->> 'sid' AS sid, j ->> 'reason' AS reason, j -> 'detail_at' AS detail_at
                        FROM jsonb_array_elements(v_cls) j WHERE j ->> 'reason' <> 'eligible'
                       ORDER BY (j ->> 'reason') COLLATE "C", (j ->> 'uid')::uuid, (j ->> 'sid')::uuid LIMIT 50) k),
             '[]'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION private.add_sitting_entries_core(uuid, uuid, uuid[], uuid[], uuid, text) FROM PUBLIC, anon, authenticated;
