-- Migration 126: harden the dialog_fill strip regex in get_quiz_questions
-- (#951). Defense-in-depth re-emit of mig 118 — ONLY the strip regex changes;
-- the signature, guard set, and every other line are identical (verify by
-- diffing against mig 118 / 20260621000100).
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
-- security.md rules 1, 7, 9, 11/12. CREATE OR REPLACE (no signature change, so
-- no DROP — unlike mig 118 which widened RETURNS TABLE). VOLATILE (default):
-- MC option shuffle uses ORDER BY random().

CREATE OR REPLACE FUNCTION get_quiz_questions(p_question_ids uuid[])
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
DECLARE
  v_org_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Active-user + tenant-scope gate (security.md rules 11/12 / #883, #831):
  -- resolve the caller's org in one deleted_at-filtered read — this both
  -- rejects a soft-deleted caller AND scopes the questions read below. This
  -- function is SECURITY DEFINER (bypasses RLS), so without the org filter a
  -- caller passing foreign p_question_ids could read another org's questions.
  -- Mirrors the sibling get_vfr_rt_exam_questions (mig 105). Alias `users u` +
  -- qualify columns: the RETURNS TABLE has an `id` OUT param, so an unqualified
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
