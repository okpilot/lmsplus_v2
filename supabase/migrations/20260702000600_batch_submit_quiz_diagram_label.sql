-- Migration 155: batch_submit_quiz dispatches the `diagram_label` question
-- type (VFR RT Training Phase 6 — #697). Body is mig 148's (the latest
-- definition), with four additions:
--   (1) diagram_config fetched into the _batch_questions temp table + a local
--       var (alongside ordering_items);
--   (2) an INVERTED self-defence check for diagram_label entries — see note
--       below (this REPLACES cloning ordering's complete-permutation check);
--   (3) a `diagram_label` dispatch branch calling _grade_record_diagram_label
--       (mig 154) once per submitted zone placement — label_id carried in
--       selected_option, zone_id carried in response_text (both opaque
--       string ids; diagram_label has no free-text response field, so
--       response_text is repurposed to carry the target zone id, mirroring
--       how ordering repurposes selected_option to carry an item id).
--       blank_index is REQUIRED on the entry (to satisfy the existing
--       (question_id, blank_index) dup-guard below, exactly like ordering's
--       slot) but is DISCARDED before calling the grader — the grader derives
--       the true zone ordinal itself from diagram_config.zones (mig 154);
--   (4) the total_blanks CASE gains a `diagram_label` branch
--       (greatest(jsonb_array_length(diagram_config->'zones'), 1)) so
--       per-zone rows fold into partial credit through the EXISTING
--       DISTINCT-question rollup.
--
-- INVERTED SELF-DEFENCE (Decision 52 — distractors + partial submission are
-- BOTH allowed for diagram_label, unlike ordering's forced full permutation):
-- ordering's self-defence (mig 148 L192-214) requires EXACTLY N entries
-- forming a complete permutation, because a partial/duplicate ordering
-- submission is meaningless (the whole point is total sequence). diagram_label
-- has no such requirement — a student may leave zones unanswered (partial
-- credit, same as an unanswered MC question) and unused labels are expected
-- (distractors, Decision 52). So the integrity key here is NOT cardinality —
-- it is: every submitted zone_id references a REAL zone on the question, no
-- zone is submitted twice (a chip cannot occupy two positions on the SAME
-- zone), and no label is submitted twice (a chip cannot be placed on two
-- DIFFERENT zones simultaneously — "consume on place"). Fewer than
-- jsonb_array_length(zones) entries is explicitly ALLOWED. A submitted
-- label_id that does not reference a real label is NOT caught here — that is
-- left to the per-zone grader (mig 154), which RAISEs and aborts the whole
-- batch on a forged/garbage id, exactly like ordering's per-slot grader.
--
-- ROLLUP INDEPENDENCE (unchanged from mig 148): in the aggregation below,
-- v_correct_count (sum correct_rows) and v_correct_credit (sum LEAST(
-- correct_rows/total_blanks, 1), the score numerator) are independent
-- SELECT-list exprs over the same join; the diagram_label total_blanks branch
-- feeds ONLY the credit denominator. CREATE OR REPLACE (signature unchanged).

CREATE OR REPLACE FUNCTION batch_submit_quiz(
  p_session_id uuid,
  p_answers    jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id      uuid := auth.uid();
  v_actor_role      text;
  v_org_id          uuid;
  v_config          jsonb;
  v_mode            text;
  v_answer          jsonb;
  v_is_correct      boolean;
  v_expl_text       text;
  v_expl_image_url  text;
  v_question_id     uuid;
  v_results         jsonb := '[]'::jsonb;
  v_total           int;
  v_answered        int;
  v_correct_count   int;     -- correct item (blank/slot/zone-row) count (integer; stored column)
  v_correct_credit  numeric; -- partial-credit sum (numeric; score numerator — Decision 47)
  v_score           numeric(5,2);
  v_session_question_ids uuid[];
  v_qid_text        text;
  v_rt_text         text;
  v_ended_at        timestamptz;
  v_passed          boolean;
  v_pass_mark       int;
  v_time_limit      int;
  v_started_at      timestamptz;
  v_expired_event   text;
  v_completed_event text;
  v_response_time   int;
  v_qtype           text;
  v_selected        text;
  v_response_text   text;
  v_blank_text      text;
  v_blank_index     int;
  v_correct_option  text;
  v_options         jsonb;
  v_canonical       text;
  v_synonyms        text[];
  v_blanks          jsonb;
  v_ordering_items  jsonb;
  v_diagram_config  jsonb;
  v_fraction        numeric;
  v_replay_expired  boolean := false;  -- #839: re-add expired flag on replay
BEGIN
  IF v_student_id IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  -- Active-caller gate (rule 7) — caches actor_role for audit INSERT (rule 10).
  SELECT role INTO v_actor_role
  FROM users WHERE id = v_student_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found or inactive'; END IF;

  -- Session ownership + FOR UPDATE (rule 11 — quiz_sessions has multiple
  -- permissive SELECT policies; explicit student_id scope required).
  SELECT qs.organization_id, qs.total_questions, qs.config, qs.ended_at,
         qs.correct_count, qs.score_percentage, qs.mode,
         qs.time_limit_seconds, qs.started_at, qs.passed
  INTO v_org_id, v_total, v_config, v_ended_at, v_correct_count, v_score, v_mode,
       v_time_limit, v_started_at, v_passed
  FROM quiz_sessions qs
  WHERE qs.id = p_session_id
    AND qs.student_id = v_student_id
    AND qs.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session not found or not accessible'; END IF;

  IF v_mode NOT IN ('smart_review', 'quick_quiz', 'mock_exam', 'internal_exam') THEN
    RAISE EXCEPTION 'unsupported_session_mode';
  END IF;

  -- Completed-session idempotent replay.
  IF v_ended_at IS NOT NULL THEN
    SELECT count(DISTINCT qsa.question_id)::int INTO v_answered
    FROM quiz_session_answers qsa WHERE qsa.session_id = p_session_id;
    -- §15 carve-out: no deleted_at filter — replay reads questions via the immutable,
    -- append-only quiz_session_answers.question_id write-once FK (not config.question_ids);
    -- docs/security.md §15, docs/database.md §3.
    SELECT jsonb_agg(jsonb_build_object(
      'question_id',           qsa.question_id,
      'is_correct',            qsa.is_correct,
      'correct_option_id',     q.correct_option_id,
      'explanation_text',      q.explanation_text,
      'explanation_image_url', q.explanation_image_url
    )) INTO v_results
    FROM quiz_session_answers qsa
    JOIN questions q ON q.id = qsa.question_id
    WHERE qsa.session_id = p_session_id;
    -- #839: re-emit expired:true on idempotent replay. Match ANY '<mode>.expired'
    -- audit event for this already-owned session. audit_events is append-only.
    SELECT EXISTS (
      SELECT 1 FROM audit_events
      WHERE resource_type = 'quiz_session'
        AND resource_id = p_session_id
        AND event_type LIKE '%.expired'
    ) INTO v_replay_expired;
    RETURN jsonb_build_object(
      'results', COALESCE(v_results, '[]'::jsonb),
      'total_questions', v_total, 'answered_count', v_answered,
      'correct_count', v_correct_count, 'score_percentage', v_score, 'passed', v_passed
    ) || CASE WHEN v_replay_expired THEN jsonb_build_object('expired', true) ELSE '{}'::jsonb END;
  END IF;

  -- Timer-expiry guard (30 s grace, parity with mig 112b).
  IF v_time_limit IS NOT NULL AND v_started_at IS NOT NULL THEN
    IF now() > v_started_at + (v_time_limit + 30) * interval '1 second' THEN
      UPDATE quiz_sessions
      SET ended_at = now(), correct_count = 0, score_percentage = 0, passed = false
      WHERE id = p_session_id;
      v_expired_event := CASE v_mode
        WHEN 'internal_exam' THEN 'internal_exam.expired' ELSE 'exam.expired' END;
      INSERT INTO audit_events
        (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
      VALUES (v_org_id, v_student_id, v_actor_role, v_expired_event, 'quiz_session', p_session_id,
        jsonb_build_object('total_questions', v_total, 'reason', 'submission past grace period'));
      RETURN jsonb_build_object('results', '[]'::jsonb, 'total_questions', v_total,
        'answered_count', 0, 'correct_count', 0, 'score_percentage', 0,
        'passed', false, 'expired', true);
    END IF;
  END IF;

  IF v_config IS NULL OR v_config->'question_ids' IS NULL
     OR jsonb_typeof(v_config->'question_ids') <> 'array' THEN
    RAISE EXCEPTION 'session config is malformed — question_ids not set';
  END IF;
  v_session_question_ids :=
    ARRAY(SELECT jsonb_array_elements_text(v_config->'question_ids'))::uuid[];

  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array'
     OR jsonb_array_length(p_answers) = 0 THEN
    RAISE EXCEPTION 'answers must be a non-empty JSON array';
  END IF;

  -- Duplicate guard on (question_id, blank_index): MC/short_answer carry blank_index
  -- NULL (one entry per question); dialog_fill/ordering/diagram_label have one entry
  -- per blank/slot/zone. Canonicalize "1"/"01" → same int string (matches insert-time
  -- ::int cast).
  IF (
    SELECT count(*) <> count(DISTINCT
      lower(coalesce(e->>'question_id', '')) || '#' || coalesce(
        CASE WHEN e ? 'blank_index' AND (e->>'blank_index') ~ '^\d{1,4}$'
             THEN ((e->>'blank_index')::int)::text
             ELSE e->>'blank_index' END, ''))
    FROM jsonb_array_elements(p_answers) AS e
  ) THEN
    RAISE EXCEPTION 'duplicate question_id (or question_id+blank_index) in answers payload';
  END IF;

  -- §15 carve-out: no deleted_at filter — immutable write-once config.question_ids (mig 079); docs/security.md §15, docs/database.md §3.
  DROP TABLE IF EXISTS _batch_questions;
  CREATE TEMP TABLE _batch_questions ON COMMIT DROP AS
  SELECT q.id, q.question_type,
         q.correct_option_id  AS correct_option,
         q.canonical_answer,
         q.accepted_synonyms,
         q.blanks_config,
         q.ordering_items,
         q.diagram_config,
         q.explanation_text,
         q.explanation_image_url,
         q.options
  FROM questions q WHERE q.id = ANY(v_session_question_ids);

  -- Ordering self-defence (#998 CR #466): each ordering question's submitted entries
  -- must form a COMPLETE permutation of its N items — exactly N entries with N DISTINCT
  -- item ids. The per-slot grader (mig 147) rejects an id absent from ordering_items but
  -- cannot see the whole payload, and the (question_id, blank_index) guard above only
  -- ensures distinct slots; count(*) = N AND count(DISTINCT selected_option) = N together
  -- force a bijection, so a forged dup-item-id-across-slots or subset-of-slots payload
  -- cannot persist an impossible state into the immutable quiz_session_answers /
  -- student_responses tables. A skipped ordering question contributes zero entries and is
  -- simply absent here — only questions actually present in p_answers are checked. The
  -- lower()/::text join mirrors the dup guard's case-folding; a malformed (non-uuid)
  -- question_id matches no row here and is caught by the per-row guard in the loop below.
  IF EXISTS (
    SELECT 1
    FROM _batch_questions bq
    JOIN jsonb_array_elements(p_answers) AS a
      ON lower(a->>'question_id') = bq.id::text
    WHERE bq.question_type = 'ordering'
    GROUP BY bq.id, bq.ordering_items
    HAVING count(*) <> jsonb_array_length(bq.ordering_items)
        OR count(DISTINCT a->>'selected_option') <> jsonb_array_length(bq.ordering_items)
  ) THEN
    RAISE EXCEPTION 'ordering answer is not a complete permutation of its items';
  END IF;

  -- diagram_label self-defence (INVERTED — see file header): partial submissions
  -- and unused (distractor) labels are ALLOWED, so there is no cardinality
  -- requirement. The integrity key is DISTINCT zone_id: every submitted zone_id
  -- (response_text) must reference a real zone on the question, no zone_id is
  -- submitted twice, and no label_id (selected_option) is submitted twice (a
  -- chip cannot be placed on two zones at once). A submitted label_id that does
  -- not reference a real label is left to the per-zone grader (mig 154), which
  -- RAISEs and aborts the batch on a forged id.
  IF EXISTS (
    SELECT 1
    FROM _batch_questions bq
    JOIN jsonb_array_elements(p_answers) AS a
      ON lower(a->>'question_id') = bq.id::text
    WHERE bq.question_type = 'diagram_label'
    GROUP BY bq.id, bq.diagram_config
    HAVING count(*) FILTER (
             WHERE NOT EXISTS (
               SELECT 1
               FROM jsonb_array_elements(bq.diagram_config->'zones') AS z
               WHERE z->>'id' = a->>'response_text'
             )
           ) > 0
        OR count(DISTINCT a->>'response_text') <> count(*)
        OR count(DISTINCT a->>'selected_option') <> count(*)
  ) THEN
    RAISE EXCEPTION 'diagram answer references an unknown zone, or duplicates a zone/label placement';
  END IF;

  FOR v_answer IN SELECT * FROM jsonb_array_elements(p_answers)
  LOOP
    v_qid_text      := v_answer->>'question_id';
    v_selected      := v_answer->>'selected_option';
    v_response_text := v_answer->>'response_text';
    v_blank_text    := v_answer->>'blank_index';
    v_rt_text       := coalesce(v_answer->>'response_time_ms', '0');

    IF v_qid_text IS NULL OR v_qid_text
       !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'invalid question_id format: %', coalesce(v_qid_text, 'NULL');
    END IF;
    IF v_rt_text !~ '^\d{1,9}$' THEN
      RAISE EXCEPTION 'answer for question % has invalid response_time_ms', v_qid_text;
    END IF;
    v_question_id   := v_qid_text::uuid;
    v_response_time := v_rt_text::int;
    v_blank_index   := NULL;
    IF v_blank_text IS NOT NULL AND v_blank_text ~ '^\d{1,4}$' THEN
      v_blank_index := v_blank_text::int;
    END IF;

    IF NOT (v_question_id = ANY(v_session_question_ids)) THEN
      RAISE EXCEPTION 'question % does not belong to session %', v_question_id, p_session_id;
    END IF;

    SELECT bq.question_type, bq.correct_option, bq.canonical_answer,
           bq.accepted_synonyms, bq.blanks_config, bq.ordering_items, bq.diagram_config,
           bq.explanation_text, bq.explanation_image_url, bq.options
    INTO v_qtype, v_correct_option, v_canonical, v_synonyms, v_blanks, v_ordering_items,
         v_diagram_config, v_expl_text, v_expl_image_url, v_options
    FROM _batch_questions bq WHERE bq.id = v_question_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'question not found: %', v_question_id; END IF;

    IF v_qtype = 'multiple_choice' THEN
      v_fraction := _grade_record_mc(
        p_session_id, v_student_id, v_org_id, v_question_id,
        v_selected, v_correct_option, v_options,
        v_response_time);
    ELSIF v_qtype = 'short_answer' THEN
      v_fraction := _grade_record_short_answer(
        p_session_id, v_student_id, v_org_id, v_question_id,
        v_response_text, v_canonical, v_synonyms,
        v_response_time);
    ELSIF v_qtype = 'dialog_fill' THEN
      IF v_blank_index IS NULL THEN
        RAISE EXCEPTION 'dialog_fill entry for question % missing blank_index', v_question_id;
      END IF;
      v_fraction := _grade_record_dialog_fill(
        p_session_id, v_student_id, v_org_id, v_question_id,
        v_blank_index, v_response_text, v_blanks,
        v_response_time);
    ELSIF v_qtype = 'ordering' THEN
      -- One entry per slot: slot in blank_index, item id in selected_option.
      IF v_blank_index IS NULL THEN
        RAISE EXCEPTION 'ordering entry for question % missing slot (blank_index)', v_question_id;
      END IF;
      v_fraction := _grade_record_ordering(
        p_session_id, v_student_id, v_org_id, v_question_id,
        v_blank_index, v_selected, v_ordering_items,
        v_response_time);
    ELSIF v_qtype = 'diagram_label' THEN
      -- One entry per zone placement: zone id in response_text, label id in
      -- selected_option. blank_index is required ONLY to satisfy the
      -- (question_id, blank_index) dup-guard above — it is NOT passed to the
      -- grader, which derives the true zone ordinal itself (mig 154).
      IF v_blank_index IS NULL THEN
        RAISE EXCEPTION 'diagram entry for question % missing dedup index (blank_index)', v_question_id;
      END IF;
      v_fraction := _grade_record_diagram_label(
        p_session_id, v_student_id, v_org_id, v_question_id,
        v_response_text, v_selected, v_diagram_config,
        v_response_time);
    ELSE
      RAISE EXCEPTION 'unsupported question type % for question %', v_qtype, v_question_id;
    END IF;

    v_is_correct := (v_fraction = 1.0);
    v_results := v_results || jsonb_build_object(
      'question_id',           v_question_id,
      'is_correct',            v_is_correct,
      'correct_option_id',     v_correct_option,
      'explanation_text',      v_expl_text,
      'explanation_image_url', v_expl_image_url
    );
  END LOOP;

  -- DISTINCT-question score aggregation: dialog_fill + ordering + diagram_label
  -- fold per-blank/slot/zone rows into partial credit (v_correct_credit = numeric
  -- sum, score numerator, Decision 47/51/52); v_correct_count = integer correct
  -- item (blank/slot/zone-row) count stored in quiz_sessions.correct_count. The
  -- two are INDEPENDENT exprs over the same join — the diagram_label total_blanks
  -- branch feeds only the credit denominator.
  -- §15 carve-out: no deleted_at filter — immutable write-once config.question_ids (mig 079); docs/security.md §15, docs/database.md §3.
  WITH session_questions AS (
    SELECT q.id AS question_id,
           CASE WHEN q.question_type = 'dialog_fill'
                THEN greatest(jsonb_array_length(q.blanks_config), 1)
                WHEN q.question_type = 'ordering'
                THEN greatest(jsonb_array_length(q.ordering_items), 1)
                WHEN q.question_type = 'diagram_label'
                THEN greatest(jsonb_array_length(q.diagram_config->'zones'), 1)
                ELSE 1 END AS total_blanks
    FROM questions q WHERE q.id = ANY(v_session_question_ids)
  ),
  graded AS (
    SELECT qsa.question_id,
           count(*) FILTER (WHERE qsa.is_correct)::int AS correct_rows
    FROM quiz_session_answers qsa
    WHERE qsa.session_id = p_session_id
    GROUP BY qsa.question_id
  )
  SELECT
    count(DISTINCT sq.question_id)::int,
    coalesce(sum(LEAST(coalesce(g.correct_rows, 0)::numeric / sq.total_blanks, 1.0)), 0),
    coalesce(sum(coalesce(g.correct_rows, 0)), 0)::int
  INTO v_answered, v_correct_credit, v_correct_count
  FROM session_questions sq
  JOIN graded g ON g.question_id = sq.question_id;  -- only answered questions

  IF v_mode IN ('mock_exam', 'internal_exam') THEN
    v_score := CASE WHEN v_total > 0
      THEN round((v_correct_credit / v_total) * 100, 2) ELSE 0 END;
  ELSE
    v_score := CASE WHEN v_answered > 0
      THEN round((v_correct_credit / v_answered) * 100, 2) ELSE 0 END;
  END IF;

  IF v_mode IN ('mock_exam', 'internal_exam') THEN
    v_pass_mark := (v_config->>'pass_mark')::int;
    v_passed    := CASE WHEN v_pass_mark IS NOT NULL THEN (v_score >= v_pass_mark) ELSE false END;
    IF v_mode = 'mock_exam' AND v_answered < v_total THEN v_passed := false; END IF;
  END IF;

  UPDATE quiz_sessions
  SET ended_at = now(), correct_count = v_correct_count,
      score_percentage = v_score, passed = v_passed
  WHERE id = p_session_id;

  v_completed_event := CASE v_mode
    WHEN 'mock_exam' THEN 'exam.completed'
    WHEN 'internal_exam' THEN 'internal_exam.completed'
    ELSE 'quiz_session.batch_submitted' END;
  -- actor_id/actor_role/org_id cached from deleted_at-filtered reads above
  -- (security.md rule 10 audit-subquery soft-delete).
  INSERT INTO audit_events
    (organization_id, actor_id, actor_role, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id, v_student_id, v_actor_role,
    v_completed_event, 'quiz_session', p_session_id,
    jsonb_build_object(
      'total_questions', v_total, 'answered_count', v_answered,
      'correct_count', v_correct_count, 'score', v_score, 'passed', v_passed
    )
  );

  RETURN jsonb_build_object(
    'results', v_results, 'total_questions', v_total,
    'answered_count', v_answered, 'correct_count', v_correct_count,
    'score_percentage', v_score, 'passed', v_passed
  );
END;
$$;

GRANT EXECUTE ON FUNCTION batch_submit_quiz(uuid, jsonb) TO authenticated;
