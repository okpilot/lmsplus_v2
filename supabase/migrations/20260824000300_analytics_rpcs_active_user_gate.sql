-- analytics student RPCs — the two members the #883 active-user-gate sweep missed, plus the
-- rule-9 soft-delete filter get_subject_scores never had.
--
-- Unnumbered, following 20260818000100 / 20260820000100 / 20260824000100 and its sibling
-- 20260824000200 in this same PR. The last NUMBERED header in the tree is 160
-- (20260815000300); application order comes from the timestamp prefix.
--
-- (a) Active-user gate (docs/security.md §11c, .claude/rules/security.md rule 12).
--     docs/security.md recorded the #883 sweep as having covered "every SECURITY DEFINER RPC
--     by family", finding four legacy read-RPCs and fixing all four. It missed four others: the
--     two internal-exam student readers (sibling migration 20260824000200) and these two.
--
--     Both carry only the auth.uid() null-check plus an `IS DISTINCT FROM p_student_id`
--     identity guard. Neither consults users.deleted_at, and deactivation via
--     toggle-student-status does not cascade to student_responses or quiz_sessions — so a
--     student soft-deleted while holding a still-valid JWT (up to ~1h) kept reading their own
--     activity heatmap and per-subject averages. Both functions are GRANTed to `authenticated`
--     (20260312000013 L37, L73), so the exposure does not depend on an app-layer caller: a
--     direct PostgREST rpc() call reaches them either way.
--
--     The gate form is copied from get_session_reports (mig 122, 20260623000100 L50-57),
--     including its `'user not found or inactive'` token — the space-separated spelling this
--     read-RPC family uses. It sits AFTER the identity guard and BEFORE the parameter clamp so
--     that a deactivated caller is told their account is inactive rather than that p_days is
--     out of range: authentication outcomes precede validation outcomes.
--
--     ALIAS `users u` in both. Unlike the internal-exam pair, neither RETURNS TABLE here
--     declares an `id` OUT param, so an unqualified `id` would NOT be ambiguous today — the
--     alias is DEFENSIVE, matching the family, and it keeps the gate copy-pasteable into a
--     function that does declare one (where the unqualified form raises 42702 at EXECUTION;
--     code-style.md §5).
--
-- (b) get_subject_scores aggregates quiz_sessions with no `deleted_at IS NULL` predicate, so a
--     soft-deleted session still moved the student's per-subject average. SECURITY DEFINER
--     functions are owned by postgres (BYPASSRLS), so RLS is not evaluated and the filter must
--     be manual — docs/security.md rule 9. easa_subjects has no deleted_at column, so the JOIN
--     to it carries no predicate. This CHANGES returned averages for any student with a
--     soft-deleted session; get_subject_scores has no production caller today, so the reachable
--     surface is a direct PostgREST call.
--
--     get_daily_activity reads only student_responses, which has no deleted_at column
--     (immutable table), and correctly needs no such filter.
--
-- Signatures, volatility (STABLE), the parameter clamps and the `IS DISTINCT FROM` identity
-- guard (Decision 24) are all preserved exactly, so CREATE OR REPLACE suffices for both. The
-- redundant in-query `WHERE auth.uid() = p_student_id` defense-in-depth clause is kept
-- deliberately — Decision 24 requires both layers. EXECUTE grants are re-asserted for
-- explicitness. No `mode` filter is added to get_subject_scores: that would be a behaviour
-- change beyond the security fix.

-- get_daily_activity(p_student_id, p_days)
-- Returns daily answer totals for the last N days, zero-filled via generate_series.
CREATE OR REPLACE FUNCTION public.get_daily_activity(
  p_student_id UUID,
  p_days INT DEFAULT 30
)
RETURNS TABLE (day DATE, total BIGINT, correct BIGINT, incorrect BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF auth.uid() IS DISTINCT FROM p_student_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Active-user gate (#883): a soft-deleted account with a live JWT must not keep reading its
  -- own activity history. Mirrors get_session_reports (mig 122). Alias `users u` is defensive
  -- here — this RETURNS TABLE declares no `id` OUT param, so `id` is not ambiguous today.
  PERFORM 1 FROM users u WHERE u.id = auth.uid() AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;

  IF p_days IS NULL OR p_days < 1 OR p_days > 365 THEN
    RAISE EXCEPTION 'p_days must be between 1 and 365';
  END IF;

  RETURN QUERY
  SELECT
    d.day::DATE,
    COALESCE(COUNT(sr.id), 0)                                        AS total,
    COALESCE(COUNT(sr.id) FILTER (WHERE sr.is_correct = TRUE),  0)  AS correct,
    COALESCE(COUNT(sr.id) FILTER (WHERE sr.is_correct = FALSE), 0)  AS incorrect
  FROM generate_series(
    (CURRENT_DATE - (p_days - 1)),
    CURRENT_DATE,
    '1 day'::INTERVAL
  ) AS d(day)
  LEFT JOIN student_responses sr
    ON  sr.student_id   = p_student_id
    AND sr.created_at::DATE = d.day::DATE
  WHERE auth.uid() = p_student_id
  GROUP BY d.day
  ORDER BY d.day;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_activity(UUID, INT) TO authenticated;

-- get_subject_scores(p_student_id, p_limit)
-- Returns average quiz scores for the N most recently tested subjects.
CREATE OR REPLACE FUNCTION public.get_subject_scores(
  p_student_id UUID,
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  subject_id    UUID,
  subject_name  TEXT,
  subject_short TEXT,
  avg_score     NUMERIC,
  session_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF auth.uid() IS DISTINCT FROM p_student_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Active-user gate (#883): see the header. Same form and token as get_daily_activity above.
  PERFORM 1 FROM users u WHERE u.id = auth.uid() AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 100';
  END IF;

  RETURN QUERY
  SELECT
    es.id                              AS subject_id,
    es.name                            AS subject_name,
    es.short                           AS subject_short,
    ROUND(AVG(qs.score_percentage), 1) AS avg_score,
    COUNT(qs.id)                       AS session_count
  FROM quiz_sessions qs
  JOIN easa_subjects es ON es.id = qs.subject_id
  WHERE qs.student_id      = p_student_id
    AND qs.ended_at        IS NOT NULL
    AND qs.score_percentage IS NOT NULL
    -- Soft-delete filter (docs/security.md rule 9): SECURITY DEFINER bypasses RLS, so a
    -- discarded session would otherwise still move the student's average. easa_subjects has
    -- no deleted_at column, so the JOIN to it carries no predicate.
    AND qs.deleted_at      IS NULL
    AND auth.uid()          = p_student_id
  GROUP BY es.id, es.name, es.short
  ORDER BY MAX(qs.started_at) DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_subject_scores(UUID, INT) TO authenticated;
