-- Migration 127: harden the dialog_fill strip regex in
-- get_vfr_rt_exam_questions (#951). Defense-in-depth re-emit of mig 105 — ONLY
-- the strip regex changes; the signature, guard set (auth, active-user/org
-- gate, session-ownership scope, §15 frozen-config carve-out, config-shape
-- guard, SET search_path), and every other line are identical (verify by
-- diffing against mig 105 / 20260611000100).
--
-- The OLD value class [^}]* stopped at the first '}', so a token value carrying
-- a stray '}' (e.g. {{0|sta}ll}}) left a partial answer key in the student-
-- facing dialog_template. The hardened class (?:[^}]|\}(?!\})) matches any
-- non-'}' char OR a '}' that is NOT the start of the closing '}}', so the strip
-- anchors on '}}' and no longer terminates early. It is provably >= the old
-- pattern on every input and byte-identical on clean data; newline-safe (no
-- '.'); Postgres ARE supports the (?!...) lookahead.
--
-- Coordination invariant: this hardened strip is sound only because the
-- template CHECK questions_dialog_fill_template_wellformed (mig 125) rejects any
-- value the strip cannot fully clean at INSERT time — do NOT weaken either
-- independently. The CHECK is the primary student-leak guard; this regex is the
-- in-RPC belt-and-suspenders.
--
-- security.md rules 1, 7. CREATE OR REPLACE (no signature change, so no DROP —
-- unlike mig 105 which changed the parameter type). VOLATILE (default): the MC
-- option shuffle uses ORDER BY random().

CREATE OR REPLACE FUNCTION public.get_vfr_rt_exam_questions(p_session_id uuid)
RETURNS TABLE (
  id                    uuid,
  question_type         text,
  question_text         text,
  question_image_url    text,
  subject_code          text,
  topic_code            text,
  difficulty            text,
  question_number       text,
  options               jsonb,
  dialog_template       text,
  blanks_safe           jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_org_id uuid;
  v_config jsonb;
BEGIN
  -- Auth (security.md rule 7).
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  -- Resolve the caller's org in one deleted_at-filtered read (security.md
  -- rules 7, 9). This single read is both the active-user gate AND the
  -- tenant-scope source for the questions read below — mirrors mig 099.
  SELECT u.organization_id INTO v_caller_org_id
  FROM public.users u
  WHERE u.id = v_caller AND u.deleted_at IS NULL;
  IF v_caller_org_id IS NULL THEN
    RAISE EXCEPTION 'user_not_found_or_inactive';
  END IF;

  -- Session fetch scopes student_id = auth.uid() EXPLICITLY — quiz_sessions
  -- has multiple permissive SELECT policies, so RLS alone over-scopes
  -- (docs/security.md "Multiple Permissive RLS SELECT Policies", §3). Unlike
  -- get_vfr_rt_exam_results (mig 103) there is NO ended_at condition: this
  -- function serves in-flight AND completed sessions.
  SELECT qs.config
  INTO v_config
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id
    AND qs.student_id = v_caller
    AND qs.mode = 'vfr_rt_exam'
    AND qs.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found or not owned';
  END IF;
  -- Config-shape guard before jsonb_array_elements_text (family pattern:
  -- batch_submit_quiz mig 095c, submit_vfr_rt_exam_answers mig 100).
  IF v_config IS NULL OR v_config->'question_ids' IS NULL
     OR jsonb_typeof(v_config->'question_ids') <> 'array' THEN
    RAISE EXCEPTION 'session_config_malformed';
  END IF;

  -- Question IDs are derived HERE from the session's frozen
  -- quiz_sessions.config.question_ids — an immutable, write-once column
  -- (written at session start, locked by trg_quiz_sessions_immutable_columns,
  -- mig 079). Per docs/security.md §15 (same exception as batch_submit_quiz,
  -- mig 095c) the deleted_at / status filters are omitted on the questions
  -- read so an in-flight exam keeps rendering questions soft-deleted or
  -- retired after sampling. Cross-reference: docs/database.md §3 "Scoring
  -- Soft-Deleted Questions". Every row is fully answer-key-stripped (see
  -- header), so no key material is exposed either way.
  -- The caller-org filter scopes the read to the caller's tenant (issue #831):
  -- a cross-org session's question rows return zero rows.
  -- ORDER BY cfg.ord returns rows in the session's frozen question order.
  RETURN QUERY
  WITH cfg AS (
    SELECT (e.qid)::uuid AS question_id, e.ord
    FROM jsonb_array_elements_text(v_config->'question_ids')
      WITH ORDINALITY AS e(qid, ord)
  )
  SELECT
    q.id,
    q.question_type,
    q.question_text,
    q.question_image_url,
    s.code AS subject_code,
    t.code AS topic_code,
    q.difficulty,
    q.question_number,
    -- MC only: strip to {id, text}, shuffle (get_quiz_questions pattern).
    CASE WHEN q.question_type = 'multiple_choice' THEN
      (SELECT jsonb_agg(
         jsonb_build_object('id', opt->>'id', 'text', opt->>'text')
         ORDER BY random()
       )
       FROM jsonb_array_elements(q.options) AS opt)
    ELSE NULL END AS options,
    -- dialog_fill only: {{n|canonical; syn...}} tokens -> plain {{n}} markers.
    -- Hardened value class (?:[^}]|\}(?!\})) anchors on '}}' so a stray '}' in
    -- a value cannot terminate the strip early and leak a partial key (#951).
    CASE WHEN q.question_type = 'dialog_fill' THEN
      regexp_replace(q.dialog_template, '\{\{(\d+)\|(?:[^}]|\}(?!\}))*\}\}', '{{\1}}', 'g')
    ELSE NULL END AS dialog_template,
    -- dialog_fill only: blank positions, canonicals/synonyms stripped.
    CASE WHEN q.question_type = 'dialog_fill' THEN
      (SELECT jsonb_agg(
         jsonb_build_object('index', (b->>'index')::int)
         ORDER BY (b->>'index')::int
       )
       FROM jsonb_array_elements(q.blanks_config) AS b)
    ELSE NULL END AS blanks_safe
  FROM cfg
  JOIN public.questions q ON q.id = cfg.question_id
  JOIN public.easa_subjects s ON s.id = q.subject_id
  JOIN public.easa_topics   t ON t.id = q.topic_id
  WHERE q.organization_id = v_caller_org_id
  ORDER BY cfg.ord;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_vfr_rt_exam_questions(uuid) TO authenticated;
