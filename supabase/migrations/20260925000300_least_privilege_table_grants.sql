-- Least-privilege table grants (#1367, part B1). anon holds no privilege on any
-- public table. authenticated keeps only the table commands a permitting RLS
-- policy allows; SELECT is unchanged. users and quiz_sessions
-- keep their column-level UPDATE grants: a table-level UPDATE revoke would drop them.
-- New postgres-owned tables default to anon nothing, authenticated SELECT only; a
-- migration adding a write path GRANTs it explicitly. Function EXECUTE: part B2.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

REVOKE REFERENCES, TRIGGER, MAINTAIN ON ALL TABLES IN SCHEMA public FROM authenticated;

REVOKE INSERT, UPDATE, DELETE ON
  public.audit_events,
  public.courses,
  public.lessons,
  public.organizations,
  public.question_banks,
  public.quiz_session_answers,
  public.student_responses,
  public.user_consents,
  public.active_flagged_questions
FROM authenticated;

REVOKE INSERT, DELETE ON public.internal_exam_codes, public.users FROM authenticated;

REVOKE UPDATE ON public.exam_config_distributions, public.question_comments FROM authenticated;

REVOKE DELETE ON
  public.exam_configs,
  public.flagged_questions,
  public.questions,
  public.quiz_sessions
FROM authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, MAINTAIN ON TABLES FROM authenticated;
