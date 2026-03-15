-- Admin RLS policies for EASA syllabus tables
-- Allows admin users to INSERT, UPDATE, DELETE on easa_subjects, easa_topics, easa_subtopics.
-- FK RESTRICT on questions.subject_id/topic_id/subtopic_id prevents orphaning.
-- Existing authenticated_read SELECT policies remain unchanged.

-- Helper: checks if the current user has admin role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- easa_subjects
CREATE POLICY admin_insert_subjects ON public.easa_subjects
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY admin_update_subjects ON public.easa_subjects
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY admin_delete_subjects ON public.easa_subjects
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- easa_topics
CREATE POLICY admin_insert_topics ON public.easa_topics
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY admin_update_topics ON public.easa_topics
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY admin_delete_topics ON public.easa_topics
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- easa_subtopics
CREATE POLICY admin_insert_subtopics ON public.easa_subtopics
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY admin_update_subtopics ON public.easa_subtopics
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY admin_delete_subtopics ON public.easa_subtopics
  FOR DELETE TO authenticated
  USING (public.is_admin());
