-- Migration 152: get_quiz_questions delivers the `diagram_label` question type
-- (VFR RT Training Phase 6 — #697). Adds diagram_config_public to the result.
--
-- RETURNS TABLE change (new trailing column) → DROP + recreate, NOT
-- CREATE OR REPLACE (N1; precedent mig 118 / mig 145). Every existing column +
-- guard is re-emitted verbatim from mig 145 (the latest definition); ONLY the
-- new diagram_config_public column is added.
--
-- Answer-key hiding: a `diagram_label` question's answer key is
-- diagram_config.answer (the zone_id -> label_id mapping). We deliver ONLY
-- {image_ref, zones, labels} — `answer` is OMITTED entirely, and labels are
-- SHUFFLED (ORDER BY random(), same primitive as the MC option shuffle and
-- the ordering item shuffle above) so label ARRAY POSITION cannot leak which
-- label maps to which zone. NULL for non-diagram_label types.
-- diagram_config itself is REVOKE-gated from authenticated by omission from
-- mig 094's grant (mirrors ordering_items, mig 143 header note N6).
--
-- security.md rules 1, 7, 9, 11/12. VOLATILE (default): shuffles use random().

DROP FUNCTION IF EXISTS get_quiz_questions(uuid[]);

CREATE FUNCTION get_quiz_questions(p_question_ids uuid[])
RETURNS TABLE (
  id                    uuid,
  question_text         text,
  question_image_url    text,
  options               jsonb,
  subject_code          text,
  topic_name            text,
  subtopic_name         text,
  lo_reference          text,
  difficulty            text,
  explanation_text      text,
  explanation_image_url text,
  question_number       text,
  question_type         text,
  dialog_template       text,
  blanks_safe           jsonb,
  ordering_items_shuffled jsonb,
  diagram_config_public jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Active-user + tenant-scope gate (security.md rules 11/12 / #883, #831):
  -- resolve the caller's org in one deleted_at-filtered read — rejects a
  -- soft-deleted caller AND scopes the questions read below. SECURITY DEFINER
  -- bypasses RLS, so the org filter prevents foreign-org reads. Alias `users u`
  -- + qualify columns: the RETURNS TABLE has an `id` OUT param, so an unqualified
  -- `id` is ambiguous (42702 at execution; caught by the Phase 2.4 test).
  SELECT u.organization_id INTO v_org_id
  FROM users u WHERE u.id = auth.uid() AND u.deleted_at IS NULL;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'user_not_found_or_inactive';
  END IF;

  RETURN QUERY
  SELECT
    q.id,
    q.question_text,
    q.question_image_url,
    -- MC only: strip to {id, text}, shuffle.
    CASE WHEN q.question_type = 'multiple_choice' THEN
      (SELECT jsonb_agg(
         jsonb_build_object('id', opt->>'id', 'text', opt->>'text')
         ORDER BY random()
       )
       FROM jsonb_array_elements(q.options) AS opt)
    ELSE NULL END AS options,
    s.code    AS subject_code,
    t.name    AS topic_name,
    st.name   AS subtopic_name,
    q.lo_reference,
    q.difficulty,
    q.explanation_text,
    q.explanation_image_url,
    q.question_number,
    q.question_type,
    -- dialog_fill only: {{n|canonical; syn...}} tokens -> plain {{n}} markers.
    -- Hardened value class (?:[^}]|\}(?!\})) anchors on '}}' (#951).
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
    -- array order — shuffling hides it). No answer key projected.
    CASE WHEN q.question_type = 'ordering' THEN
      (SELECT jsonb_agg(
         jsonb_build_object('id', e->>'id', 'text', e->>'text')
         ORDER BY random()
       )
       FROM jsonb_array_elements(q.ordering_items) AS e)
    ELSE NULL END AS ordering_items_shuffled,
    -- diagram_label only: {image_ref, zones, labels(shuffled)}. `answer` is
    -- OMITTED entirely — it is the answer key. Labels are shuffled so array
    -- position cannot correlate back to a zone.
    CASE WHEN q.question_type = 'diagram_label' THEN
      jsonb_build_object(
        'image_ref', q.diagram_config->'image_ref',
        'zones',     q.diagram_config->'zones',
        'labels',    (
          SELECT jsonb_agg(
            jsonb_build_object('id', lbl->>'id', 'text', lbl->>'text')
            ORDER BY random()
          )
          FROM jsonb_array_elements(q.diagram_config->'labels') AS lbl
        )
      )
    ELSE NULL END AS diagram_config_public
  FROM questions q
  JOIN easa_subjects  s  ON s.id = q.subject_id
  JOIN easa_topics    t  ON t.id = q.topic_id
  LEFT JOIN easa_subtopics st ON st.id = q.subtopic_id
  WHERE q.id = ANY(p_question_ids)
    AND q.organization_id = v_org_id
    AND q.deleted_at IS NULL
    AND q.status = 'active';
END;
$$;

GRANT EXECUTE ON FUNCTION get_quiz_questions(uuid[]) TO authenticated;
