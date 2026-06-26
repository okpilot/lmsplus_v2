-- Migration 135: get_study_questions — MC question delivery WITH the answer key
-- and explanation, for Study Mode (feat/study-mode-mc).
--
-- DELIBERATE answer-key exposure. Unlike get_quiz_questions (mig 126), which
-- strips the MC key (correct_option_id is REVOKE-gated from authenticated, mig
-- 111/094, and only revealed post-session via the report RPCs), Study Mode is a
-- self-paced practice surface where the student is SHOWN the correct answer and
-- explanation immediately — there is no score, no session, no exam integrity to
-- protect. This RPC therefore returns q.correct_option_id and the explanation
-- directly. It is SECURITY DEFINER so it can read the REVOKE-gated key column;
-- correct_option_id is NOT exposed via any PostgREST column GRANT (security.md
-- rule 1) — only this guarded RPC reveals it.
--
-- Options are returned in STORED order (no ORDER BY random()): the answer is shown
-- anyway, so shuffling adds nothing, and a stable order is friendlier for study.
--
-- §15 immutable-column carve-out does NOT apply. The report RPCs (mig 114/133)
-- may omit the q.deleted_at filter because they read questions via the immutable,
-- write-once quiz_sessions.config.question_ids / quiz_session_answers FK. Study
-- Mode reads questions by ARBITRARY caller-supplied p_question_ids, so the
-- soft-delete filter (q.deleted_at IS NULL) and status='active' are REQUIRED — a
-- caller must not be able to surface a soft-deleted/retired question's key.
--
-- Guard set mirrors get_quiz_questions / get_report_answer_keys (security.md
-- rules 1, 7, 9, 11/12): auth.uid() null-check; active-user + tenant-scope gate
-- resolving v_org_id in one deleted_at-filtered read (rejects a soft-deleted
-- caller AND scopes the questions read so a foreign-org id cannot leak). Alias
-- `questions q` / `users u` and qualify every column — the RETURNS TABLE declares
-- an `id` OUT param, so an unqualified `id` is ambiguous (42702 at execution).

DROP FUNCTION IF EXISTS public.get_study_questions(uuid[]);

CREATE FUNCTION get_study_questions(p_question_ids uuid[])
RETURNS TABLE (
  id                    uuid,
  question_text         text,
  question_image_url    text,
  options               jsonb,
  correct_option_id     text,
  subject_code          text,
  topic_name            text,
  subtopic_name         text,
  explanation_text      text,
  explanation_image_url text,
  question_number       text,
  difficulty            text
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
  -- resolve the caller's org in one deleted_at-filtered read — this both rejects
  -- a soft-deleted caller AND scopes the questions read below. SECURITY DEFINER
  -- bypasses RLS, so without the org filter a caller passing foreign
  -- p_question_ids could read another org's questions (and their keys). Alias
  -- `users u` + qualify columns: the RETURNS TABLE has an `id` OUT param, so an
  -- unqualified `id` is ambiguous (42702 at execution).
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
    -- MC options in STORED order (WITH ORDINALITY), stripped to {id, text}. No
    -- random() — the answer is shown in study mode, so a stable order is fine.
    (SELECT jsonb_agg(
       jsonb_build_object('id', opt->>'id', 'text', opt->>'text')
       ORDER BY ord
     )
     FROM jsonb_array_elements(q.options) WITH ORDINALITY AS o(opt, ord)) AS options,
    -- The MC answer key — returned DELIBERATELY for study (see header).
    q.correct_option_id,
    s.code    AS subject_code,
    t.name    AS topic_name,
    st.name   AS subtopic_name,
    q.explanation_text,
    q.explanation_image_url,
    q.question_number,
    q.difficulty
  FROM questions q
  JOIN easa_subjects  s  ON s.id = q.subject_id
  JOIN easa_topics    t  ON t.id = q.topic_id
  LEFT JOIN easa_subtopics st ON st.id = q.subtopic_id
  WHERE q.id = ANY(p_question_ids)
    AND q.organization_id = v_org_id
    AND q.deleted_at IS NULL
    AND q.status = 'active'
    AND q.question_type = 'multiple_choice';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_study_questions(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.get_study_questions(uuid[]) IS
  'Study Mode (feat/study-mode-mc): returns MC questions WITH the correct_option_id answer key and explanation, in STORED option order. DELIBERATE answer-key exposure — study mode shows the answer; no session/score/exam integrity to protect. SECURITY DEFINER reads the REVOKE-gated key column; correct_option_id is not exposed via any PostgREST GRANT. Reads by arbitrary p_question_ids, so §15 carve-out does NOT apply — deleted_at + status=active filters REQUIRED. Org/active-user gated (security.md rules 1, 7, 9, 11/12).';
