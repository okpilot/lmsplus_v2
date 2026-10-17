-- #1414: wrap auth.uid() / is_admin() in (SELECT ...) so Postgres plans them as an InitPlan
-- evaluated once per statement, not once per row (Supabase lint 0003 auth_rls_initplan).
-- https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
-- ALTER POLICY changes only the USING / WITH CHECK expressions; command, roles and permissive are kept.

ALTER POLICY "tenant_isolation" ON public.courses
  USING (
    ((organization_id = ( SELECT users.organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid))))
    AND (deleted_at IS NULL))
  );

ALTER POLICY "admin_delete_subjects" ON public.easa_subjects
  USING (
    ( SELECT is_admin() AS is_admin)
  );

ALTER POLICY "admin_insert_subjects" ON public.easa_subjects
  WITH CHECK (
    ( SELECT is_admin() AS is_admin)
  );

ALTER POLICY "admin_update_subjects" ON public.easa_subjects
  USING (
    ( SELECT is_admin() AS is_admin)
  )
  WITH CHECK (
    ( SELECT is_admin() AS is_admin)
  );

ALTER POLICY "authenticated_read" ON public.easa_subjects
  USING (
    (( SELECT auth.uid() AS uid) IS NOT NULL)
  );

ALTER POLICY "admin_delete_subtopics" ON public.easa_subtopics
  USING (
    ( SELECT is_admin() AS is_admin)
  );

ALTER POLICY "admin_insert_subtopics" ON public.easa_subtopics
  WITH CHECK (
    ( SELECT is_admin() AS is_admin)
  );

ALTER POLICY "admin_update_subtopics" ON public.easa_subtopics
  USING (
    ( SELECT is_admin() AS is_admin)
  )
  WITH CHECK (
    ( SELECT is_admin() AS is_admin)
  );

ALTER POLICY "authenticated_read" ON public.easa_subtopics
  USING (
    (( SELECT auth.uid() AS uid) IS NOT NULL)
  );

ALTER POLICY "admin_delete_topics" ON public.easa_topics
  USING (
    ( SELECT is_admin() AS is_admin)
  );

ALTER POLICY "admin_insert_topics" ON public.easa_topics
  WITH CHECK (
    ( SELECT is_admin() AS is_admin)
  );

ALTER POLICY "admin_update_topics" ON public.easa_topics
  USING (
    ( SELECT is_admin() AS is_admin)
  )
  WITH CHECK (
    ( SELECT is_admin() AS is_admin)
  );

ALTER POLICY "authenticated_read" ON public.easa_topics
  USING (
    (( SELECT auth.uid() AS uid) IS NOT NULL)
  );

ALTER POLICY "admin_delete_exam_distributions" ON public.exam_config_distributions
  USING (
    (EXISTS ( SELECT 1
   FROM exam_configs ec
  WHERE ((ec.id = exam_config_distributions.exam_config_id) AND (ec.organization_id = ( SELECT users.organization_id
           FROM users
          WHERE (users.id = ( SELECT auth.uid() AS uid)))) AND (ec.deleted_at IS NULL) AND ( SELECT is_admin() AS is_admin))))
  );

ALTER POLICY "admin_insert_exam_distributions" ON public.exam_config_distributions
  WITH CHECK (
    (EXISTS ( SELECT 1
   FROM exam_configs ec
  WHERE ((ec.id = exam_config_distributions.exam_config_id) AND (ec.organization_id = ( SELECT users.organization_id
           FROM users
          WHERE (users.id = ( SELECT auth.uid() AS uid)))) AND (ec.deleted_at IS NULL) AND ( SELECT is_admin() AS is_admin))))
  );

ALTER POLICY "admin_select_exam_distributions" ON public.exam_config_distributions
  USING (
    (EXISTS ( SELECT 1
   FROM exam_configs ec
  WHERE ((ec.id = exam_config_distributions.exam_config_id) AND (ec.organization_id = ( SELECT users.organization_id
           FROM users
          WHERE (users.id = ( SELECT auth.uid() AS uid)))) AND (ec.deleted_at IS NULL) AND ( SELECT is_admin() AS is_admin))))
  );

ALTER POLICY "admin_insert_exam_configs" ON public.exam_configs
  WITH CHECK (
    (( SELECT is_admin() AS is_admin)
    AND (organization_id = ( SELECT users.organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid)))))
  );

ALTER POLICY "admin_select_exam_configs" ON public.exam_configs
  USING (
    (( SELECT is_admin() AS is_admin)
    AND (organization_id = ( SELECT users.organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid)))))
  );

ALTER POLICY "admin_update_exam_configs" ON public.exam_configs
  USING (
    (( SELECT is_admin() AS is_admin)
    AND (organization_id = ( SELECT users.organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid)))))
  )
  WITH CHECK (
    (( SELECT is_admin() AS is_admin)
    AND (organization_id = ( SELECT users.organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid)))))
  );

ALTER POLICY "student_select_exam_configs" ON public.exam_configs
  USING (
    ((organization_id = ( SELECT users.organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid))))
    AND (enabled = true)
    AND (deleted_at IS NULL))
  );

ALTER POLICY "admin_read_org_codes" ON public.internal_exam_codes
  USING (
    (( SELECT is_admin() AS is_admin)
    AND (organization_id IN ( SELECT u.organization_id
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.deleted_at IS NULL)))))
  );

ALTER POLICY "tenant_isolation" ON public.lessons
  USING (
    ((organization_id = ( SELECT users.organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid))))
    AND (deleted_at IS NULL))
  );

ALTER POLICY "tenant_isolation" ON public.organizations
  USING (
    (id = ( SELECT users.organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid))))
  );

ALTER POLICY "tenant_isolation" ON public.question_banks
  USING (
    ((organization_id = ( SELECT users.organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid))))
    AND (deleted_at IS NULL))
  );

ALTER POLICY "admin_insert_questions" ON public.questions
  WITH CHECK (
    (( SELECT is_admin() AS is_admin)
    AND (organization_id = ( SELECT users.organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid)))))
  );

ALTER POLICY "admin_update_questions" ON public.questions
  USING (
    (( SELECT is_admin() AS is_admin)
    AND (organization_id = ( SELECT users.organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid)))))
  )
  WITH CHECK (
    (( SELECT is_admin() AS is_admin)
    AND (organization_id = ( SELECT users.organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid)))))
  );

ALTER POLICY "tenant_isolation" ON public.questions
  USING (
    ((organization_id = ( SELECT users.organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid))))
    AND (deleted_at IS NULL))
  );
