-- Add question_number to get_quiz_questions return set
-- The questions table already has question_number (migration 003).
-- This exposes it through the RPC so sessions can display it.

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
  question_number       text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    q.id,
    q.question_text,
    q.question_image_url,
    jsonb_agg(
      jsonb_build_object('id', opt->>'id', 'text', opt->>'text')
      ORDER BY opt->>'id'
    ) AS options,
    s.code    AS subject_code,
    t.name    AS topic_name,
    st.name   AS subtopic_name,
    q.lo_reference,
    q.difficulty,
    NULL::text AS explanation_text,
    NULL::text AS explanation_image_url,
    q.question_number
  FROM questions q
  JOIN easa_subjects  s  ON s.id = q.subject_id
  JOIN easa_topics    t  ON t.id = q.topic_id
  LEFT JOIN easa_subtopics st ON st.id = q.subtopic_id,
  LATERAL jsonb_array_elements(q.options) AS opt
  WHERE q.id = ANY(p_question_ids)
    AND q.deleted_at IS NULL
    AND q.status = 'active'
  GROUP BY q.id, q.question_text, q.question_image_url,
           s.code, t.name, st.name, q.lo_reference, q.difficulty,
           q.question_number;
END;
$$;
