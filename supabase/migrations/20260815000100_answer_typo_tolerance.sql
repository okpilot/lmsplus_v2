-- Migration 142: tolerate spelling slips when grading typed answers.
--
-- A student who knows the phrase should not lose the mark to a keystroke: eval 2026-08-15 marked
-- "crossing of airfiled approved" wrong against "crossing of airfield approved". Grading compared
-- normalised strings for exact equality, so any typo failed.
--
-- Typo tolerance cannot live in normalize_answer(): normalisation produces a canonical form for ONE
-- string, whereas "is this a typo of that" is a pairwise question. So it goes in a comparison
-- helper, and every grader is repointed at it. All four text graders are changed together —
-- security.md rule 12 (sibling guard-set consistency): if only some tolerated typos, the same
-- answer would score in practice and fail in the exam.
--
-- DIGITS ARE NEVER FUZZY. In this domain a one-character difference is a different clearance, not a
-- slip: QNH 1014 vs 1015, runway 33 vs 32, squawk 6503 vs 6502, 118.0 vs 118.5. Any token
-- containing a digit must match exactly. Passing a wrong altimeter setting as correct is the one
-- outcome this feature must never produce.
--
-- Thresholds were measured, not guessed (fuzzystrmatch levenshtein, 2026-08-15):
--   lift/left = 1 and base/case = 1  -> 4-character words are one edit from a DIFFERENT word,
--                                       so nothing under 5 characters is fuzzy-matched at all.
--   depart/report = 2 at length 6    -> 2 edits are only allowed from 8 characters up.
--   airfiled/airfield = 2 at len 8   -> the case that prompted this, inside the budget.
-- A whole-answer budget of 2 stops a long phrase accumulating many small errors.
--
-- Redefines (bodies otherwise verbatim from their latest migrations, only the comparison changed):
--   _grade_record_short_answer, _grade_record_dialog_fill   (mig 120)
--   check_non_mc_answer                                     (mig 20260702000400)
--   submit_vfr_rt_exam_answers                              (mig 20260623000800)

