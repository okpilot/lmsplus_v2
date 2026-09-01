-- internal-exam student RPCs — answered_count counts QUESTIONS, not answer ITEMS, and both
-- functions gain the missing active-user gate.
--
-- Unnumbered, following 20260818000100 / 20260820000100 / 20260824000100. The last NUMBERED
-- header in the tree is 160 (20260815000300); application order comes from the timestamp
-- prefix, never from a header number.
--
-- (a) list_my_internal_exam_history (only prior definition: 20260521000003) counted
--     `count(*)` over quiz_session_answers. That table stores ONE ROW PER ANSWER ITEM, not
--     per question: dialog_fill writes one row per blank, ordering one per slot, diagram_label
--     one per zone (blank_index distinguishes them). So a session containing any non-MC
--     question reported an answered_count larger than its question count — and larger than
--     total_questions. count(DISTINCT qsa.question_id) is the per-question figure the column
--     name and its total_questions sibling mean. The `::int` cast is KEPT: the RETURNS TABLE
--     declares `answered_count int` and `COALESCE(a.answered_count, 0)` feeds that column, so
--     dropping the cast makes the CTE column bigint and raises 42804 at EXECUTION — a clean
--     `db reset` would not catch it (code-style.md §5 deferred validation).
--
-- (b) Both functions were missed by the #883 active-user-gate sweep (docs/security.md §11c,
--     .claude/rules/security.md rule 12 — sibling SECURITY DEFINER guard-set parity). Each had
--     only the auth.uid() null-check, so a student soft-deleted via toggle-student-status while
--     holding a still-valid JWT (up to ~1h) kept reading their internal-exam history and their
--     active exam codes: deactivation does not cascade to quiz_sessions or
--     internal_exam_codes, so the per-row student_id filter still matched. The gate form is
--     copied from get_session_reports (mig 122, 20260623000100 L50-57), including its
--     `'user not found or inactive'` token — the read-RPC family's space-separated spelling.
--     list_my_active_internal_exam_codes had no `users` read at all before this.
--
--     The #883 sweep was recorded as complete in docs/security.md, and was not: these two and
--     the two analytics RPCs were all missed. The sibling migration 20260824000300 in this same
--     PR closes get_daily_activity and get_subject_scores; docs/security.md §11c is rewritten
--     to carry the derivation rather than a closed enumeration.
--
--     ALIAS `users u` in both: each RETURNS TABLE declares an `id uuid` OUT param
--     (20260521000003 L9, 20260521000002 L9), so an unqualified `WHERE id = v_user_id` is
--     ambiguous between the OUT variable and users.id and raises 42702 at EXECUTION — again
--     invisible to a clean apply.
--
-- Return types are unchanged in both, so CREATE OR REPLACE suffices (no DROP). EXECUTE grants
-- are re-asserted for explicitness. Nothing else in either body is touched — in particular
-- list_my_active_internal_exam_codes still omits the plaintext `code` column by design (#577).

-- list_my_internal_exam_history()
-- Returns the current student's internal_exam quiz session history. Per-subject
-- attempt_number is computed via row_number() OVER ALL sessions (before the
-- LIMIT) so it remains stable when total attempts exceed the returned slice.
-- Closes issue #579 (TS-side counter restart at row 200).
CREATE OR REPLACE FUNCTION public.list_my_internal_exam_history()
RETURNS TABLE (
  id uuid,
  subject_id uuid,
  subject_name text,
  subject_short text,
  started_at timestamptz,
  ended_at timestamptz,
  score_percentage numeric,
  passed boolean,
  total_questions int,
  answered_count int,
  attempt_number int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Active-user gate (#883): a soft-deleted account with a live JWT must not keep
  -- reading its internal-exam history. Mirrors get_session_reports (mig 122) and
  -- get_report_correct_options (mig 114). Alias `users u` — the RETURNS TABLE declares
  -- an `id` OUT param, so an unqualified `id` here would be ambiguous (42702, §5(c)).
  PERFORM 1 FROM users u WHERE u.id = v_user_id AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;

  RETURN QUERY
  WITH numbered AS (
    SELECT
      qs.id,
      qs.subject_id,
      qs.started_at,
      qs.ended_at,
      qs.score_percentage,
      qs.passed,
      qs.total_questions,
      row_number() OVER (PARTITION BY qs.subject_id ORDER BY qs.started_at)::int AS attempt_number
    FROM public.quiz_sessions qs
    WHERE qs.student_id = v_user_id
      AND qs.mode = 'internal_exam'
      AND qs.deleted_at IS NULL
  ),
  answers AS (
    SELECT
      qsa.session_id,
      -- DISTINCT question_id: quiz_session_answers holds one row per answer ITEM
      -- (per blank / slot / zone for non-MC types), so count(*) overcounts questions.
      -- ::int is required — RETURNS TABLE declares answered_count int (42804 otherwise).
      count(DISTINCT qsa.question_id)::int AS answered_count
    FROM public.quiz_session_answers qsa
    WHERE qsa.session_id IN (SELECT n.id FROM numbered n)
    GROUP BY qsa.session_id
  )
  SELECT
    n.id,
    n.subject_id,
    s.name,
    s.short,
    n.started_at,
    n.ended_at,
    n.score_percentage,
    n.passed,
    n.total_questions,
    COALESCE(a.answered_count, 0),
    n.attempt_number
  FROM numbered n
  LEFT JOIN public.easa_subjects s
    ON s.id = n.subject_id
  LEFT JOIN answers a
    ON a.session_id = n.id
  ORDER BY n.started_at DESC
  LIMIT 200;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_internal_exam_history() TO authenticated;

-- list_my_active_internal_exam_codes()
-- Returns the current student's unconsumed, unvoided, unexpired internal-exam
-- codes WITHOUT the plaintext code value. Replaces the direct SELECT path
-- previously gated by the student_read_active_codes RLS policy (dropped in
-- migration 20260521000004). Closes issue #577.
CREATE OR REPLACE FUNCTION public.list_my_active_internal_exam_codes()
RETURNS TABLE (
  id uuid,
  subject_id uuid,
  subject_name text,
  subject_short text,
  expires_at timestamptz,
  issued_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Active-user gate (#883): a soft-deleted account with a live JWT must not keep
  -- listing its outstanding exam codes. Mirrors get_session_reports (mig 122). Alias
  -- `users u` — the RETURNS TABLE declares an `id` OUT param, so an unqualified `id`
  -- here would be ambiguous (42702, §5(c)).
  PERFORM 1 FROM users u WHERE u.id = v_user_id AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;

  RETURN QUERY
  SELECT
    iec.id,
    iec.subject_id,
    s.name,
    s.short,
    iec.expires_at,
    iec.issued_at
  FROM public.internal_exam_codes iec
  LEFT JOIN public.easa_subjects s
    ON s.id = iec.subject_id
  WHERE iec.student_id = v_user_id
    AND iec.consumed_at IS NULL
    AND iec.voided_at IS NULL
    AND iec.expires_at > now()
    AND iec.deleted_at IS NULL
  ORDER BY iec.expires_at ASC
  LIMIT 100;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_active_internal_exam_codes() TO authenticated;
