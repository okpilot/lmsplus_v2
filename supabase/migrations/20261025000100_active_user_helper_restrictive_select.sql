-- private.is_active_user() + RESTRICTIVE SELECT on student-owned tables: a deactivated caller with a live token reads no rows. #1607 #1258

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.is_active_user() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.deleted_at IS NULL) $$;

REVOKE EXECUTE ON FUNCTION private.is_active_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_active_user() TO authenticated;

CREATE POLICY quiz_sessions_select_active_caller ON public.quiz_sessions
  AS RESTRICTIVE FOR SELECT TO authenticated USING ((SELECT private.is_active_user()));
CREATE POLICY student_responses_select_active_caller ON public.student_responses
  AS RESTRICTIVE FOR SELECT TO authenticated USING ((SELECT private.is_active_user()));
CREATE POLICY quiz_session_answers_select_active_caller ON public.quiz_session_answers
  AS RESTRICTIVE FOR SELECT TO authenticated USING ((SELECT private.is_active_user()));
CREATE POLICY quiz_session_progress_select_active_caller ON public.quiz_session_progress
  AS RESTRICTIVE FOR SELECT TO authenticated USING ((SELECT private.is_active_user()));
CREATE POLICY quiz_drafts_select_active_caller ON public.quiz_drafts
  AS RESTRICTIVE FOR SELECT TO authenticated USING ((SELECT private.is_active_user()));
CREATE POLICY flagged_questions_select_active_caller ON public.flagged_questions
  AS RESTRICTIVE FOR SELECT TO authenticated USING ((SELECT private.is_active_user()));
CREATE POLICY fsrs_cards_select_active_caller ON public.fsrs_cards
  AS RESTRICTIVE FOR SELECT TO authenticated USING ((SELECT private.is_active_user()));
CREATE POLICY user_consents_select_active_caller ON public.user_consents
  AS RESTRICTIVE FOR SELECT TO authenticated USING ((SELECT private.is_active_user()));
CREATE POLICY audit_events_select_active_caller ON public.audit_events
  AS RESTRICTIVE FOR SELECT TO authenticated USING ((SELECT private.is_active_user()));
