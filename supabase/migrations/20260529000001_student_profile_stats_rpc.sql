-- Completed-session count + average score for the calling student (umbrella #668, P2).
--
-- Replaces the unpaginated quiz_sessions read in lib/queries/profile.ts:getProfileStats that
-- fetched every completed session's score_percentage as a raw, unpaginated row set to count
-- and average them in JavaScript. PostgREST silently truncates any unpaginated read at the
-- 1000-row cap, so a high-volume student (the #540 profile: thousands of sessions) had both
-- totalSessions and averageScore computed from an arbitrary first-1000-session subset.
-- Aggregation now runs inside Postgres (COUNT + AVG -> a single row, never truncated).
--
-- SECURITY INVOKER + RLS, same model as get_student_mastery_stats (#540): the explicit
-- `qs.student_id = auth.uid()` is REQUIRED, not redundant. quiz_sessions has MORE THAN ONE
-- permissive SELECT policy (a student-own policy AND an instructor/admin org-read policy),
-- which Postgres ORs together, so RLS alone would let an instructor/admin aggregate org-wide.
-- The self-scope keeps the result per-caller for every role (matching the legacy read's
-- .eq('student_id', userId)). See security.md §11 / docs/security.md §3 (Multiple Permissive
-- SELECT Policies). No auth preamble is needed: an unauthenticated caller resolves auth.uid()
-- to NULL, the filter matches zero rows, and the aggregate returns total_sessions 0 / avg_score NULL.
--
-- Behaviour-preserving TS->SQL move: the legacy code filtered completed sessions to those with
-- a non-null score_percentage BEFORE counting (totalSessions = completed.length) and averaging.
-- The `score_percentage IS NOT NULL` predicate reproduces that exactly, so COUNT(*) and AVG()
-- operate on the identical filtered set. avg_score stays a raw numeric; the Math.round() and the
-- `totalSessions > 0 ? .. : 0` guard remain in TypeScript, which still consumes the raw values.
-- A no-GROUP-BY aggregate always returns exactly one row (NULL avg_score when no rows match).

CREATE OR REPLACE FUNCTION public.get_student_profile_stats()
RETURNS TABLE (
  total_sessions bigint,
  avg_score      numeric
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  SELECT
    COUNT(*)::bigint          AS total_sessions,
    AVG(qs.score_percentage)  AS avg_score
  FROM quiz_sessions qs
  WHERE qs.student_id = auth.uid()
    AND qs.ended_at IS NOT NULL
    AND qs.deleted_at IS NULL
    AND qs.score_percentage IS NOT NULL;
$$;

-- Grants EXECUTE only to `authenticated` (same as get_student_mastery_stats / get_question_counts).
-- Supabase platform defaults also implicitly grant EXECUTE to `anon`; that is safe to leave —
-- an anon caller resolves auth.uid() to NULL and the filter yields zero rows. RLS + the
-- auth.uid() self-scope, not the EXECUTE grant, are the access boundary here.
GRANT EXECUTE ON FUNCTION public.get_student_profile_stats() TO authenticated;

COMMENT ON FUNCTION public.get_student_profile_stats() IS
  'Completed-session count (total_sessions) and average score (avg_score, raw numeric) for the calling student. Counts only sessions with ended_at IS NOT NULL, deleted_at IS NULL, and score_percentage IS NOT NULL (single-row aggregate; avg_score NULL when none). SECURITY INVOKER + explicit student_id = auth.uid() self-scope (quiz_sessions is multi-permissive, security.md §11). Replaces a client-side read that truncated at the PostgREST 1000-row cap (#668 P2, profile.ts).';
