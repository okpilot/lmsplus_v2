-- Students only read and delete drafts since #1026 PR 3; #1463.
DROP POLICY quiz_drafts_student_all ON public.quiz_drafts;
CREATE POLICY quiz_drafts_student_select ON public.quiz_drafts FOR SELECT TO authenticated USING (student_id = auth.uid());
CREATE POLICY quiz_drafts_student_delete ON public.quiz_drafts FOR DELETE TO authenticated USING (student_id = auth.uid());
REVOKE INSERT, UPDATE ON public.quiz_drafts FROM authenticated;
