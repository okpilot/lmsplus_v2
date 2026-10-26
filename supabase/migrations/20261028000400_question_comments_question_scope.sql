-- question_comments follow question visibility (caller org + enrolment via questions RLS); authors keep their own rows. #1637 (red-team KL, KM)

CREATE POLICY question_comments_select_visible_question ON public.question_comments
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    -- Own rows stay readable: the GDPR self-export reads them through RLS.
    user_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.questions q WHERE q.id = question_comments.question_id)
  );

CREATE POLICY question_comments_insert_visible_question ON public.question_comments
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.questions q WHERE q.id = question_comments.question_id));
