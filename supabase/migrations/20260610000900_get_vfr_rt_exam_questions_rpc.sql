-- Migration 099b: get_vfr_rt_exam_questions(p_question_ids) — type-aware,
-- answer-key-stripped question reads for the VFR RT mock exam (#697, spec
-- vfr-rt-slovenia-mock-exam A.6b).
--
-- Sibling of get_quiz_questions (LATEST body:
-- supabase/migrations/20260327000059_shuffle_answer_options.sql — no later
-- redefinition, confirmed by grep of both migration dirs), NOT a replacement:
-- the existing RPC keeps serving the MC-only modes; this one serves the
-- mixed-type vfr_rt_exam. Without it, the only client-side read path for
-- short_answer / dialog_fill questions would be a direct PostgREST SELECT on
-- questions, exposing answer-key material (security.md rule 1).
--
-- Stripping guarantees (security.md rule 1 — every answer key removed):
--   * multiple_choice — options projected to {id, text} only (the 'correct'
--     flag is dropped), shuffled ORDER BY random() (pattern copied from
--     get_quiz_questions, mig 20260327000059).
--   * short_answer    — options/dialog_template/blanks_safe all NULL;
--     canonical_answer and accepted_synonyms are never selected.
--   * dialog_fill     — dialog_template has every {{n|canonical; syn...}}
--     token rewritten to a plain {{n}} marker, so the client can position
--     blanks without seeing canonicals; blanks_safe is [{index}] only (raw
--     blanks_config canonicals + synonyms stripped).
-- The function NEVER returns canonical_answer, accepted_synonyms, raw
-- blanks_config, or any correct flag.
--
-- security.md rules 1, 7. STABLE: read-only.

CREATE OR REPLACE FUNCTION public.get_vfr_rt_exam_questions(p_question_ids uuid[])
RETURNS TABLE (
  id                    uuid,
  question_type         text,
  question_text         text,
  question_image_url    text,
  subject_code          text,
  topic_code            text,
  difficulty            text,
  question_number       text,
  explanation_text      text,
  explanation_image_url text,
  options               jsonb,
  dialog_template       text,
  blanks_safe           jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  -- Auth (security.md rule 7) + active-user gate.
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_caller AND u.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'user_not_found_or_inactive';
  END IF;

  -- p_question_ids carries the session's frozen quiz_sessions.config.question_ids
  -- — an immutable, write-once column (written at session start, locked by
  -- trg_quiz_sessions_immutable_columns, mig 079). Per docs/security.md §15
  -- (same exception as batch_submit_quiz) the deleted_at / status filters are
  -- omitted on the questions read so an in-flight exam keeps rendering
  -- questions soft-deleted or retired after sampling. Cross-reference:
  -- docs/database.md §3 "Scoring Soft-Deleted Questions". Every row is fully
  -- answer-key-stripped (see header), so no key material is exposed either way.
  RETURN QUERY
  SELECT
    q.id,
    q.question_type,
    q.question_text,
    q.question_image_url,
    s.code AS subject_code,
    t.code AS topic_code,
    q.difficulty,
    q.question_number,
    q.explanation_text,
    q.explanation_image_url,
    -- MC only: strip to {id, text}, shuffle (get_quiz_questions pattern).
    CASE WHEN q.question_type = 'multiple_choice' THEN
      (SELECT jsonb_agg(
         jsonb_build_object('id', opt->>'id', 'text', opt->>'text')
         ORDER BY random()
       )
       FROM jsonb_array_elements(q.options) AS opt)
    ELSE NULL END AS options,
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
  FROM public.questions q
  JOIN public.easa_subjects s ON s.id = q.subject_id
  JOIN public.easa_topics   t ON t.id = q.topic_id
  WHERE q.id = ANY(p_question_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_vfr_rt_exam_questions(uuid[]) TO authenticated;
