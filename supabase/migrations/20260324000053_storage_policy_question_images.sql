-- Storage RLS policies for question-images bucket
-- Admins can upload, update, and delete images.
-- All authenticated users can read (images shown in quizzes).

CREATE POLICY question_images_admin_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'question-images' AND public.is_admin());

CREATE POLICY question_images_admin_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'question-images' AND public.is_admin())
  WITH CHECK (bucket_id = 'question-images' AND public.is_admin());

CREATE POLICY question_images_admin_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'question-images' AND public.is_admin());

CREATE POLICY question_images_public_read
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'question-images');
