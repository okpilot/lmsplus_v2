-- Fix: storage policies for question-images need org-scoped path enforcement.
-- Images are stored at {org_id}/{filename}. Policies check that the first
-- path segment matches the admin's organization_id.
-- INSERT policy also requires org-prefixed paths.

DROP POLICY IF EXISTS question_images_admin_insert ON storage.objects;
DROP POLICY IF EXISTS question_images_admin_update ON storage.objects;
DROP POLICY IF EXISTS question_images_admin_delete ON storage.objects;

CREATE POLICY question_images_admin_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'question-images'
    AND public.is_admin()
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY question_images_admin_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'question-images'
    AND public.is_admin()
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM users WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'question-images'
    AND public.is_admin()
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY question_images_admin_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'question-images'
    AND public.is_admin()
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM users WHERE id = auth.uid()
    )
  );