CREATE EXTENSION IF NOT EXISTS fuzzystrmatch WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.answer_matches(p_norm_response text, p_candidate text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  b text; ta text[]; tb text[]; i int; j int; wa text; wb text; lim int; d int; spent int := 0;
BEGIN
  -- p_norm_response is ALREADY normalised by the caller; p_candidate is raw, so call sites stay
  -- one-liners and no grader had to be restructured.
  b := coalesce(normalize_answer(p_candidate), '');
  IF coalesce(p_norm_response, '') = '' OR b = '' THEN RETURN false; END IF;
  IF p_norm_response = b THEN RETURN true; END IF;

  ta := string_to_array(p_norm_response, ' ');
  tb := string_to_array(b, ' ');
  -- A different number of words is a different answer, never a typo.
  IF array_length(ta, 1) IS DISTINCT FROM array_length(tb, 1) THEN RETURN false; END IF;

  FOR i IN 1 .. array_length(tb, 1) LOOP
    wa := ta[i]; wb := tb[i];
    CONTINUE WHEN wa = wb;
    IF wa ~ '[0-9]' OR wb ~ '[0-9]' THEN RETURN false; END IF;
    lim := CASE WHEN length(wb) >= 8 THEN 2 WHEN length(wb) >= 5 THEN 1 ELSE 0 END;
    IF lim = 0 THEN RETURN false; END IF;
    d := extensions.levenshtein(wa, wb);
    -- Levenshtein charges 2 for a swapped pair, so 'sigth' vs 'sight' would fail at 5 characters
    -- even though it is the commonest typo of all. Count a SINGLE ADJACENT SWAP as one edit.
    -- Checked explicitly rather than by raising the threshold or comparing sorted letters: both of
    -- those also admit genuinely different words (depart/report is distance 2 at length 6).
    IF d = 2 AND length(wa) = length(wb) THEN
      FOR j IN 1 .. length(wb) - 1 LOOP
        IF overlay(wb placing substr(wb, j + 1, 1) || substr(wb, j, 1) from j for 2) = wa THEN
          d := 1;
          EXIT;
        END IF;
      END LOOP;
    END IF;
    IF d > lim THEN RETURN false; END IF;
    spent := spent + d;
    IF spent > 2 THEN RETURN false; END IF;
  END LOOP;

  RETURN true;
END;
$fn$;

COMMENT ON FUNCTION public.answer_matches(text, text) IS
  'Typo-tolerant answer comparison. Left arg is already normalised, right is raw. Tokens containing digits must match exactly.';

CREATE OR REPLACE FUNCTION _grade_record_short_answer(
  p_session_id    uuid,
  p_student_id    uuid,
  p_org_id        uuid,
  p_question_id   uuid,
  p_response_text text,
  p_canonical     text,
  p_synonyms      text[],
  p_response_time int
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm       text;
  v_is_correct boolean;
BEGIN
  -- Per-type correctness guard.
  IF p_canonical IS NULL THEN
    RAISE EXCEPTION 'question % has no canonical answer', p_question_id;
  END IF;

  -- coalesce to '' so a NULL/absent student answer grades as incorrect rather
  -- than yielding NULL is_correct (NOT NULL column → 23502). Mirrors the grader
  -- check_non_mc_answer (mig 119).
  v_norm := coalesce(normalize_answer(p_response_text), '');
  v_is_correct := (v_norm <> '' AND (
    public.answer_matches(v_norm, p_canonical)
    OR EXISTS (SELECT 1 FROM unnest(p_synonyms) AS s WHERE public.answer_matches(v_norm, s))
  ));

  -- blank_index NULL for short_answer (one row per question).
  INSERT INTO quiz_session_answers
    (session_id, question_id, response_text, is_correct, response_time_ms)
  VALUES
    (p_session_id, p_question_id, p_response_text, v_is_correct, p_response_time)
  ON CONFLICT (session_id, question_id, blank_index) DO NOTHING;

  INSERT INTO student_responses
    (organization_id, student_id, question_id, session_id,
     response_text, is_correct, response_time_ms)
  VALUES
    (p_org_id, p_student_id, p_question_id, p_session_id,
     p_response_text, v_is_correct, p_response_time)
  ON CONFLICT DO NOTHING;

  RETURN CASE WHEN v_is_correct THEN 1.0 ELSE 0.0 END;
END;
$$;

-- SECURITY: revoke anon/authenticated PostgREST access (Supabase default-grants
--   both via ALTER DEFAULT PRIVILEGES) — the dispatcher calls these as the
-- postgres owner. See file-header note.
REVOKE EXECUTE ON FUNCTION _grade_record_short_answer(uuid,uuid,uuid,uuid,text,text,text[],int) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION _grade_record_dialog_fill(
  p_session_id    uuid,
  p_student_id    uuid,
  p_org_id        uuid,
  p_question_id   uuid,
  p_blank_index   int,
  p_response_text text,
  p_blanks_config jsonb,
  p_response_time int
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blank_canonical text;
  v_blank_synonyms  text[];
  v_norm            text;
  v_is_correct      boolean;
BEGIN
  -- Per-type correctness guard: blank_index must exist in blanks_config.
  IF p_blank_index IS NULL OR p_blank_index < 0 THEN
    RAISE EXCEPTION 'invalid_blank_index for question %', p_question_id;
  END IF;

  SELECT b->>'canonical', ARRAY(SELECT jsonb_array_elements_text(b->'synonyms'))
  INTO v_blank_canonical, v_blank_synonyms
  FROM jsonb_array_elements(p_blanks_config) AS b
  WHERE (b->>'index')::int = p_blank_index;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_blank_index % not in blanks_config of question %',
      p_blank_index, p_question_id;
  END IF;

  -- Data-integrity guard mirroring _grade_record_short_answer's canonical NULL
  -- check (line ~117): no schema CHECK enforces a non-null canonical per blank,
  -- so a corrupt blanks_config entry would silently grade every answer wrong.
  IF v_blank_canonical IS NULL THEN
    RAISE EXCEPTION 'blank % of question % has no canonical answer',
      p_blank_index, p_question_id;
  END IF;

  -- coalesce to '' so a NULL/absent student answer grades as incorrect rather
  -- than yielding NULL is_correct (NOT NULL column → 23502). Mirrors the grader
  -- check_non_mc_answer (mig 119).
  v_norm := coalesce(normalize_answer(p_response_text), '');
  v_is_correct := (v_norm <> '' AND (
    public.answer_matches(v_norm, v_blank_canonical)
    OR EXISTS (SELECT 1 FROM unnest(v_blank_synonyms) AS s WHERE public.answer_matches(v_norm, s))
  ));

  -- One row per blank — blank_index is the differentiator in the 3-col UNIQUE.
  INSERT INTO quiz_session_answers
    (session_id, question_id, response_text, blank_index, is_correct, response_time_ms)
  VALUES
    (p_session_id, p_question_id, p_response_text, p_blank_index, v_is_correct, p_response_time)
  ON CONFLICT (session_id, question_id, blank_index) DO NOTHING;

  INSERT INTO student_responses
    (organization_id, student_id, question_id, session_id,
     response_text, blank_index, is_correct, response_time_ms)
  VALUES
    (p_org_id, p_student_id, p_question_id, p_session_id,
     p_response_text, p_blank_index, v_is_correct, p_response_time)
  ON CONFLICT DO NOTHING;

  RETURN CASE WHEN v_is_correct THEN 1.0 ELSE 0.0 END;
END;
$$;

-- SECURITY: revoke anon/authenticated PostgREST access (Supabase default-grants
--   both via ALTER DEFAULT PRIVILEGES) — the dispatcher calls these as the
-- postgres owner. See file-header note.
REVOKE EXECUTE ON FUNCTION _grade_record_dialog_fill(uuid,uuid,uuid,uuid,int,text,jsonb,int) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION check_non_mc_answer(
  p_question_id   uuid,
  p_session_id    uuid,
  p_response_text text  DEFAULT NULL,
  p_blank_answers jsonb DEFAULT NULL,
  p_order         jsonb DEFAULT NULL,
  p_mapping       jsonb DEFAULT NULL
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
  v_ordering_items     jsonb;
  v_diagram_config     jsonb;
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
  v_n                  int;
  v_i                  int;
  v_correct_order      jsonb;
  v_correct_mapping    jsonb;

  -- result accumulators
  v_blank_results      jsonb;
  v_blank_result_row   jsonb;
BEGIN
  -- ── 1. Auth guard ────────────────────────────────────────────────────────
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- ── 2. Active-caller gate ────────────────────────────────────────────────
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
  IF v_mode NOT IN ('smart_review', 'quick_quiz') THEN
    RAISE EXCEPTION 'unsupported_session_mode';
  END IF;

  -- ── 5. Config-shape guard ────────────────────────────────────────────────
  IF v_config IS NULL
     OR v_config->'question_ids' IS NULL
     OR jsonb_typeof(v_config->'question_ids') <> 'array' THEN
    RAISE EXCEPTION 'session_config_malformed';
  END IF;

  -- ── 6. Membership check — MUST precede any answer-key column read ────────
  v_session_question_ids :=
    ARRAY(SELECT jsonb_array_elements_text(v_config->'question_ids'))::uuid[];

  IF NOT (p_question_id = ANY(v_session_question_ids)) THEN
    RAISE EXCEPTION 'question % does not belong to session %',
      p_question_id, p_session_id;
  END IF;

  -- ── 7. Fetch question row (answer-key columns) ───────────────────────────
  -- §15 carve-out: no deleted_at filter — question reached via the immutable
  -- write-once quiz_sessions.config.question_ids (membership verified above).
  -- docs/security.md §15, docs/database.md §3.
  SELECT
    q.question_type,
    q.canonical_answer,
    q.accepted_synonyms,
    q.blanks_config,
    q.ordering_items,
    q.diagram_config,
    q.explanation_text,
    q.explanation_image_url
  INTO
    v_qtype,
    v_canonical,
    v_synonyms,
    v_blanks,
    v_ordering_items,
    v_diagram_config,
    v_explanation_text,
    v_explanation_image
  FROM questions q
  WHERE q.id = p_question_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'question_not_found';
  END IF;

  -- ── 8. Reject multiple_choice ─────────────────────────────────────────────
  IF v_qtype = 'multiple_choice' THEN
    RAISE EXCEPTION 'unsupported_question_type';
  END IF;

  -- ── 9. Grade by question type ─────────────────────────────────────────────

  IF v_qtype = 'short_answer' THEN
    IF p_response_text IS NULL OR p_blank_answers IS NOT NULL OR p_order IS NOT NULL
       OR p_mapping IS NOT NULL THEN
      RAISE EXCEPTION 'answer_type_mismatch';
    END IF;

    IF v_canonical IS NULL THEN
      RAISE EXCEPTION 'question_missing_canonical_answer';
    END IF;

    v_norm       := normalize_answer(p_response_text);
    v_is_correct := (v_norm <> '' AND (
      public.answer_matches(v_norm, v_canonical)
      OR EXISTS (
        SELECT 1 FROM unnest(v_synonyms) AS s
        WHERE public.answer_matches(v_norm, s)
      )
    ));

    RETURN jsonb_build_object(
      'is_correct',           v_is_correct,
      'correct_answer',       v_canonical,
      'blanks',               NULL,
      'correct_order',        NULL,
      'correct_mapping',      NULL,
      'explanation_text',     v_explanation_text,
      'explanation_image_url', v_explanation_image
    );

  ELSIF v_qtype = 'dialog_fill' THEN
    IF p_blank_answers IS NULL OR p_response_text IS NOT NULL OR p_order IS NOT NULL
       OR p_mapping IS NOT NULL THEN
      RAISE EXCEPTION 'answer_type_mismatch';
    END IF;

    IF jsonb_typeof(p_blank_answers) <> 'array' THEN
      RAISE EXCEPTION 'answer_type_mismatch';
    END IF;

    v_blank_results := '[]'::jsonb;
    v_all_correct   := true;

    FOR v_blank_entry IN SELECT * FROM jsonb_array_elements(p_blank_answers)
    LOOP
      IF jsonb_typeof(v_blank_entry) <> 'object' THEN
        RAISE EXCEPTION 'invalid_blank_index';
      END IF;

      IF (v_blank_entry->>'blank_index') IS NULL
         OR (v_blank_entry->>'blank_index') !~ '^\d{1,4}$' THEN
        RAISE EXCEPTION 'invalid_blank_index';
      END IF;

      v_blank_index := (v_blank_entry->>'blank_index')::int;

      SELECT
        b->>'canonical',
        ARRAY(SELECT jsonb_array_elements_text(b->'synonyms'))
      INTO v_blank_canonical, v_blank_synonyms
      FROM jsonb_array_elements(v_blanks) AS b
      WHERE (b->>'index')::int = v_blank_index;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'invalid_blank_index';
      END IF;

      IF v_blank_canonical IS NULL THEN
        RAISE EXCEPTION 'question_blank_missing_canonical';
      END IF;

      v_norm        := normalize_answer(coalesce(v_blank_entry->>'response_text', ''));
      v_blank_correct := (v_norm <> '' AND (
        public.answer_matches(v_norm, v_blank_canonical)
        OR EXISTS (
          SELECT 1 FROM unnest(v_blank_synonyms) AS s
          WHERE public.answer_matches(v_norm, s)
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

    v_is_correct := v_all_correct AND (
      SELECT count(DISTINCT (e->>'blank_index')::int)
      FROM jsonb_array_elements(p_blank_answers) AS e
      WHERE (e->>'blank_index') ~ '^\d{1,4}$'
    ) = jsonb_array_length(v_blanks);

    RETURN jsonb_build_object(
      'is_correct',           v_is_correct,
      'correct_answer',       NULL,
      'blanks',               v_blank_results,
      'correct_order',        NULL,
      'correct_mapping',      NULL,
      'explanation_text',     v_explanation_text,
      'explanation_image_url', v_explanation_image
    );

  ELSIF v_qtype = 'ordering' THEN
    -- ordering: p_order (jsonb array of item ids in the student's sequence)
    -- required; p_response_text + p_blank_answers + p_mapping must be NULL.
    IF p_order IS NULL OR p_response_text IS NOT NULL OR p_blank_answers IS NOT NULL
       OR p_mapping IS NOT NULL THEN
      RAISE EXCEPTION 'answer_type_mismatch';
    END IF;

    IF jsonb_typeof(p_order) <> 'array' THEN
      RAISE EXCEPTION 'answer_type_mismatch';
    END IF;

    -- Correct iff the submitted id sequence equals the canonical array order of
    -- ordering_items, element for element (full coverage — partial credit is a
    -- batch-submit / report concern, not immediate feedback's binary signal).
    v_n          := jsonb_array_length(v_ordering_items);
    v_is_correct := (jsonb_array_length(p_order) = v_n);
    IF v_is_correct THEN
      FOR v_i IN 0 .. v_n - 1 LOOP
        IF (p_order->>v_i) IS DISTINCT FROM (v_ordering_items->v_i->>'id') THEN
          v_is_correct := false;
          EXIT;
        END IF;
      END LOOP;
    END IF;

    -- Revealed canonical order = the item IDs in canonical array order. Ids are
    -- unambiguous; two items may share display text, so the client compares
    -- submitted ids against these per slot and maps each id back to its text.
    SELECT jsonb_agg(ord.elem->>'id' ORDER BY ord.idx)
    INTO v_correct_order
    FROM jsonb_array_elements(v_ordering_items) WITH ORDINALITY AS ord(elem, idx);

    RETURN jsonb_build_object(
      'is_correct',           v_is_correct,
      'correct_answer',       NULL,
      'blanks',               NULL,
      'correct_order',        v_correct_order,
      'correct_mapping',      NULL,
      'explanation_text',     v_explanation_text,
      'explanation_image_url', v_explanation_image
    );

  ELSIF v_qtype = 'diagram_label' THEN
    -- diagram_label: p_mapping (jsonb array of {zone_id,label_id} the student
    -- placed) required; p_response_text + p_blank_answers + p_order must be
    -- NULL. Correctness is a SET comparison (order in the array is
    -- meaningless, unlike ordering) — every zone must be covered exactly
    -- once and every submitted {zone_id,label_id} pair must match the
    -- canonical diagram_config.answer entry for that zone.
    IF p_mapping IS NULL OR p_response_text IS NOT NULL OR p_blank_answers IS NOT NULL
       OR p_order IS NOT NULL THEN
      RAISE EXCEPTION 'answer_type_mismatch';
    END IF;

    IF jsonb_typeof(p_mapping) <> 'array' THEN
      RAISE EXCEPTION 'answer_type_mismatch';
    END IF;

    -- Every element must be an object (mirrors the dialog_fill per-entry guard):
    -- a scalar element like [1,2,3] would otherwise resolve pm->>'zone_id' to NULL
    -- and grade as a silent wrong answer instead of a clean rejection.
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_mapping) AS pm
      WHERE jsonb_typeof(pm) <> 'object'
    ) THEN
      RAISE EXCEPTION 'answer_type_mismatch';
    END IF;

    v_n          := jsonb_array_length(v_diagram_config->'answer');
    v_is_correct := (
      jsonb_array_length(p_mapping) = v_n
      AND (
        SELECT count(DISTINCT pm->>'zone_id')
        FROM jsonb_array_elements(p_mapping) AS pm
      ) = v_n
      AND (
        SELECT count(*)
        FROM jsonb_array_elements(p_mapping) AS pm
        WHERE NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(v_diagram_config->'answer') AS ca
          WHERE ca->>'zone_id'  = pm->>'zone_id'
            AND ca->>'label_id' = pm->>'label_id'
        )
      ) = 0
    );

    -- Revealed canonical mapping = the raw {zone_id,label_id} answer array.
    -- The client already holds the full zones + labels arrays from the
    -- initial delivery (mig 152), so it resolves ids to display text/position
    -- locally — same posture as ordering's revealed id-only correct_order.
    v_correct_mapping := v_diagram_config->'answer';

    RETURN jsonb_build_object(
      'is_correct',           v_is_correct,
      'correct_answer',       NULL,
      'blanks',               NULL,
      'correct_order',        NULL,
      'correct_mapping',      v_correct_mapping,
      'explanation_text',     v_explanation_text,
      'explanation_image_url', v_explanation_image
    );

  ELSE
    RAISE EXCEPTION 'unsupported_question_type';
  END IF;
END;
$$;

-- Re-grant explicitly so the migration is self-contained on a fresh db reset.
-- Do NOT include answer-key columns in any separate column-level grant.
GRANT EXECUTE ON FUNCTION check_non_mc_answer(uuid, uuid, text, jsonb, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_vfr_rt_exam_answers(
  p_session_id uuid,
  p_answers    jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- caller / session state
  v_student_id uuid := auth.uid();
  v_actor_role text; v_org_id uuid; v_total int; v_config jsonb;
  v_ended_at timestamptz; v_correct_count int; v_passed boolean; v_already_ended boolean;
  v_time_limit int; v_started_at timestamptz;
  v_session_question_ids uuid[];
  v_replay_expired boolean := false;  -- #839: re-add expired flag on replay.
  -- ASSIGN ONLY inside `IF v_already_ended` below: the final RETURN is SHARED with
  -- the fresh-completion path, which must never carry expired (it stays false there).
  -- per-entry loop state
  v_answer jsonb; v_qid_text text; v_question_id uuid;
  v_selected text; v_response_text text; v_blank_text text; v_blank_index int; v_rt_text text;
  v_qtype text; v_canonical text; v_synonyms text[]; v_options jsonb; v_blanks jsonb;
  v_correct_option text; v_blank_canonical text; v_blank_synonyms text[];
  v_norm text; v_is_correct boolean;
  -- per-part results
  v_p1 numeric(5,2); v_p2 numeric(5,2); v_p3 numeric(5,2); v_score numeric(5,2);
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Cache actor role in a single deleted_at-filtered read; reused by the audit
  -- INSERT below (security.md rule 10 via the cached-role pattern, migs 087/088).
  SELECT u.role INTO v_actor_role
  FROM users u
  WHERE u.id = v_student_id AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found_or_inactive';
  END IF;

  -- Explicit ownership scope: quiz_sessions has multiple permissive SELECT
  -- policies, so the student_id predicate is mandatory (docs/security.md §3).
  SELECT qs.organization_id, qs.total_questions, qs.config, qs.ended_at,
         qs.correct_count, qs.passed, qs.time_limit_seconds, qs.started_at
  INTO v_org_id, v_total, v_config, v_ended_at, v_correct_count, v_passed,
       v_time_limit, v_started_at
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id
    AND qs.student_id = v_student_id
    AND qs.mode = 'vfr_rt_exam'
    AND qs.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found_or_not_accessible';
  END IF;

  v_already_ended := (v_ended_at IS NOT NULL);

  -- Timer-expiry guard (design.md § Migration 100 step 3b; pattern parity with
  -- batch_submit_quiz, mig 20260601000001 L99-125): a submit arriving past the
  -- time limit + 30s grace expires the session instead of grading it.
  IF NOT v_already_ended AND v_time_limit IS NOT NULL AND v_started_at IS NOT NULL THEN
    IF now() > v_started_at + (v_time_limit + 30) * interval '1 second' THEN
      UPDATE quiz_sessions
      SET ended_at = now(), correct_count = 0, score_percentage = 0, passed = false
      WHERE id = p_session_id;
      INSERT INTO audit_events
        (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
      VALUES (
        v_org_id, v_student_id, v_actor_role,
        'vfr_rt_exam.expired', 'quiz_session', p_session_id,
        jsonb_build_object('total_questions', v_total, 'answered_count', 0, 'correct_count', 0,
                           'passed', false, 'reason', 'submission past grace period')
      );
      RETURN jsonb_build_object(
        'session_id', p_session_id,
        'part1_pct', 0, 'part2_pct', 0, 'part3_pct', 0,
        'passed_overall', false, 'correct_count', 0,
        'total_questions', v_total, 'expired', true
      );
    END IF;
  END IF;

  IF v_config IS NULL OR v_config->'question_ids' IS NULL
     OR jsonb_typeof(v_config->'question_ids') <> 'array' THEN
    RAISE EXCEPTION 'session_config_malformed';
  END IF;
  v_session_question_ids := ARRAY(SELECT jsonb_array_elements_text(v_config->'question_ids'))::uuid[];

  IF NOT v_already_ended THEN
    IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array'
       OR jsonb_array_length(p_answers) = 0 THEN
      RAISE EXCEPTION 'invalid_answers_payload';
    END IF;

    -- One entry per (question_id, blank_index) — blank_index NULL for MC/short.
    -- Canonicalize numeric blank_index to integer text so "1" and "01" collide in this
    -- guard, matching the integer cast at insert time (v_blank_text::int, below). Without
    -- this they slip past the check and silently collapse at ON CONFLICT (#856, CR-local).
    IF (
      SELECT count(*) <> count(DISTINCT lower(coalesce(e->>'question_id', '')) || '#' || coalesce(
        CASE
          WHEN e ? 'blank_index' AND (e->>'blank_index') ~ '^\d{1,4}$'
            THEN ((e->>'blank_index')::int)::text
          ELSE e->>'blank_index'
        END, ''))
      FROM jsonb_array_elements(p_answers) AS e
    ) THEN
      RAISE EXCEPTION 'duplicate_answer_entry';
    END IF;

    FOR v_answer IN SELECT * FROM jsonb_array_elements(p_answers)
    LOOP
      IF jsonb_typeof(v_answer) <> 'object' THEN
        RAISE EXCEPTION 'invalid_answer_entry' USING DETAIL = 'entry is not an object';
      END IF;

      v_qid_text      := v_answer->>'question_id';
      v_selected      := v_answer->>'selected_option_id';
      v_response_text := v_answer->>'response_text';
      v_blank_text    := v_answer->>'blank_index';
      v_blank_index   := NULL;
      v_rt_text       := coalesce(v_answer->>'response_time_ms', '0');

      IF v_qid_text IS NULL OR v_qid_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'invalid_answer_entry' USING DETAIL = format('bad question_id: %s', coalesce(v_qid_text, 'NULL'));
      END IF;
      IF v_rt_text !~ '^\d{1,9}$' THEN
        RAISE EXCEPTION 'invalid_answer_entry' USING DETAIL = format('bad response_time_ms for question %s', v_qid_text);
      END IF;
      v_question_id := v_qid_text::uuid;

      IF NOT (v_question_id = ANY(v_session_question_ids)) THEN
        RAISE EXCEPTION 'invalid_question_id_for_session' USING DETAIL = format('question %s is not part of session %s', v_question_id, p_session_id);
      END IF;

      -- Frozen-ID read: IDs come from the write-once quiz_sessions.config.question_ids,
      -- so the immutable write-once exception applies — no deleted_at filter here
      -- (docs/security.md §15; docs/database.md §3 "Scoring Soft-Deleted
      -- Questions"; same posture as batch_submit_quiz's question reads).
      SELECT q.question_type, q.canonical_answer, q.accepted_synonyms, q.options, q.blanks_config, q.correct_option_id
      INTO v_qtype, v_canonical, v_synonyms, v_options, v_blanks, v_correct_option
      FROM questions q
      WHERE q.id = v_question_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'question_not_found' USING DETAIL = format('question %s', v_question_id);
      END IF;

      IF v_qtype = 'multiple_choice' THEN
        IF v_selected IS NULL OR v_response_text IS NOT NULL OR v_blank_text IS NOT NULL THEN
          RAISE EXCEPTION 'answer_type_mismatch' USING DETAIL = format('question %s is multiple_choice; entry must carry only selected_option_id', v_question_id);
        END IF;
        IF v_correct_option IS NULL THEN
          RAISE EXCEPTION 'question_missing_correct_option' USING DETAIL = format('question %s', v_question_id);
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(v_options) opt WHERE opt->>'id' = v_selected
        ) THEN
          RAISE EXCEPTION 'invalid_option_for_question' USING DETAIL = format('option %s does not belong to question %s', v_selected, v_question_id);
        END IF;
        v_is_correct := (v_selected = v_correct_option);

      ELSIF v_qtype = 'short_answer' THEN
        IF v_response_text IS NULL OR v_selected IS NOT NULL OR v_blank_text IS NOT NULL THEN
          RAISE EXCEPTION 'answer_type_mismatch' USING DETAIL = format('question %s is short_answer; entry must carry only response_text', v_question_id);
        END IF;
        -- §5(d): coalesce at the call site so a future guard regression can't leak
        -- NULL through `v_norm <> ''` into the NOT NULL is_correct columns (#950).
        v_norm := coalesce(normalize_answer(v_response_text), '');
        v_is_correct := (v_norm <> '' AND (
          public.answer_matches(v_norm, v_canonical)
          OR EXISTS (SELECT 1 FROM unnest(v_synonyms) AS s WHERE public.answer_matches(v_norm, s))
        ));

      ELSIF v_qtype = 'dialog_fill' THEN
        IF v_response_text IS NULL OR v_selected IS NOT NULL OR v_blank_text IS NULL THEN
          RAISE EXCEPTION 'answer_type_mismatch' USING DETAIL = format('question %s is dialog_fill; entry must carry response_text and blank_index', v_question_id);
        END IF;
        IF v_blank_text !~ '^\d{1,4}$' THEN
          RAISE EXCEPTION 'invalid_blank_index' USING DETAIL = format('bad blank_index %s for question %s', v_blank_text, v_question_id);
        END IF;
        v_blank_index := v_blank_text::int;
        SELECT b->>'canonical', ARRAY(SELECT jsonb_array_elements_text(b->'synonyms'))
        INTO v_blank_canonical, v_blank_synonyms
        FROM jsonb_array_elements(v_blanks) AS b
        WHERE (b->>'index')::int = v_blank_index;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'invalid_blank_index' USING DETAIL = format('blank_index %s not in blanks_config of question %s', v_blank_index, v_question_id);
        END IF;
        -- §5(d): coalesce at the call site (see short_answer branch above, #950).
        v_norm := coalesce(normalize_answer(v_response_text), '');
        v_is_correct := (v_norm <> '' AND (
          public.answer_matches(v_norm, v_blank_canonical)
          OR EXISTS (SELECT 1 FROM unnest(v_blank_synonyms) AS s WHERE public.answer_matches(v_norm, s))
        ));

      ELSE
        RAISE EXCEPTION 'unsupported_question_type' USING DETAIL = format('question %s has question_type %s', v_question_id, coalesce(v_qtype, 'NULL'));
      END IF;

      INSERT INTO quiz_session_answers
        (session_id, question_id, selected_option_id, response_text, blank_index, is_correct, response_time_ms)
      VALUES
        (p_session_id, v_question_id, v_selected, v_response_text, v_blank_index, v_is_correct, v_rt_text::int)
      ON CONFLICT (session_id, question_id, blank_index) DO NOTHING;

      INSERT INTO student_responses
        (organization_id, student_id, question_id, session_id,
         selected_option_id, response_text, blank_index, is_correct, response_time_ms)
      VALUES
        (v_org_id, v_student_id, v_question_id, p_session_id,
         v_selected, v_response_text, v_blank_index, v_is_correct, v_rt_text::int)
      ON CONFLICT (session_id, question_id, blank_index) DO NOTHING;
    END LOOP;
  END IF;

  -- Per-part scores from persisted rows — single source of truth for both the
  -- fresh path and the idempotent re-read. Frozen-ID questions read carries the
  -- immutable write-once exception (docs/security.md §15; docs/database.md §3)
  -- — no deleted_at filter.
  WITH session_questions AS (
    SELECT q.id, q.question_type,
           CASE WHEN q.question_type = 'dialog_fill'
                THEN greatest(jsonb_array_length(q.blanks_config), 1)
                ELSE 1 END AS total_blanks
    FROM questions q
    WHERE q.id = ANY(v_session_question_ids)
  ),
  graded AS (
    SELECT qsa.question_id, count(*) FILTER (WHERE qsa.is_correct)::int AS correct_rows
    FROM quiz_session_answers qsa
    WHERE qsa.session_id = p_session_id
    GROUP BY qsa.question_id
  )
  SELECT
    coalesce(round(100.0 * count(*) FILTER (WHERE sq.question_type = 'short_answer' AND coalesce(g.correct_rows, 0) >= 1)
             / nullif(count(*) FILTER (WHERE sq.question_type = 'short_answer'), 0), 2), 0),
    coalesce(round(100.0 * avg(LEAST(coalesce(g.correct_rows, 0)::numeric / sq.total_blanks, 1))
             FILTER (WHERE sq.question_type = 'dialog_fill'), 2), 0),
    coalesce(round(100.0 * count(*) FILTER (WHERE sq.question_type = 'multiple_choice' AND coalesce(g.correct_rows, 0) >= 1)
             / nullif(count(*) FILTER (WHERE sq.question_type = 'multiple_choice'), 0), 2), 0)
  INTO v_p1, v_p2, v_p3
  FROM session_questions sq
  LEFT JOIN graded g ON g.question_id = sq.id;

  IF v_already_ended THEN
    -- Idempotent replay: return the previously-computed result; write nothing.
    v_correct_count := coalesce(v_correct_count, 0);
    v_passed        := coalesce(v_passed, false);
    -- #839: re-emit expired:true on idempotent replay (the fresh timer-expiry path
    -- above returns it). Match ANY '<mode>.expired' audit event for this already-owned
    -- session (resource_id = p_session_id, scoped by the FOR UPDATE owner SELECT above).
    -- Only expiry paths write '*.expired' — the timer path here + complete_overdue_/
    -- empty_exam_session (mig 102), all mode-keyed (a vfr_rt session always emits
    -- 'vfr_rt_exam.expired'); non-overdue completions write '*.completed', which the
    -- suffix match excludes. Mode-agnostic so a new timed mode can't silently regress
    -- this (the #839 bug class). The timer path inserts no answer rows (→ zeroed replay);
    -- an overdue-WITH-answers completion (mig 102) keeps its rows → non-zero replay,
    -- still correctly flagged. audit_events is append-only — no deleted_at filter.
    SELECT EXISTS (
      SELECT 1 FROM audit_events
      WHERE resource_type = 'quiz_session'
        AND resource_id = p_session_id
        AND event_type LIKE '%.expired'
    ) INTO v_replay_expired;
  ELSE
    SELECT count(*) FILTER (WHERE qsa.is_correct)::int INTO v_correct_count
    FROM quiz_session_answers qsa
    WHERE qsa.session_id = p_session_id;

    v_passed := (v_p1 >= 75 AND v_p2 >= 75 AND v_p3 >= 75);
    v_score  := round((v_p1 + v_p2 + v_p3) / 3, 2);

    UPDATE quiz_sessions
    SET ended_at         = now(),
        correct_count    = v_correct_count,
        score_percentage = v_score,
        passed           = v_passed
    WHERE id = p_session_id;

    INSERT INTO audit_events
      (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
    VALUES (
      v_org_id, v_student_id, v_actor_role,
      'vfr_rt_exam.completed', 'quiz_session', p_session_id,
      jsonb_build_object(
        'part1_pct', v_p1,
        'part2_pct', v_p2,
        'part3_pct', v_p3,
        'passed_overall', v_passed,
        'total_questions', v_total
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'part1_pct', v_p1,
    'part2_pct', v_p2,
    'part3_pct', v_p3,
    'passed_overall', v_passed,
    'correct_count', v_correct_count,
    'total_questions', v_total
  ) || CASE WHEN v_replay_expired THEN jsonb_build_object('expired', true) ELSE '{}'::jsonb END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_vfr_rt_exam_answers(uuid, jsonb) TO authenticated;
