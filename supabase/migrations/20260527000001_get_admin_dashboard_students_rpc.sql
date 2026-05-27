-- Migration: get_admin_dashboard_students — server-side roster for the admin dashboard.
--
-- Fixes #682 (last P0 of umbrella #668). The previous implementation
-- (lib admin/dashboard/queries.ts getDashboardStudents) fetched the full org roster
-- via `users` AND called get_admin_student_stats() (RETURNS TABLE, no LIMIT), then
-- merged + sorted + sliced in TypeScript. Both reads truncated at PostgREST
-- max_rows = 1000, dropping students beyond row 1000 and reporting a wrong pagination
-- total (count of fetched rows, not the true org roster). This RPC moves the entire
-- join + filter + sort + paginate + count into Postgres so no client read is capped.
--
-- Mastery/session semantics are IDENTICAL to the dropped get_admin_student_stats
-- (mig 20260408000007): org-wide active-question denominator, completed non-deleted
-- sessions, distinct correct questions. Only the sort/filter/paginate/count wrapper
-- is new.
--
-- Dynamic ORDER BY follows the get_session_reports precedent (mig 20260429000011):
-- p_sort/p_dir never reach SQL — p_sort is matched against a literal whitelist (CASE)
-- and p_dir is normalised to 'ASC'/'DESC'. v_order concatenates only hardcoded column
-- identifiers with the normalised direction, so EXECUTE carries no caller-supplied text.
--
-- NOTE on STABLE + EXECUTE: verified on PG 17.6 that a STABLE plpgsql function may run
-- read-only `RETURN QUERY EXECUTE` (only data *modification* is restricted in non-VOLATILE
-- functions). STABLE is the correct volatility for this read-only RPC and matches the
-- function it replaces.

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_students(
  p_status TEXT DEFAULT NULL,
  p_sort   TEXT DEFAULT 'name',
  p_dir    TEXT DEFAULT 'asc',
  p_limit  INT  DEFAULT 10,
  p_offset INT  DEFAULT 0
)
RETURNS TABLE (
  id             UUID,
  full_name      TEXT,
  email          TEXT,
  last_active_at TIMESTAMPTZ,
  deleted_at     TIMESTAMPTZ,
  session_count  BIGINT,
  avg_score      NUMERIC,
  mastery        NUMERIC,
  total_count    BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid             UUID := auth.uid();
  v_org_id          UUID;
  v_total_questions BIGINT;
  v_dir             TEXT;
  v_order           TEXT;
BEGIN
  -- Auth + admin check (security.md §7)
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Resolve caller's org (admin's own profile must be active). Org is derived from
  -- auth.uid(), never passed as a parameter (security.md §11 admin-RPC requirement).
  -- Columns are table-qualified: id/deleted_at are also RETURNS TABLE output variables,
  -- so bare references would be ambiguous (column vs OUT param).
  SELECT u.organization_id INTO v_org_id
  FROM users u WHERE u.id = v_uid AND u.deleted_at IS NULL;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  -- Org-wide active-question denominator for mastery (identical to the dropped
  -- get_admin_student_stats — preserves the exact mastery values the dashboard shows).
  SELECT COUNT(DISTINCT q.id) INTO v_total_questions
  FROM questions q
  WHERE q.organization_id = v_org_id AND q.status = 'active' AND q.deleted_at IS NULL;

  -- Normalise direction to a safe literal; default DESC for any non-'asc' input.
  v_dir := CASE WHEN lower(p_dir) = 'asc' THEN 'ASC' ELSE 'DESC' END;

  -- Whitelist the sort column. Unknown keys fall back to a deterministic id sort.
  -- sort_name / sort_avg are roster helper columns that replicate the prior TS sort
  -- semantics (NULL full_name -> '', NULL avg_score -> -1). lastActive forces NULLS LAST
  -- in both directions (the TS code pushed nulls last regardless of direction).
  CASE p_sort
    WHEN 'name'       THEN v_order := 'r.sort_name ' || v_dir;
    WHEN 'lastActive' THEN v_order := 'r.last_active_at ' || v_dir || ' NULLS LAST';
    WHEN 'sessions'   THEN v_order := 'r.session_count ' || v_dir;
    WHEN 'avgScore'   THEN v_order := 'r.sort_avg ' || v_dir;
    WHEN 'mastery'    THEN v_order := 'r.mastery ' || v_dir;
    ELSE                   v_order := 'r.id ASC';
  END CASE;

  RETURN QUERY EXECUTE format(
    $q$
    WITH session_stats AS (
      SELECT qs.student_id,
             COUNT(*) AS sess_count,
             ROUND(AVG(qs.score_percentage)) AS avg_sc
      FROM quiz_sessions qs
      WHERE qs.organization_id = $1
        AND qs.ended_at IS NOT NULL
        AND qs.deleted_at IS NULL
      GROUP BY qs.student_id
    ),
    mastery_stats AS (
      SELECT sr.student_id,
             COUNT(DISTINCT sr.question_id) AS correct_count
      FROM student_responses sr
      JOIN questions q ON q.id = sr.question_id
      WHERE q.organization_id = $1
        AND q.status = 'active'
        AND q.deleted_at IS NULL
        AND sr.is_correct = true
      GROUP BY sr.student_id
    ),
    roster AS (
      SELECT
        u.id,
        u.full_name,
        u.email,
        u.last_active_at,
        u.deleted_at,
        COALESCE(ss.sess_count, 0) AS session_count,
        ss.avg_sc AS avg_score,
        COALESCE(u.full_name, '') AS sort_name,
        COALESCE(ss.avg_sc, -1) AS sort_avg,
        CASE WHEN $3 > 0
          THEN ROUND(COALESCE(ms.correct_count, 0)::numeric / $3 * 100)
          ELSE 0
        END AS mastery
      FROM users u
      LEFT JOIN session_stats ss ON ss.student_id = u.id
      LEFT JOIN mastery_stats ms ON ms.student_id = u.id
      -- §9 exception: the roster intentionally does NOT filter `deleted_at IS NULL` on
      -- users, so the admin can view soft-deleted (inactive) students with their
      -- historical stats. Behaviour matches the dropped get_admin_student_stats
      -- (mig 20260408000007, #487). Visibility is controlled by p_status; the row
      -- carries deleted_at so the caller renders the Active/Inactive badge. Safe:
      -- admin-only (is_admin() gate) and org-scoped — no cross-tenant read.
      WHERE u.organization_id = $1
        AND u.role = 'student'
        AND (
          $2 IS NULL
          OR ($2 = 'active' AND u.deleted_at IS NULL)
          OR ($2 = 'inactive' AND u.deleted_at IS NOT NULL)
        )
    )
    SELECT
      r.id,
      r.full_name,
      r.email,
      r.last_active_at,
      r.deleted_at,
      r.session_count,
      r.avg_score,
      r.mastery,
      -- Window evaluates before LIMIT: the full filtered roster size, not the page size.
      count(*) OVER() AS total_count
    FROM roster r
    ORDER BY %s, r.id ASC
    LIMIT $4 OFFSET $5
    $q$,
    v_order
  )
  USING v_org_id, p_status, v_total_questions, p_limit, p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_students(TEXT, TEXT, TEXT, INT, INT) TO authenticated;

-- get_admin_dashboard_students fully supersedes get_admin_student_stats. The only
-- caller (admin/dashboard/queries.ts) now uses the new RPC, so the old function is
-- dropped — it was an untested, authenticated-executable SECURITY DEFINER surface.
DROP FUNCTION IF EXISTS public.get_admin_student_stats();
