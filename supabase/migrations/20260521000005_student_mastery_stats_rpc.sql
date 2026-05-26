-- Per-subject and per-topic mastery counts for the calling student (#540, umbrella #668).
--
-- Replaces client-side aggregation in dashboard.ts / progress.ts that fetched the
-- correct-responses numerator and the active-questions denominator as raw, unpaginated
-- row sets. PostgREST silently truncates any unpaginated read at the 1000-row cap, so a
-- student with >1000 responses (issue #540: 8,395) or an org with >1000 active questions
-- (1,366) had per-subject mastery computed from an arbitrary first-1000-row subset — a
-- completed subject answered "late" fell outside the window and showed 0%. Aggregation
-- now runs inside Postgres (GROUP BY -> a few dozen count rows, well under the cap).
--
-- SECURITY INVOKER + RLS (same model as get_question_counts, #614, the prior fix for this
-- identical bug class): the `tenant_isolation` policy on `questions` scopes every read to
-- the caller's organization + deleted_at IS NULL (any status). The numerator additionally
-- self-scopes with an explicit `sr.student_id = auth.uid()` (see correct_q) — student_responses
-- has a second SELECT policy (instructors_read_students) that would otherwise let an
-- instructor/admin aggregate org-wide, so RLS alone is not enough to keep it per-caller. No
-- manual org-scoping and no auth preamble are needed — an unauthenticated caller resolves
-- auth.uid() to NULL, the filters match zero rows, and the function returns an empty set.
--
-- Preserves the PR #665 / d1cd4770 semantics EXACTLY (behaviour-preserving TS->SQL move):
--   total   = COUNT(DISTINCT q.id) WHERE status = 'active'   (denominator; RLS already
--             enforces org + deleted_at IS NULL).
--   correct = count of DISTINCT questions answered correctly — the correct_q CTE dedups
--             per question via SELECT DISTINCT q.id (so multiple correct attempts on the
--             same question count once), then COUNT(*) over that set. is_correct responses
--             to questions of ANY status (numerator; RLS enforces org + non-deleted) — so
--             `correct` can EXCEED `total` when the student answered a now-draft question.
--             The percentage clamp
--             (min(.,100)) and the "include if total>0 OR correct>0" orphan-retention filter
--             stay in TypeScript, which still consumes the raw counts.
--
-- The result set carries BOTH granularities in one round trip, distinguished by topic_id:
--   topic_id IS NULL  -> subject-level aggregate row (NULL sentinel; safe because
--                        questions.topic_id is NOT NULL, so no real question can ever
--                        produce a NULL group key).
--   topic_id NOT NULL -> topic-level aggregate row.

CREATE OR REPLACE FUNCTION public.get_student_mastery_stats()
RETURNS TABLE (
  subject_id uuid,
  topic_id   uuid,
  total      bigint,
  correct    bigint
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  WITH
  -- DENOMINATOR: active questions visible to the caller (RLS = org + non-deleted).
  active_q AS (
    SELECT q.id, q.subject_id, q.topic_id
    FROM questions q
    WHERE q.status = 'active'
  ),
  -- NUMERATOR: distinct questions the caller answered correctly, attributed to the
  -- question's own subject/topic; any status (the questions JOIN is org + non-deleted via RLS).
  -- The explicit `sr.student_id = auth.uid()` is REQUIRED, not redundant: student_responses
  -- has a second SELECT policy (instructors_read_students) that lets an instructor/admin read
  -- ALL responses in their org, so RLS alone would aggregate org-wide for those roles. This
  -- self-scope keeps the numerator per-caller for every role (matches the legacy client read's
  -- .eq('student_id', userId)). Unauthenticated → auth.uid() NULL → zero rows.
  correct_q AS (
    SELECT DISTINCT q.id, q.subject_id, q.topic_id
    FROM student_responses sr
    JOIN questions q ON q.id = sr.question_id
    WHERE sr.student_id = auth.uid()
      AND sr.is_correct = true
  ),
  subj_total AS (
    SELECT aq.subject_id, COUNT(*)::bigint AS total
    FROM active_q aq
    GROUP BY aq.subject_id
  ),
  subj_correct AS (
    SELECT cq.subject_id, COUNT(*)::bigint AS correct
    FROM correct_q cq
    GROUP BY cq.subject_id
  ),
  topic_total AS (
    SELECT aq.subject_id, aq.topic_id, COUNT(*)::bigint AS total
    FROM active_q aq
    GROUP BY aq.subject_id, aq.topic_id
  ),
  topic_correct AS (
    SELECT cq.subject_id, cq.topic_id, COUNT(*)::bigint AS correct
    FROM correct_q cq
    GROUP BY cq.subject_id, cq.topic_id
  )
  -- Subject-level rows (topic_id = NULL sentinel). FULL JOIN keeps a subject present on
  -- either side: active-only (correct absent -> 0) AND orphan correct-only (total absent
  -- -> 0, the #540/#664 retention case). LEFT JOIN would drop pure-orphan subjects.
  SELECT
    COALESCE(st.subject_id, sc.subject_id) AS subject_id,
    NULL::uuid                             AS topic_id,
    COALESCE(st.total, 0)                  AS total,
    COALESCE(sc.correct, 0)                AS correct
  FROM subj_total st
  FULL JOIN subj_correct sc ON sc.subject_id = st.subject_id

  UNION ALL

  -- Topic-level rows.
  SELECT
    COALESCE(tt.subject_id, tc.subject_id) AS subject_id,
    COALESCE(tt.topic_id, tc.topic_id)     AS topic_id,
    COALESCE(tt.total, 0)                  AS total,
    COALESCE(tc.correct, 0)                AS correct
  FROM topic_total tt
  FULL JOIN topic_correct tc
    ON tc.subject_id = tt.subject_id
   AND tc.topic_id = tt.topic_id;
$$;

-- This migration grants EXECUTE only to `authenticated` (same as get_question_counts).
-- Supabase's platform defaults ALSO implicitly grant EXECUTE to `anon` on new functions — this
-- migration does not add that, and it is safe to leave: an anon caller resolves auth.uid() to
-- NULL and the RLS policies on questions/student_responses yield an empty set. RLS — not the
-- EXECUTE grant — is the access boundary here.
GRANT EXECUTE ON FUNCTION public.get_student_mastery_stats() TO authenticated;

COMMENT ON FUNCTION public.get_student_mastery_stats() IS
  'Per-(subject) and per-(subject,topic) mastery counts for the calling student. total=active questions; correct=distinct correct responses to non-deleted questions of any status (can exceed total). topic_id NULL = subject-level row. SECURITY INVOKER + RLS scopes to caller org + own responses. Replaces client-side aggregation that truncated at the 1000-row cap (#540, umbrella #668).';
