-- Student RLS writes require the caller's live users row; students only read fsrs_cards;
-- students cannot update internal_exam / vfr_rt_exam sessions directly. #1412

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
    -- Same set as NON_DISCARDABLE_MODES (apps/web/app/app/quiz/actions/_discard-guard.ts); red-team IE.
    AND mode NOT IN ('internal_exam', 'vfr_rt_exam')
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.deleted_at IS NULL)
  )
  WITH CHECK (student_id = auth.uid());

DROP POLICY students_own_cards ON public.fsrs_cards;

CREATE POLICY students_read_cards ON public.fsrs_cards
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.fsrs_cards FROM authenticated;
