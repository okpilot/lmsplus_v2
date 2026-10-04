-- _question_is_broken: true when a question's own bank data makes it ungradable or unwinnable for
-- every answer. Reads only question columns, never an answer. Scoring leaves such a question out.
-- ordering and diagram_label are fully covered by the questions CHECK constraints.

CREATE OR REPLACE FUNCTION _question_is_broken(
  p_type      text,
  p_options   jsonb,
  p_correct   text,
  p_canonical text,
  p_synonyms  text[],
  p_blanks    jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_type
    WHEN 'multiple_choice' THEN NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_options) = 'array' THEN p_options ELSE '[]'::jsonb END) o
      WHERE jsonb_typeof(o) = 'object' AND o->>'id' = p_correct
    )
    WHEN 'short_answer' THEN
      coalesce(normalize_answer(p_canonical), '') = ''
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p_synonyms, '{}'::text[])) s
        WHERE coalesce(normalize_answer(s), '') <> ''
      )
    WHEN 'dialog_fill' THEN
      jsonb_typeof(p_blanks) IS DISTINCT FROM 'array'
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_blanks) = 'array' THEN p_blanks ELSE '[]'::jsonb END) b
        WHERE jsonb_typeof(b) <> 'object'
           OR coalesce(b->>'index' !~ '^\d{1,4}$', true)
           OR b->>'canonical' IS NULL
           OR (b ? 'synonyms' AND jsonb_typeof(b->'synonyms') <> 'array')
           OR (coalesce(normalize_answer(b->>'canonical'), '') = ''
               AND NOT EXISTS (
                 SELECT 1
                 FROM jsonb_array_elements_text(
                   CASE WHEN jsonb_typeof(b->'synonyms') = 'array' THEN b->'synonyms' ELSE '[]'::jsonb END) s
                 WHERE coalesce(normalize_answer(s), '') <> ''))
      )
      OR (
        SELECT count(*) <> count(DISTINCT b->>'index')
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_blanks) = 'array' THEN p_blanks ELSE '[]'::jsonb END) b
      )
    ELSE false
  END;
$$;

REVOKE EXECUTE ON FUNCTION _question_is_broken(text, jsonb, text, text, text[], jsonb) FROM PUBLIC, anon, authenticated;
