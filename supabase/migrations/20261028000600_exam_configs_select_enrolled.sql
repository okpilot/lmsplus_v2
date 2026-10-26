-- exam_configs follow enrolment: students read configs only for subjects of enrolled courses. #1637 (Decision 167)

CREATE POLICY exam_configs_select_enrolled ON public.exam_configs
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (subject_id IN (SELECT private.accessible_subject_ids()));
