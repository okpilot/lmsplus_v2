-- get_vfr_rt_exam_questions: adds ordering_items_shuffled, diagram_config_public
-- and subtopic_code (get_quiz_questions projection, no answer key). Return type
-- changes, so DROP + CREATE. Guards and every other column unchanged.
-- security.md rules 1, 7.

DROP FUNCTION IF EXISTS public.get_vfr_rt_exam_questions(uuid);

CREATE FUNCTION public.get_vfr_rt_exam_questions(p_session_id uuid)
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
  blanks_safe           jsonb,
  ordering_items_shuffled jsonb,
  diagram_config_public jsonb,
  subtopic_code         text
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
    ELSE NULL END AS blanks_safe,
    -- ordering only: {id, text} items SHUFFLED (canonical order is the stored
    -- array order). No answer key projected.
    CASE WHEN q.question_type = 'ordering' THEN
      (SELECT jsonb_agg(
         jsonb_build_object('id', e->>'id', 'text', e->>'text')
         ORDER BY random()
       )
       FROM jsonb_array_elements(q.ordering_items) AS e)
    ELSE NULL END AS ordering_items_shuffled,
    -- diagram_label only: {image_ref, zones, labels(shuffled)}; `answer` is
    -- omitted (answer key). Zones re-projected to exactly {id,x,y,w,h}.
    CASE WHEN q.question_type = 'diagram_label' THEN
      jsonb_build_object(
        'image_ref', q.diagram_config->'image_ref',
        'zones',     (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', z.elem->>'id',
              'x',  z.elem->'x',
              'y',  z.elem->'y',
              'w',  z.elem->'w',
              'h',  z.elem->'h'
            )
            ORDER BY z.ord
          )
          FROM jsonb_array_elements(q.diagram_config->'zones') WITH ORDINALITY AS z(elem, ord)
        ),
        'labels',    (
          SELECT jsonb_agg(
            jsonb_build_object('id', lbl->>'id', 'text', lbl->>'text')
            ORDER BY random()
          )
          FROM jsonb_array_elements(q.diagram_config->'labels') AS lbl
        )
      )
    ELSE NULL END AS diagram_config_public,
    st.code AS subtopic_code
  FROM cfg
  JOIN public.questions q ON q.id = cfg.question_id
  JOIN public.easa_subjects s ON s.id = q.subject_id
  JOIN public.easa_topics   t ON t.id = q.topic_id
  LEFT JOIN public.easa_subtopics st ON st.id = q.subtopic_id
  WHERE q.organization_id = v_caller_org_id
  ORDER BY cfg.ord;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_vfr_rt_exam_questions(uuid) TO authenticated;
