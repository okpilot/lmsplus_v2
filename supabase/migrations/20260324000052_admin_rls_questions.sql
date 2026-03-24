-- Admin RLS policies for questions table
-- Admins can INSERT new questions and UPDATE existing ones (including soft-delete).
-- No DELETE policy — questions use soft-delete via UPDATE SET deleted_at.

CREATE POLICY admin_insert_questions ON public.questions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY admin_update_questions ON public.questions
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
