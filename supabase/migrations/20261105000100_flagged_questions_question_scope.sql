-- flagged_questions: RESTRICTIVE INSERT/UPDATE require a question visible to the caller. #1177
CREATE POLICY flagged_questions_insert_visible_question ON public.flagged_questions
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.questions q WHERE q.id = flagged_questions.question_id));

CREATE POLICY flagged_questions_update_visible_question ON public.flagged_questions
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    deleted_at IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.questions q WHERE q.id = flagged_questions.question_id)
  );
