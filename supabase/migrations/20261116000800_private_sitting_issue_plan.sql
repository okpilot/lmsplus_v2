-- p_user_ids / p_entry_ids NULL = no filter; both given = intersection. Single source for issue and preview. action issue | reissue_after_expiry | skip.
CREATE OR REPLACE FUNCTION private.sitting_issue_plan(p_org uuid, p_sitting_id uuid, p_user_ids uuid[], p_entry_ids uuid[] DEFAULT NULL)
RETURNS TABLE(entry_id uuid, user_id uuid, subject_id uuid, action text, reason text, old_code_id uuid)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT e.id, e.user_id, e.subject_id,
         CASE WHEN x.attempt_taken OR x.passed OR x.deactivated OR NOT x.enrolled OR NOT x.config_ok
                   OR (x.old_id IS NOT NULL AND x.old_expires > now()) THEN 'skip'
              WHEN x.old_id IS NOT NULL THEN 'reissue_after_expiry'
              ELSE 'issue' END,
         CASE WHEN x.attempt_taken THEN 'attempt_taken'
              WHEN x.passed THEN 'passed'
              WHEN x.deactivated THEN 'deactivated'
              WHEN NOT x.enrolled THEN 'no_longer_enrolled'
              WHEN NOT x.config_ok THEN 'exam_disabled'
              WHEN x.old_id IS NOT NULL AND x.old_expires > now() THEN 'already_issued'
              END,
         x.old_id
    FROM public.exam_sitting_entries e
    CROSS JOIN LATERAL (
      SELECT EXISTS (SELECT 1 FROM public.internal_exam_codes c
                      WHERE c.sitting_entry_id = e.id AND c.consumed_at IS NOT NULL AND c.deleted_at IS NULL) AS attempt_taken,
             EXISTS (SELECT 1 FROM public.quiz_sessions q
                      WHERE q.student_id = e.user_id AND q.subject_id = e.subject_id AND q.organization_id = p_org
                        AND q.mode = 'internal_exam' AND q.deleted_at IS NULL AND q.ended_at IS NOT NULL
                        AND q.passed IS TRUE
                        AND NOT EXISTS (SELECT 1 FROM public.internal_exam_codes c2
                                         WHERE c2.consumed_session_id = q.id AND c2.voided_at IS NOT NULL)) AS passed,
             -- security.md §15 exception (f)
             EXISTS (SELECT 1 FROM public.users u WHERE u.id = e.user_id AND u.deleted_at IS NOT NULL) AS deactivated,
             EXISTS (SELECT 1 FROM public.course_enrolments ce
                       JOIN public.easa_subjects es ON es.course_id = ce.course_id
                      WHERE ce.user_id = e.user_id AND ce.organization_id = p_org
                        AND ce.deleted_at IS NULL AND es.id = e.subject_id) AS enrolled,
             EXISTS (SELECT 1 FROM public.exam_configs ec
                      WHERE ec.organization_id = p_org AND ec.subject_id = e.subject_id
                        AND ec.enabled = true AND ec.deleted_at IS NULL) AS config_ok,
             (SELECT c.id FROM public.internal_exam_codes c
               WHERE c.sitting_entry_id = e.id AND c.deleted_at IS NULL
                 AND c.voided_at IS NULL AND c.consumed_at IS NULL LIMIT 1) AS old_id,
             (SELECT c.expires_at FROM public.internal_exam_codes c
               WHERE c.sitting_entry_id = e.id AND c.deleted_at IS NULL
                 AND c.voided_at IS NULL AND c.consumed_at IS NULL LIMIT 1) AS old_expires
    ) x
   WHERE e.sitting_id = p_sitting_id AND e.organization_id = p_org AND e.deleted_at IS NULL
     AND (p_user_ids IS NULL OR e.user_id = ANY(p_user_ids))
     AND (p_entry_ids IS NULL OR e.id = ANY(p_entry_ids))
$$;
REVOKE EXECUTE ON FUNCTION private.sitting_issue_plan(uuid, uuid, uuid[], uuid[]) FROM PUBLIC, anon, authenticated;
