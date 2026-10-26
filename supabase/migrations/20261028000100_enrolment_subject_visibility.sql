-- private.accessible_subject_ids() + RESTRICTIVE SELECT on easa_* and questions: students see only enrolled-course subjects. #1637

CREATE OR REPLACE FUNCTION private.accessible_subject_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT s.id
  FROM public.easa_subjects s
  JOIN public.users u ON u.id = (SELECT auth.uid()) AND u.deleted_at IS NULL
  WHERE u.role IN ('admin', 'instructor')
     OR EXISTS (
       SELECT 1 FROM public.course_enrolments ce
       WHERE ce.user_id = u.id AND ce.course_id = s.course_id AND ce.deleted_at IS NULL
     )
$$;

REVOKE EXECUTE ON FUNCTION private.accessible_subject_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.accessible_subject_ids() TO authenticated;

COMMENT ON FUNCTION private.accessible_subject_ids() IS
  'easa_subjects.id the caller may read: all for an active admin/instructor, else subjects of courses with a live enrolment. Empty for NULL uid or a deactivated caller. SECURITY DEFINER (avoids policy recursion on easa_subjects). #1637';

CREATE POLICY easa_subjects_select_enrolled ON public.easa_subjects
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    id IN (SELECT private.accessible_subject_ids())
    -- INSERT ... RETURNING: the helper's snapshot cannot see the new row, so staff pass on role.
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid()) AND u.role IN ('admin', 'instructor') AND u.deleted_at IS NULL
    )
  );
CREATE POLICY easa_topics_select_enrolled ON public.easa_topics
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (subject_id IN (SELECT private.accessible_subject_ids()));
CREATE POLICY easa_subtopics_select_enrolled ON public.easa_subtopics
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (topic_id IN (
    SELECT t.id FROM public.easa_topics t
    WHERE t.subject_id IN (SELECT private.accessible_subject_ids())
  ));
CREATE POLICY questions_select_enrolled ON public.questions
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (subject_id IN (SELECT private.accessible_subject_ids()));

-- course_id is written by migrations (service role) only.
REVOKE INSERT, UPDATE ON public.easa_subjects FROM authenticated;
GRANT INSERT (code, name, short, sort_order), UPDATE (code, name, short, sort_order)
  ON public.easa_subjects TO authenticated;
