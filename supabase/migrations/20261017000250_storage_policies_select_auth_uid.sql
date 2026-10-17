-- #1414: wrap auth.uid() / is_admin() in (SELECT ...) so Postgres plans them as an InitPlan
-- evaluated once per statement, not once per row (Supabase lint 0003 auth_rls_initplan).
-- https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
-- ALTER POLICY changes only the USING / WITH CHECK expressions; command, roles and permissive are kept.

DROP POLICY IF EXISTS question_images_admin_delete ON storage.objects;

DROP POLICY IF EXISTS question_images_admin_insert ON storage.objects;

DROP POLICY IF EXISTS question_images_admin_update ON storage.objects;

CREATE POLICY question_images_admin_delete
  ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING (
    ((bucket_id = 'question-images'::text)
    AND ( SELECT is_admin() AS is_admin)
    AND ((storage.foldername(name))[1] = ( SELECT (users.organization_id)::text AS organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid)))))
  );

CREATE POLICY question_images_admin_insert
  ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    ((bucket_id = 'question-images'::text)
    AND ( SELECT is_admin() AS is_admin)
    AND ((storage.foldername(name))[1] = ( SELECT (users.organization_id)::text AS organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid)))))
  );

CREATE POLICY question_images_admin_update
  ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    ((bucket_id = 'question-images'::text)
    AND ( SELECT is_admin() AS is_admin)
    AND ((storage.foldername(name))[1] = ( SELECT (users.organization_id)::text AS organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid)))))
  )
  WITH CHECK (
    ((bucket_id = 'question-images'::text) AND ( SELECT is_admin() AS is_admin) AND ((storage.foldername(name))[1] = ( SELECT (users.organization_id)::text AS organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid)))))

  );
