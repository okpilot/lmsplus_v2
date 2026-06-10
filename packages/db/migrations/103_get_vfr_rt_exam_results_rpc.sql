-- Migration 103: get_vfr_rt_exam_results(p_session_id) — gated results/review read
-- path for the VFR RT mock exam (#697, task A.9b; required for the Phase C results
-- page).
--
-- Why an RPC: per-part percentages are NOT persisted on quiz_sessions (only the
-- aggregate score_percentage), and the answer-key columns (canonical_answer,
-- accepted_synonyms, blanks_config) are privilege-blocked for the authenticated
-- role (mig 094 column REVOKE) and unconditionally stripped by
-- get_vfr_rt_exam_questions (mig 099b). A fresh load of
-- /app/vfr-rt-exam/results/<id> therefore needs this dedicated read.
-- Precedent: get_report_correct_options (supabase/migrations/20260316231503) — the
-- existing gated correct-answer reveal for MC reports; same guard-message wording.
--
-- Security model:
--   * auth.uid() guard (security.md §7).
--   * Session fetch scopes student_id = auth.uid() EXPLICITLY — quiz_sessions has
--     multiple permissive SELECT policies, so RLS alone over-scopes
--     (docs/security.md §3). Also requires mode = 'vfr_rt_exam', deleted_at IS
--     NULL, and ended_at IS NOT NULL.
--   * The answer-key reveal is safe ONLY because the ended_at IS NOT NULL guard
--     rejects every pre-completion call.
--   * Question lookups go via the session's config.question_ids (write-once at
--     session start) and the session's own quiz_session_answers rows — immutable
--     write-once exception, docs/security.md §15. Soft-deleted questions are still
--     returned for completed sessions (historical-record posture, same as
--     getQuizReportQuestions / get_report_correct_options).
--
-- Per-part percentages are RECOMPUTED from quiz_session_answers JOIN
-- questions.question_type with the mig 100 formulas (Part 1 = correct/8, Part 2 =
-- mean per-question blank fraction, Part 3 = correct/8; unanswered = 0) — single
-- source of truth, no per-part persistence.

