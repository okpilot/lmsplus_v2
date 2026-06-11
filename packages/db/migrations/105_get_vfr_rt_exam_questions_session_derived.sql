-- Migration 105: get_vfr_rt_exam_questions(p_session_id) — session-derived,
-- type-aware, answer-key-stripped question reads for the VFR RT mock exam
-- (#697; issues #833, #840). Replaces the mig 099b
-- get_vfr_rt_exam_questions(p_question_ids uuid[]) signature.
--
-- Why the signature change (#833): the 099b function took caller-supplied
-- question UUIDs, which misapplied the docs/security.md §15 immutable
-- write-once carve-out — the §15 exception is legitimate only when the IDs
-- come from an immutable, write-once column, not from client input. This
-- version derives the IDs inside the function from the session's frozen
-- quiz_sessions.config.question_ids (written once at session start, locked by
-- trg_quiz_sessions_immutable_columns, mig 079), so the carve-out now applies
-- by construction.
--
-- Callable BOTH in-flight and post-exam: the session fetch deliberately has no
-- ended_at condition — this function is the display-field source for the
-- Phase C review screen as well as the live exam.
--
-- Explanations removed (#840): explanation_text / explanation_image_url are no
-- longer returned, so explanations cannot leak mid-exam. They are revealed
-- ONLY via get_vfr_rt_exam_results (mig 103/106), which is gated behind
-- ended_at IS NOT NULL.
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
-- blanks_config, any correct flag, or explanation fields.
--
-- security.md rules 1, 7. STABLE: read-only.

-- The parameter type changes (uuid[] -> uuid), so CREATE OR REPLACE is not
-- possible — drop the old signature first.
DROP FUNCTION IF EXISTS public.get_vfr_rt_exam_questions(uuid[]);

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
  blanks_safe           jsonb
)
LANGUAGE plpgsql
STABLE
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
  FROM cfg
  JOIN public.questions q ON q.id = cfg.question_id
  JOIN public.easa_subjects s ON s.id = q.subject_id
  JOIN public.easa_topics   t ON t.id = q.topic_id
  WHERE q.organization_id = v_caller_org_id
  ORDER BY cfg.ord;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_vfr_rt_exam_questions(uuid) TO authenticated;
