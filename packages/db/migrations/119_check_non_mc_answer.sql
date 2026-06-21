-- Migration 119: check_non_mc_answer — immediate-feedback grader for
-- short_answer and dialog_fill questions in practice (smart_review /
-- quick_quiz) sessions. Companion to check_quiz_answer (mig 117), which
-- handles multiple_choice.
--
-- Security surface:
--   Rule 1  — answer-key columns (canonical_answer, accepted_synonyms,
--              blanks_config) are REVOKE-gated from authenticated (mig 094).
--              SECURITY DEFINER runs as postgres, which bypasses that gate.
--              The practice-mode whitelist below ensures this RPC can never be
--              used as a mid-exam answer oracle (exam grading goes through
--              submit_vfr_rt_exam_answers exclusively).
--   Rule 7  — auth.uid() null-check is the first guard.
--   Rule 9  — no deleted_at filter on the question read (§15 carve-out, see
--              inline comment below).
--   Rule 11c — sibling-guard consistency: guard set mirrors check_quiz_answer
--              (mig 117) exactly — active-caller gate, session ownership,
--              practice-mode whitelist, config-shape guard, membership check.
--              This RPC joins the practice-grader family alongside
--              check_quiz_answer.
--   §15     — questions fetched via the immutable write-once
--              quiz_sessions.config.question_ids; membership verified before
--              any answer-key column is read.
--
-- Reveal model: returning canonical_answer / blanks canonicals on correct
-- AND incorrect answers is acceptable in practice mode — same posture as
-- check_quiz_answer returning correct_option_id immediately.
--
-- Depends on:
--   mig 094  (question_type, canonical_answer, accepted_synonyms,
--             blanks_config, dialog_template columns; REVOKE/GRANT on questions)
--   mig 101  (normalize_answer helper)

