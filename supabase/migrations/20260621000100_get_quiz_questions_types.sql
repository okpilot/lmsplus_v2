-- Migration 118: extend get_quiz_questions to deliver non-MC question types
-- (short_answer, dialog_fill) with answer keys stripped, for the VFR RT
-- training practice quiz (Phase 2, #697).
--
-- Why DROP + CREATE (not CREATE OR REPLACE): the RETURNS TABLE column list
-- is widened (+ question_type, dialog_template, blanks_safe), so a signature
-- change requires DROP first — same precedent as mig 20260327000059 (mig 059)
-- and mig 20260611000100 (mig 105).
--
-- Why the LATERAL is replaced: the previous body used
--   CROSS JOIN LATERAL jsonb_array_elements(q.options) ... GROUP BY
-- Because short_answer / dialog_fill rows have options = '[]' (NOT NULL
-- DEFAULT '[]', set by mig 20260610000100 mig 094), jsonb_array_elements('[]')
-- yields ZERO rows. The CROSS JOIN would silently DROP every non-MC question.
-- Fix: correlated-subquery CASE form copied from mig 20260611000100 (mig 105),
-- which solved the same problem for get_vfr_rt_exam_questions.
--
-- Stripping guarantees (security.md rule 1 — every answer key removed):
--   * multiple_choice — options projected to {id, text} only (the 'correct'
--     flag is dropped), shuffled ORDER BY random() inside a correlated
--     subquery — same pattern as get_vfr_rt_exam_questions (mig 105).
--   * short_answer    — options NULL (was shuffled MC options, irrelevant);
--     canonical_answer and accepted_synonyms are never selected.
--   * dialog_fill     — dialog_template has every {{n|canonical; syn...}}
--     token rewritten to plain {{n}} marker; blanks_safe is [{index}] only
--     (raw blanks_config canonicals + synonyms stripped).
-- This function NEVER returns canonical_answer, accepted_synonyms, raw
-- blanks_config, any correct flag, or question_type-gated answer material.
--
-- security.md rules 1, 7, 9. VOLATILE (default): MC option shuffle uses
-- ORDER BY random(), so STABLE does not apply — matches mig 059.

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
  blanks_safe           jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Active-user gate (security.md rule 12 / #883): a soft-deleted caller must
  -- not load questions. Mirrors the sibling get_vfr_rt_exam_questions (mig 105,
  -- lines 77-82) and check_quiz_answer (mig 117). Closes this RPC's #883 gap.
  -- Alias `users u` + qualify columns: this function's RETURNS TABLE has an
  -- OUT param named `id`, so an unqualified `id` here is ambiguous (42702 at
  -- execution; passes CREATE/db-reset — deferred-validation, caught by the
  -- Phase 2.4 integration test).
  PERFORM 1 FROM users u WHERE u.id = auth.uid() AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found_or_inactive';
  END IF;

  RETURN QUERY
  SELECT
    q.id,
    q.question_text,
    q.question_image_url,
    -- MC only: strip to {id, text}, shuffle (correlated-subquery form from
    -- mig 20260611000100 mig 105 — replaces the LATERAL/GROUP BY which would
    -- silently drop non-MC rows whose options is '[]').
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
    CASE WHEN q.question_type = 'dialog_fill' THEN
      regexp_replace(q.dialog_template, '\{\{(\d+)\|[^}]*\}\}', '{{\1}}', 'g')
    ELSE NULL END AS dialog_template,
    -- dialog_fill only: blank positions, canonicals/synonyms stripped.
    CASE WHEN q.question_type = 'dialog_fill' THEN
      (SELECT jsonb_agg(
         jsonb_build_object('index', (b->>'index')::int)
         ORDER BY (b->>'index')::int
       )
       FROM jsonb_array_elements(q.blanks_config) AS b)
    ELSE NULL END AS blanks_safe
  FROM questions q
  JOIN easa_subjects  s  ON s.id = q.subject_id
  JOIN easa_topics    t  ON t.id = q.topic_id
  LEFT JOIN easa_subtopics st ON st.id = q.subtopic_id
  WHERE q.id = ANY(p_question_ids)
    AND q.deleted_at IS NULL
    AND q.status = 'active';
END;
$$;

GRANT EXECUTE ON FUNCTION get_quiz_questions(uuid[]) TO authenticated;
