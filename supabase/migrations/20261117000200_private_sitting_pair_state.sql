-- Pair state, one rule source for eligibility and add (D12). Not guarded; callers guard. First match wins:
-- entered_here > passed > attempt_running > entered_elsewhere > not_enrolled > deactivated > eligible.
CREATE OR REPLACE FUNCTION private.sitting_pair_state(
  p_org uuid, p_sitting_id uuid, p_user_ids uuid[], p_subject_ids uuid[]
)
RETURNS TABLE(
  user_id uuid, subject_id uuid, state text, entry_id uuid, has_live_code boolean, attempt_taken boolean,
  attempt_count int, passed_at timestamptz, passed_score numeric,
  elsewhere_sitting_id uuid, elsewhere_at timestamptz
)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  WITH pairs AS (
    -- security.md §15 exception (f): deactivated students are classified, not hidden
    SELECT u.id AS uid, u.deleted_at AS u_deleted, sj.id AS sid
      FROM public.users u CROSS JOIN public.easa_subjects sj
     WHERE u.id = ANY(p_user_ids) AND u.organization_id = p_org AND u.role = 'student'
       AND sj.id = ANY(p_subject_ids) AND sj.deleted_at IS NULL
  ),
  sess AS (
    SELECT qs.id, qs.student_id, qs.subject_id, qs.ended_at, qs.passed, qs.score_percentage,
           EXISTS (SELECT 1 FROM public.internal_exam_codes c
                    WHERE c.consumed_session_id = qs.id AND c.voided_at IS NOT NULL
                      AND c.deleted_at IS NULL) AS voided
      FROM public.quiz_sessions qs
     WHERE qs.organization_id = p_org AND qs.mode = 'internal_exam' AND qs.deleted_at IS NULL
       AND qs.student_id = ANY(p_user_ids) AND qs.subject_id = ANY(p_subject_ids)
  ),
  pass AS (
    SELECT DISTINCT ON (x.student_id, x.subject_id) x.student_id, x.subject_id, x.ended_at, x.score_percentage
      FROM sess x WHERE x.ended_at IS NOT NULL AND x.passed IS TRUE AND NOT x.voided
     ORDER BY x.student_id, x.subject_id, x.ended_at DESC, x.id
  ),
  running AS (
    SELECT DISTINCT x.student_id, x.subject_id FROM sess x WHERE x.ended_at IS NULL
  ),
  attempts AS (
    SELECT x.student_id, x.subject_id, count(*)::int AS n
      FROM sess x WHERE x.ended_at IS NOT NULL AND NOT x.voided GROUP BY x.student_id, x.subject_id
  ),
  here AS (
    SELECT e.id, e.user_id, e.subject_id,
           EXISTS (SELECT 1 FROM public.internal_exam_codes c WHERE c.sitting_entry_id = e.id
                    AND c.deleted_at IS NULL AND (c.voided_at IS NULL OR c.consumed_at IS NOT NULL)) AS live_code,
           EXISTS (SELECT 1 FROM public.internal_exam_codes c WHERE c.sitting_entry_id = e.id
                    AND c.deleted_at IS NULL AND c.consumed_at IS NOT NULL) AS taken
      FROM public.exam_sitting_entries e
     WHERE e.sitting_id = p_sitting_id AND e.organization_id = p_org AND e.deleted_at IS NULL
       AND e.user_id = ANY(p_user_ids) AND e.subject_id = ANY(p_subject_ids)
  ),
  elsewhere AS (
    SELECT DISTINCT ON (e.user_id, e.subject_id) e.user_id, e.subject_id, e.id AS eid, s2.id AS sid2, s2.scheduled_at AS at2
      FROM public.exam_sitting_entries e
      JOIN public.exam_sittings s2 ON s2.id = e.sitting_id AND s2.organization_id = p_org AND s2.deleted_at IS NULL
     WHERE e.organization_id = p_org AND e.deleted_at IS NULL AND e.sitting_id <> p_sitting_id
       AND e.user_id = ANY(p_user_ids) AND e.subject_id = ANY(p_subject_ids)
       AND s2.status IN ('scheduled', 'open') AND NOT private.sitting_day_ended(s2.scheduled_at)
       AND NOT EXISTS (SELECT 1 FROM public.internal_exam_codes c
                         JOIN public.quiz_sessions q ON q.id = c.consumed_session_id
                        WHERE c.sitting_entry_id = e.id AND q.ended_at IS NOT NULL
                          AND c.deleted_at IS NULL AND q.deleted_at IS NULL)
     ORDER BY e.user_id, e.subject_id, s2.scheduled_at, s2.id
  )
  SELECT pr.uid, pr.sid,
         CASE WHEN h.id IS NOT NULL THEN 'entered_here'
              WHEN pa.student_id IS NOT NULL THEN 'passed'
              WHEN ru.student_id IS NOT NULL THEN 'attempt_running'
              WHEN el.eid IS NOT NULL THEN 'entered_elsewhere'
              WHEN NOT EXISTS (SELECT 1 FROM public.course_enrolments ce
                                 JOIN public.easa_subjects es ON es.course_id = ce.course_id
                                WHERE ce.user_id = pr.uid AND ce.organization_id = p_org
                                  AND ce.deleted_at IS NULL AND es.id = pr.sid) THEN 'not_enrolled'
              WHEN pr.u_deleted IS NOT NULL THEN 'deactivated'
              ELSE 'eligible' END,
         h.id, COALESCE(h.live_code, false), COALESCE(h.taken, false),
         COALESCE(at.n, 0), pa.ended_at, pa.score_percentage,
         CASE WHEN h.id IS NULL AND pa.student_id IS NULL AND ru.student_id IS NULL THEN el.sid2 END,
         CASE WHEN h.id IS NULL AND pa.student_id IS NULL AND ru.student_id IS NULL THEN el.at2 END
    FROM pairs pr
    LEFT JOIN here h ON h.user_id = pr.uid AND h.subject_id = pr.sid
    LEFT JOIN pass pa ON pa.student_id = pr.uid AND pa.subject_id = pr.sid
    LEFT JOIN running ru ON ru.student_id = pr.uid AND ru.subject_id = pr.sid
    LEFT JOIN attempts at ON at.student_id = pr.uid AND at.subject_id = pr.sid
    LEFT JOIN elsewhere el ON el.user_id = pr.uid AND el.subject_id = pr.sid
$$;
REVOKE EXECUTE ON FUNCTION private.sitting_pair_state(uuid, uuid, uuid[], uuid[]) FROM PUBLIC, anon, authenticated;