CREATE OR REPLACE FUNCTION check_non_mc_answer(
  p_question_id  uuid,
  p_session_id   uuid,
  p_response_text text DEFAULT NULL,
  p_blank_answers jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id         uuid := auth.uid();
  v_config             jsonb;
  v_mode               text;
  v_session_question_ids uuid[];

  -- question fields
  v_qtype              text;
  v_canonical          text;
  v_synonyms           text[];
  v_blanks             jsonb;
  v_explanation_text   text;
  v_explanation_image  text;

  -- grading state
  v_is_correct         boolean;
  v_blank_entry        jsonb;
  v_blank_index        int;
  v_blank_canonical    text;
  v_blank_synonyms     text[];
  v_blank_correct      boolean;
  v_all_correct        boolean;
  v_norm               text;

  -- result accumulators
  v_blank_results      jsonb;
  v_blank_result_row   jsonb;
BEGIN
  -- ── 1. Auth guard ────────────────────────────────────────────────────────
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- ── 2. Active-caller gate ────────────────────────────────────────────────
  -- Soft-deleted callers fail closed before any session read.
  -- Mirrors check_quiz_answer (mig 117) and submit_quiz_answer (mig 112).
  PERFORM 1
  FROM users
  WHERE id = v_student_id
    AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found_or_inactive';
  END IF;

  -- ── 3. Session ownership ─────────────────────────────────────────────────
  -- quiz_sessions has multiple permissive SELECT policies; the student_id
  -- predicate is mandatory (docs/security.md §3 / security.md rule 11).
  SELECT qs.config, qs.mode
  INTO v_config, v_mode
  FROM quiz_sessions qs
  WHERE qs.id         = p_session_id
    AND qs.student_id = v_student_id
    AND qs.ended_at   IS NULL
    AND qs.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found or not owned by this student';
  END IF;

  -- ── 4. Practice-mode whitelist ───────────────────────────────────────────
  -- Returns canonicals immediately, so exam-mode sessions are rejected to
  -- prevent use as a mid-exam answer oracle. Same reasoning as check_quiz_answer.
  IF v_mode NOT IN ('smart_review', 'quick_quiz') THEN
    RAISE EXCEPTION 'unsupported_session_mode';
  END IF;

  -- ── 5. Config-shape guard ────────────────────────────────────────────────
  -- jsonb_typeof(v_config->'question_ids') is NULL when the key is absent, and
  -- NULL <> 'array' is NULL (not true) — explicit IS NULL check required.
  IF v_config IS NULL
     OR v_config->'question_ids' IS NULL
     OR jsonb_typeof(v_config->'question_ids') <> 'array' THEN
    RAISE EXCEPTION 'session_config_malformed';
  END IF;

  -- ── 6. Membership check — MUST precede any answer-key column read ────────
  -- §15 ordering: membership verification gates the answer-key read so that
  -- this RPC cannot reveal canonicals for questions not in the caller's session.
  v_session_question_ids :=
    ARRAY(SELECT jsonb_array_elements_text(v_config->'question_ids'))::uuid[];

  IF NOT (p_question_id = ANY(v_session_question_ids)) THEN
    RAISE EXCEPTION 'question % does not belong to session %',
      p_question_id, p_session_id;
  END IF;

  -- ── 7. Fetch question row (answer-key columns) ───────────────────────────
  -- §15 carve-out: no deleted_at filter here — the question is accessed via
  -- the immutable write-once quiz_sessions.config.question_ids (membership
  -- verified above; locked at session start by trg_quiz_sessions_immutable_
  -- columns, mig 079), so a question soft-deleted mid-session must still be
  -- answerable for immediate feedback. See docs/security.md §15 and
  -- docs/database.md §3 "Scoring Soft-Deleted Questions".
  SELECT
    q.question_type,
    q.canonical_answer,
    q.accepted_synonyms,
    q.blanks_config,
    q.explanation_text,
    q.explanation_image_url
  INTO
    v_qtype,
    v_canonical,
    v_synonyms,
    v_blanks,
    v_explanation_text,
    v_explanation_image
  FROM questions q
  WHERE q.id = p_question_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'question_not_found';
  END IF;

  -- ── 8. Reject multiple_choice ─────────────────────────────────────────────
  -- MC answers go through check_quiz_answer (mig 117); this RPC handles only
  -- non-MC types.
  IF v_qtype = 'multiple_choice' THEN
    RAISE EXCEPTION 'unsupported_question_type';
  END IF;

  -- ── 9. Grade by question type ─────────────────────────────────────────────

  IF v_qtype = 'short_answer' THEN
    -- short_answer: p_response_text required, p_blank_answers must be NULL.
    IF p_response_text IS NULL OR p_blank_answers IS NOT NULL THEN
      RAISE EXCEPTION 'answer_type_mismatch';
    END IF;

    -- canonical_answer must be set (enforced by the DB CHECK but guard here
    -- so the error message is clear rather than returning is_correct=false).
    IF v_canonical IS NULL THEN
      RAISE EXCEPTION 'question_missing_canonical_answer';
    END IF;

    v_norm       := normalize_answer(p_response_text);
    v_is_correct := (v_norm <> '' AND (
      v_norm = COALESCE(normalize_answer(v_canonical), '')
      OR EXISTS (
        SELECT 1 FROM unnest(v_synonyms) AS s
        WHERE normalize_answer(s) = v_norm
      )
    ));

    RETURN jsonb_build_object(
      'is_correct',           v_is_correct,
      'correct_answer',       v_canonical,
      'blanks',               NULL,
      'explanation_text',     v_explanation_text,
      'explanation_image_url', v_explanation_image
    );

  ELSIF v_qtype = 'dialog_fill' THEN
    -- dialog_fill: p_blank_answers (jsonb array) required, p_response_text
    -- must be NULL.
    IF p_blank_answers IS NULL OR p_response_text IS NOT NULL THEN
      RAISE EXCEPTION 'answer_type_mismatch';
    END IF;

    IF jsonb_typeof(p_blank_answers) <> 'array' THEN
      RAISE EXCEPTION 'answer_type_mismatch';
    END IF;

    v_blank_results := '[]'::jsonb;
    v_all_correct   := true;

    FOR v_blank_entry IN SELECT * FROM jsonb_array_elements(p_blank_answers)
    LOOP
      -- Each element must be an object with integer blank_index and response_text.
      IF jsonb_typeof(v_blank_entry) <> 'object' THEN
        RAISE EXCEPTION 'invalid_blank_index';
      END IF;

      IF (v_blank_entry->>'blank_index') IS NULL
         OR (v_blank_entry->>'blank_index') !~ '^\d{1,4}$' THEN
        RAISE EXCEPTION 'invalid_blank_index';
      END IF;

      v_blank_index := (v_blank_entry->>'blank_index')::int;

      -- Look up this blank's canonical and synonyms from blanks_config.
      SELECT
        b->>'canonical',
        ARRAY(SELECT jsonb_array_elements_text(b->'synonyms'))
      INTO v_blank_canonical, v_blank_synonyms
      FROM jsonb_array_elements(v_blanks) AS b
      WHERE (b->>'index')::int = v_blank_index;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid_blank_index';
      END IF;

      -- Data-integrity guard mirroring the short_answer canonical NULL check
      -- above: no schema CHECK enforces a non-null canonical per blank.
      IF v_blank_canonical IS NULL THEN
        RAISE EXCEPTION 'question_blank_missing_canonical';
      END IF;

      v_norm        := normalize_answer(coalesce(v_blank_entry->>'response_text', ''));
      v_blank_correct := (v_norm <> '' AND (
        v_norm = COALESCE(normalize_answer(v_blank_canonical), '')
        OR EXISTS (
          SELECT 1 FROM unnest(v_blank_synonyms) AS s
          WHERE normalize_answer(s) = v_norm
        )
      ));

      IF NOT v_blank_correct THEN
        v_all_correct := false;
      END IF;

      v_blank_result_row := jsonb_build_object(
        'index',      v_blank_index,
        'is_correct', v_blank_correct,
        'canonical',  v_blank_canonical
      );
      v_blank_results := v_blank_results || jsonb_build_array(v_blank_result_row);
    END LOOP;

    -- Top-level is_correct = true iff EVERY blank in blanks_config was both
    -- answered AND correct (full coverage) — not merely that all *submitted*
    -- blanks were correct. A half-filled dialog must NOT read as "correct"
    -- (mirrors the exam grader's full-config denominator, mig 113). The
    -- DISTINCT count is duplicate-safe: two entries for one index can't fake
    -- coverage of a missing one.
    v_is_correct := v_all_correct AND (
      SELECT count(DISTINCT (e->>'blank_index')::int)
      FROM jsonb_array_elements(p_blank_answers) AS e
      WHERE (e->>'blank_index') ~ '^\d{1,4}$'
    ) = jsonb_array_length(v_blanks);

    RETURN jsonb_build_object(
      'is_correct',           v_is_correct,
      'correct_answer',       NULL,
      'blanks',               v_blank_results,
      'explanation_text',     v_explanation_text,
      'explanation_image_url', v_explanation_image
    );

  ELSE
    -- Future question types not yet handled.
    RAISE EXCEPTION 'unsupported_question_type';
  END IF;
END;
$$;

-- Re-grant explicitly so the migration is self-contained on a fresh db reset
-- (matches the sibling RPC pattern: check_quiz_answer mig 117, batch_submit_quiz
-- mig 112b, report RPCs migs 114/115).
-- Do NOT include answer-key columns in any separate column-level grant.
GRANT EXECUTE ON FUNCTION check_non_mc_answer(uuid, uuid, text, jsonb) TO authenticated;
