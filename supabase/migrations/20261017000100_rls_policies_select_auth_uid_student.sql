-- #1414: wrap auth.uid() / is_admin() in (SELECT ...) so Postgres plans them as an InitPlan
-- evaluated once per statement, not once per row (Supabase lint 0003 auth_rls_initplan).
-- https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
-- ALTER POLICY changes only the USING / WITH CHECK expressions; command, roles and permissive are kept.

ALTER POLICY "audit_read_instructors" ON public.audit_events
  USING (
    ((organization_id = ( SELECT users.organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid))))
    AND (( SELECT users.role
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid))) = ANY (ARRAY['instructor'::text, 'admin'::text])))
  );

ALTER POLICY "audit_read_own" ON public.audit_events
  USING (
    (actor_id = ( SELECT auth.uid() AS uid))
  );

ALTER POLICY "flagged_questions_student_insert" ON public.flagged_questions
  WITH CHECK (
    ((student_id = ( SELECT auth.uid() AS uid))
    AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.deleted_at IS NULL)))))
  );

ALTER POLICY "flagged_questions_student_select" ON public.flagged_questions
  USING (
    (student_id = ( SELECT auth.uid() AS uid))
  );

ALTER POLICY "flagged_questions_student_update" ON public.flagged_questions
  USING (
    ((student_id = ( SELECT auth.uid() AS uid))
    AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.deleted_at IS NULL)))))
  )
  WITH CHECK (
    (student_id = ( SELECT auth.uid() AS uid))
  );

ALTER POLICY "students_read_cards" ON public.fsrs_cards
  USING (
    (student_id = ( SELECT auth.uid() AS uid))
  );

ALTER POLICY "question_comments_delete_admin" ON public.question_comments
  USING (
    ( SELECT is_admin() AS is_admin)
  );

ALTER POLICY "question_comments_delete_own" ON public.question_comments
  USING (
    ((user_id = ( SELECT auth.uid() AS uid))
    AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.deleted_at IS NULL)))))
  );

ALTER POLICY "question_comments_insert" ON public.question_comments
  WITH CHECK (
    ((user_id = ( SELECT auth.uid() AS uid))
    AND (deleted_at IS NULL)
    AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.deleted_at IS NULL)))))
  );

ALTER POLICY "question_comments_select" ON public.question_comments
  USING (
    ((deleted_at IS NULL)
    AND (EXISTS ( SELECT 1
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid)))))
  );

ALTER POLICY "quiz_drafts_student_delete" ON public.quiz_drafts
  USING (
    ((student_id = ( SELECT auth.uid() AS uid))
    AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.deleted_at IS NULL)))))
  );

ALTER POLICY "quiz_drafts_student_select" ON public.quiz_drafts
  USING (
    (student_id = ( SELECT auth.uid() AS uid))
  );

ALTER POLICY "students_read_answers" ON public.quiz_session_answers
  USING (
    (session_id IN ( SELECT quiz_sessions.id
   FROM quiz_sessions
  WHERE (quiz_sessions.student_id = ( SELECT auth.uid() AS uid))))
  );

ALTER POLICY "quiz_session_progress_select_own" ON public.quiz_session_progress
  USING (
    (student_id = ( SELECT auth.uid() AS uid))
  );

ALTER POLICY "instructors_read_sessions" ON public.quiz_sessions
  USING (
    ((deleted_at IS NULL)
    AND (organization_id = ( SELECT users.organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid))))
    AND (( SELECT users.role
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid))) = ANY (ARRAY['instructor'::text, 'admin'::text])))
  );

ALTER POLICY "students_select_sessions" ON public.quiz_sessions
  USING (
    (student_id = ( SELECT auth.uid() AS uid))
  );

ALTER POLICY "students_update_sessions" ON public.quiz_sessions
  USING (
    ((student_id = ( SELECT auth.uid() AS uid))
    AND (ended_at IS NULL)
    AND (deleted_at IS NULL)
    AND (mode <> ALL (ARRAY['internal_exam'::text, 'vfr_rt_exam'::text]))
    AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.deleted_at IS NULL)))))
  )
  WITH CHECK (
    (student_id = ( SELECT auth.uid() AS uid))
  );

ALTER POLICY "instructors_read_students" ON public.student_responses
  USING (
    ((organization_id = ( SELECT users.organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid))))
    AND (( SELECT users.role
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid))) = ANY (ARRAY['instructor'::text, 'admin'::text])))
  );

ALTER POLICY "students_read_responses" ON public.student_responses
  USING (
    (student_id = ( SELECT auth.uid() AS uid))
  );

ALTER POLICY "user_consents_select_own" ON public.user_consents
  USING (
    (user_id = ( SELECT auth.uid() AS uid))
  );

ALTER POLICY "users_select" ON public.users
  USING (
    ((id = ( SELECT auth.uid() AS uid))
    AND (deleted_at IS NULL))
  );

ALTER POLICY "users_update_own" ON public.users
  USING (
    ((id = ( SELECT auth.uid() AS uid))
    AND (deleted_at IS NULL))
  )
  WITH CHECK (
    ((id = ( SELECT auth.uid() AS uid))
    AND (deleted_at IS NULL))
  );
