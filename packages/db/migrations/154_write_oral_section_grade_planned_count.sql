-- Migration 154: AI ICAO ELP — write_oral_section_grade finalizes at the
-- session's OWN planned section count (v_planned, read from config), not a
-- hardcoded 5. Companion to mig 153's session-mode generalization
-- (start_oral_exam_session/submit_oral_section_response). All existing
-- guards — the auth.uid() IS NOT NULL forbidden check, the state-based replay
-- guard, the soft-delete filters, the REVOKE/GRANT model, the two ON CONFLICT
-- clauses — are preserved verbatim. Depends on migs 150-153.
--
-- ⚠️ SECURITY LINCHPIN — see mig 152 header for the full grant-model rationale.
-- Still callable ONLY by the service-role Edge Function (auth.uid() IS NULL).

CREATE OR REPLACE FUNCTION public.write_oral_section_grade(
  p_response_id       uuid,
  p_transcript        text,
  p_transcript_meta   jsonb,
  p_descriptor_scores jsonb,
  p_usage             jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id  uuid;
  v_section_no  smallint;
  v_status      text;
  v_org_id      uuid;
  v_student_id  uuid;
  v_config      jsonb;
  v_planned     int;
  v_score       jsonb;
  v_descriptor  text;
  v_level       int;
  v_usage       jsonb;
  v_ungraded    int;
  v_total       int;
  v_final_level smallint;
  v_finalized   boolean := false;
BEGIN
  -- Defense-in-depth vs grant drift: this grader is invoked ONLY by the service-role
  -- Edge Function, where auth.uid() is NULL. Any authenticated caller has a non-null
  -- auth.uid(), so this rejects a forged call even if the REVOKE below is ever undone.
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- 1. Locate + LOCK the section. State-based replay guard (NO auth.uid()). The
  -- FOR UPDATE serializes concurrent webhook double-fires for the same section:
  -- the second caller blocks here, then re-reads status = 'graded' and skips — so
  -- the non-idempotent elp_usage_events inserts (step 5) cannot double-count.
  SELECT r.session_id, r.section_no, r.status
  INTO v_session_id, v_section_no, v_status
  FROM oral_exam_section_responses r
  WHERE r.id = p_response_id
  FOR UPDATE;
  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'response_not_found';
  END IF;
  -- Idempotent replay: only a section still in 'grading' is processed; a re-fired
  -- webhook (already 'graded'/'failed') is a no-op.
  IF v_status <> 'grading' THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'not_grading', 'section_no', v_section_no);
  END IF;

  -- 2. Resolve org/student from the non-discarded session (rule 9 soft-delete).
  -- FOR UPDATE takes a SESSION-level lock so concurrent grader calls for DIFFERENT
  -- sections of the same session serialize here: without it, two final sections
  -- grading at once could each count the other as still 'grading' (READ COMMITTED
  -- hides the other's uncommitted flip) and BOTH skip finalize, stranding a fully
  -- graded exam in 'grading' forever. Lock order is always section (step 1) then
  -- session (here), identical for every caller, so no deadlock.
  SELECT s.organization_id, s.student_id, s.config INTO v_org_id, v_student_id, v_config
  FROM oral_exam_sessions s
  WHERE s.id = v_session_id AND s.deleted_at IS NULL
  FOR UPDATE;
  IF v_org_id IS NULL THEN
    -- Session discarded mid-grading — nothing to persist.
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'session_discarded', 'section_no', v_section_no);
  END IF;

  -- 2b. Planned section count (frozen in config at start — 'practice' = 1,
  -- 'mock' = 5), read alongside the locked session row above. Defensive against a
  -- missing/malformed sections array, mirroring submit_oral_section_response (mig 153).
  v_planned := CASE
    WHEN jsonb_typeof(v_config->'sections') = 'array' THEN jsonb_array_length(v_config->'sections')
    ELSE NULL
  END;
  IF v_planned IS NULL OR v_planned < 1 THEN
    RAISE EXCEPTION 'invalid_session_config';
  END IF;

  -- 3. Validate + insert this section's descriptor scores.
  IF p_descriptor_scores IS NULL OR jsonb_typeof(p_descriptor_scores) <> 'array'
     OR jsonb_array_length(p_descriptor_scores) <> 6 THEN
    RAISE EXCEPTION 'invalid_descriptor_scores';
  END IF;
  -- Require the six canonical descriptors with no duplicates: a short/partial array
  -- would mark the section graded and let finalization aggregate an incomplete
  -- descriptor set, inflating the weakest-link MIN. The per-element loop below rejects
  -- any descriptor outside the canonical six, so 6-distinct here ⟹ exactly the six.
  IF (SELECT count(DISTINCT e->>'descriptor')
      FROM jsonb_array_elements(p_descriptor_scores) e) <> 6 THEN
    RAISE EXCEPTION 'invalid_descriptor_scores';
  END IF;
  FOR v_score IN SELECT jsonb_array_elements(p_descriptor_scores)
  LOOP
    v_descriptor := v_score->>'descriptor';
    v_level := (v_score->>'level')::int;
    IF v_descriptor NOT IN
       ('pronunciation','structure','vocabulary','fluency','comprehension','interaction') THEN
      RAISE EXCEPTION 'invalid_descriptor: %', v_descriptor;
    END IF;
    IF v_level IS NULL OR v_level < 1 OR v_level > 6 THEN
      RAISE EXCEPTION 'invalid_level for descriptor %', v_descriptor;
    END IF;
    INSERT INTO oral_exam_descriptor_scores
      (session_id, section_no, descriptor, level, rationale, evidence)
    VALUES
      (v_session_id, v_section_no, v_descriptor, v_level::smallint,
       v_score->>'rationale', v_score->'evidence')
    ON CONFLICT (session_id, section_no, descriptor) WHERE section_no IS NOT NULL DO NOTHING;
  END LOOP;

  -- 4. Persist transcript + flip the section to graded.
  UPDATE oral_exam_section_responses
  SET transcript_text = p_transcript, transcript_meta = p_transcript_meta, status = 'graded'
  WHERE id = p_response_id AND status = 'grading';

  -- 5. Metering ledger — the grader is the ONLY writer (values from the actual
  -- Scribe/Claude provider responses, never client input).
  IF p_usage IS NOT NULL AND jsonb_typeof(p_usage) = 'array' THEN
    FOR v_usage IN SELECT jsonb_array_elements(p_usage)
    LOOP
      IF (v_usage->>'event_type') IN
         ('stt_seconds','tts_chars','convai_seconds','llm_input_tokens','llm_output_tokens')
         AND COALESCE((v_usage->>'quantity')::numeric, -1) >= 0 THEN
        INSERT INTO elp_usage_events
          (organization_id, student_id, session_id, section_no, event_type,
           quantity, provider, cost_estimate_micros, metadata)
        VALUES (
          v_org_id, v_student_id, v_session_id, v_section_no, v_usage->>'event_type',
          (v_usage->>'quantity')::numeric, v_usage->>'provider',
          NULLIF(v_usage->>'cost_estimate_micros', '')::bigint,
          COALESCE(v_usage->'metadata', '{}'::jsonb)
        );
      END IF;
    END LOOP;
  END IF;

  -- 6. Finalize when all planned sections exist and every one is graded. Aggregate
  -- level per descriptor = MIN across sections (weakest-link); overall final level
  -- = MIN across the aggregate rows. Only descriptors with per-section scores get
  -- an aggregate row, so MIN is never over an empty group (no 23502).
  SELECT count(*) FILTER (WHERE status <> 'graded'), count(*)
  INTO v_ungraded, v_total
  FROM oral_exam_section_responses
  WHERE session_id = v_session_id;

  IF v_ungraded = 0 AND v_total >= v_planned THEN
    INSERT INTO oral_exam_descriptor_scores (session_id, section_no, descriptor, level)
    SELECT v_session_id, NULL, d.descriptor, MIN(d.level)::smallint
    FROM oral_exam_descriptor_scores d
    WHERE d.session_id = v_session_id AND d.section_no IS NOT NULL
    GROUP BY d.descriptor
    ON CONFLICT (session_id, descriptor) WHERE section_no IS NULL DO NOTHING;

    SELECT MIN(level) INTO v_final_level
    FROM oral_exam_descriptor_scores
    WHERE session_id = v_session_id AND section_no IS NULL;

    UPDATE oral_exam_sessions
    SET status = 'graded', total_final_level = v_final_level, ended_at = COALESCE(ended_at, now())
    WHERE id = v_session_id AND deleted_at IS NULL;

    v_finalized := true;
  END IF;

  RETURN jsonb_build_object(
    'status', 'graded', 'section_no', v_section_no, 'session_finalized', v_finalized
  );
END;
$$;

-- ⚠️ THE forgery-prevention lines. Do NOT grant to anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.write_oral_section_grade(uuid, text, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.write_oral_section_grade(uuid, text, jsonb, jsonb, jsonb)
  TO service_role;
