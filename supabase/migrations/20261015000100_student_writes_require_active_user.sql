-- flagged_questions_student_insert: WITH CHECK adds active-user check.
-- flagged_questions_student_update: USING adds active-user check.
-- question_comments_insert: WITH CHECK adds active-user check.
-- question_comments_delete_own: USING adds active-user check.
-- quiz_drafts_student_delete: USING adds active-user check.
-- students_update_sessions: USING adds active-user check.
-- fsrs_cards: students_own_cards (ALL) replaced by students_read_cards (SELECT); INSERT/UPDATE/DELETE revoked from authenticated.

ALTER POLICY flagged_questions_student_insert ON public.flagged_questions
  WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.deleted_at IS NULL)
  );

ALTER POLICY flagged_questions_student_update ON public.flagged_questions
  USING (
    student_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.deleted_at IS NULL)
  )
  WITH CHECK (student_id = auth.uid());

ALTER POLICY question_comments_insert ON public.question_comments
  WITH CHECK (
    user_id = auth.uid()
    AND deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.deleted_at IS NULL)
  );

ALTER POLICY question_comments_delete_own ON public.question_comments
  USING (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.deleted_at IS NULL)
  );

ALTER POLICY quiz_drafts_student_delete ON public.quiz_drafts
  USING (
    student_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.deleted_at IS NULL)
  );

ALTER POLICY students_update_sessions ON public.quiz_sessions
  USING (
    student_id = auth.uid()
    AND ended_at IS NULL
    AND deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.deleted_at IS NULL)
  )
  WITH CHECK (student_id = auth.uid());

DROP POLICY students_own_cards ON public.fsrs_cards;

CREATE POLICY students_read_cards ON public.fsrs_cards
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.fsrs_cards FROM authenticated;
