-- Migration 142: get_study_questions — exclude 'discovery' from the mid-exam
-- answer-oracle guard (#1011).
--
-- #1011 makes Discovery a REAL ephemeral session (mode='discovery', mig 137):
-- start_discovery_session inserts the discovery row, and the app then calls
-- getStudyQuestions(ids) (apps/web/.../actions/study.ts) to read the keys. Mig
-- 135's guard blocked Study reads whenever the caller held ANY active session
-- other than smart_review / quick_quiz — which would now include the discovery
-- row this very flow just created, so Study would self-trigger
-- 'active_exam_session' and never load.
--
-- Fix: widen the practice-mode allowlist in the guard from
--   mode NOT IN ('smart_review', 'quick_quiz')
-- to
--   mode NOT IN ('smart_review', 'quick_quiz', 'discovery')
-- so the discovery session does not block its own key reads. Exam modes
-- (mock_exam / internal_exam / vfr_rt_exam) still trip the guard, preserving
-- the mid-exam answer-oracle defence. The single-active-session invariant (mig
-- 136) independently guarantees a discovery session and an exam session cannot
-- coexist, so excluding discovery here does NOT reopen the oracle.
--
-- Source body: get_study_questions LATEST = mig 135 (≡ supabase
-- 20260626000200). Copied VERBATIM except the one guard line and its inline
-- comment; RETURNS TABLE shape, org scope, soft-delete, status='active',
-- question_type='multiple_choice', 500-cap, and GRANT all unchanged. The COMMENT
-- is also updated here: discovery-backed Study now has its own active
-- quiz_sessions row (mig 137), so the "no session of its own" phrasing no longer
-- holds.

CREATE OR REPLACE FUNCTION get_study_questions(p_question_ids uuid[])
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

  -- Mid-exam answer-oracle guard. Study Mode DELIBERATELY returns correct_option_id,
  -- and mock/internal/VFR-RT exams grade from the SAME org MC pool. A student in a
  -- live exam already holds their exam's question IDs (get_quiz_questions /
  -- get_vfr_rt_exam_questions return q.id), so without this gate they could POST
  -- those IDs straight to this RPC (it is GRANTed to authenticated) and read the
  -- answer keys mid-exam — defeating the graded assessment and nullifying the
  -- practice-only guard in check_quiz_answer (mig 117). Enforce the single-active-
  -- session rule server-side: Study Mode is unavailable while ANY exam session is
  -- active. Practice modes (smart_review/quick_quiz) AND the caller's own discovery
  -- session (mig 137) are intentionally excluded — practice already reveals answers
  -- via check_quiz_answer, and the discovery row IS this flow's own session (the
  -- single-active-session invariant, mig 136, guarantees it cannot coexist with an
  -- exam). The UI also gates this, but the RPC must self-defend (the UI is
  -- bypassable). Phrased as deny-by-default (NOT IN the practice/discovery modes) to
  -- match check_quiz_answer's negative mode guard: any current OR future exam-like
  -- mode added to the quiz_sessions.mode CHECK is then blocked automatically, rather
  -- than fail-open the way a positive exam whitelist would.
  IF EXISTS (
    SELECT 1 FROM quiz_sessions s
    WHERE s.student_id = auth.uid()
      AND s.mode NOT IN ('smart_review', 'quick_quiz', 'discovery')
      AND s.ended_at IS NULL
      AND s.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'active_exam_session';
  END IF;

  -- Bound the caller-supplied array. This RPC is GRANTed to authenticated and
  -- reads an arbitrary p_question_ids, so a direct caller (bypassing the Server
  -- Action, whose Zod schema caps count at 500) could otherwise force an
  -- oversized ANY(...) scan + answer-key JSON aggregation. 500 mirrors
  -- get_random_question_ids / the start.ts Zod cap (CLAUDE.md "never trust
  -- client input"). Empty/NULL array is a no-op (the WHERE would match nothing
  -- anyway — fast-return before the JOINs).
  IF p_question_ids IS NULL OR cardinality(p_question_ids) = 0 THEN
    RETURN;
  END IF;
  IF cardinality(p_question_ids) > 500 THEN
    RAISE EXCEPTION 'too_many_questions';
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
  'Study Mode (feat/study-mode-mc): returns MC questions WITH the correct_option_id answer key and explanation, in STORED option order. DELIBERATE answer-key exposure — study mode shows the answer (no score; discovery-backed Study has its own active session row); exam integrity IS enforced by the active-exam-session guard (Study Mode is blocked mid-exam), not absent. SECURITY DEFINER reads the REVOKE-gated key column; correct_option_id is not exposed via any PostgREST GRANT. Reads by arbitrary p_question_ids, so §15 carve-out does NOT apply — deleted_at + status=active filters REQUIRED. Org/active-user gated (security.md rules 1, 7, 9, 11/12).';