CREATE OR REPLACE FUNCTION get_vfr_rt_exam_results(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid := auth.uid();
  v_config     jsonb;
  v_total      int;
  v_correct    int;
  v_p1         numeric;
  v_p2         numeric;
  v_p3         numeric;
  v_questions  jsonb;
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Active-user gate (#838): a soft-deleted account with a live JWT must not
  -- read its completed-session answer keys (family pattern, migs 099/099b/100).
  PERFORM 1
  FROM users u
  WHERE u.id = v_student_id AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found_or_inactive';
  END IF;

  SELECT qs.config, qs.total_questions
  INTO v_config, v_total
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id
    AND qs.student_id = v_student_id
    AND qs.mode = 'vfr_rt_exam'
    AND qs.deleted_at IS NULL
    AND qs.ended_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found, not owned, or not completed';
  END IF;

  -- Per-part percentages, mig 100 formulas. Each question's task score is
  -- correct_rows / total_blanks (total_blanks = 1 for short_answer and
  -- multiple_choice); unanswered questions contribute 0; the part percentage is
  -- the mean over ALL of the part's questions in config.question_ids.
  SELECT COALESCE(round(100 * avg(ts) FILTER (WHERE qt = 'short_answer'), 2), 0),
         COALESCE(round(100 * avg(ts) FILTER (WHERE qt = 'dialog_fill'), 2), 0),
         COALESCE(round(100 * avg(ts) FILTER (WHERE qt = 'multiple_choice'), 2), 0)
    INTO v_p1, v_p2, v_p3
    -- No q.deleted_at filter on the questions JOIN below: §15 carve-out via the
    -- immutable write-once config.question_ids (docs/security.md §15;
    -- docs/database.md §3 "Scoring Soft-Deleted Questions").
    FROM (SELECT q.question_type AS qt,
                 LEAST((SELECT count(*) FROM quiz_session_answers qsa
                        WHERE qsa.session_id = p_session_id
                          AND qsa.question_id = q.id AND qsa.is_correct)::numeric
                       / CASE WHEN q.question_type = 'dialog_fill'
                              THEN GREATEST(jsonb_array_length(q.blanks_config), 1)
                              ELSE 1 END, 1) AS ts
          FROM jsonb_array_elements_text(v_config->'question_ids') AS cfg(qid)
          JOIN questions q ON q.id = cfg.qid::uuid) per_q;

  SELECT count(*) FILTER (WHERE qsa.is_correct)::int
  INTO v_correct
  FROM quiz_session_answers qsa
  WHERE qsa.session_id = p_session_id;

  -- Review payload: one entry per session question, in config.question_ids order.
  -- 'answers' = the student's rows (selected_option_id for MC; response_text for
  -- short_answer; per-blank response_text + blank_index for dialog_fill), each
  -- with its is_correct. 'key' = the revealed answer key per type. The MC correct
  -- option id is extracted from the options JSONB the way the report path does
  -- (first option by array position with correct = true — see
  -- get_report_correct_options, supabase/migrations/20260316231503).
  WITH cfg AS (
    SELECT (e.qid)::uuid AS question_id, e.ord
    FROM jsonb_array_elements_text(v_config->'question_ids')
      WITH ORDINALITY AS e(qid, ord)
  ),
  ans AS (
    SELECT qsa.question_id,
           jsonb_agg(jsonb_build_object(
             'blank_index',        qsa.blank_index,
             'selected_option_id', qsa.selected_option_id,
             'response_text',      qsa.response_text,
             'is_correct',         qsa.is_correct
           ) ORDER BY qsa.blank_index NULLS FIRST) AS answers
    FROM quiz_session_answers qsa
    WHERE qsa.session_id = p_session_id
    GROUP BY qsa.question_id
  ),
  mc_key AS (
    SELECT DISTINCT ON (q.id)
      q.id AS question_id,
      (opt.value->>'id')::text AS correct_option_id
    FROM cfg
    -- No q.deleted_at filter: §15 carve-out via the immutable write-once
    -- config.question_ids (docs/security.md §15; docs/database.md §3
    -- "Scoring Soft-Deleted Questions").
    JOIN questions q ON q.id = cfg.question_id
    CROSS JOIN LATERAL jsonb_array_elements(q.options)
      WITH ORDINALITY AS opt(value, ord)
    WHERE q.question_type = 'multiple_choice'
      AND (opt.value->>'correct')::boolean = true
    ORDER BY q.id, opt.ord
  )
  SELECT jsonb_agg(jsonb_build_object(
           'question_id',   q.id,
           'question_type', q.question_type,
           'question_text', q.question_text,
           'answers',       COALESCE(ans.answers, '[]'::jsonb),
           'key',           CASE q.question_type
             WHEN 'short_answer' THEN jsonb_build_object(
               'canonical_answer',  q.canonical_answer,
               'accepted_synonyms', to_jsonb(q.accepted_synonyms))
             WHEN 'dialog_fill' THEN jsonb_build_object(
               'blanks', q.blanks_config)
             ELSE jsonb_build_object(
               'correct_option_id', mc.correct_option_id)
           END
         ) ORDER BY cfg.ord)
  INTO v_questions
  FROM cfg
  -- No q.deleted_at filter: soft-deleted questions must still appear in the
  -- historical review of a completed session (immutable write-once
  -- config.question_ids — docs/security.md §15; docs/database.md §3 "Scoring
  -- Soft-Deleted Questions").
  JOIN questions q ON q.id = cfg.question_id
  LEFT JOIN ans ON ans.question_id = q.id
  LEFT JOIN mc_key mc ON mc.question_id = q.id;

  RETURN jsonb_build_object(
    'part1_pct',       v_p1,
    'part2_pct',       v_p2,
    'part3_pct',       v_p3,
    'passed_overall',  (v_p1 >= 75 AND v_p2 >= 75 AND v_p3 >= 75),
    'passed_per_part', jsonb_build_object(
                         'part1', v_p1 >= 75,
                         'part2', v_p2 >= 75,
                         'part3', v_p3 >= 75),
    'correct_count',   COALESCE(v_correct, 0),
    'total_questions', v_total,
    'questions',       COALESCE(v_questions, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_vfr_rt_exam_results(uuid) TO authenticated;
