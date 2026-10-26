-- BEFORE INSERT guard on quiz_sessions: subject and config.question_ids must be in the caller's enrolled courses. #1637

CREATE OR REPLACE FUNCTION public.quiz_sessions_enforce_enrolment() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.subject_id IS NOT NULL
     AND NOT (NEW.subject_id IN (SELECT private.accessible_subject_ids())) THEN
    RAISE EXCEPTION 'not_enrolled';
  END IF;

  IF jsonb_typeof(NEW.config->'question_ids') = 'array'
     AND EXISTS (
       SELECT 1
       FROM public.questions q
       WHERE q.id IN (
         SELECT (e.value #>> '{}')::uuid FROM jsonb_array_elements(NEW.config->'question_ids') e
       )
       AND NOT (q.subject_id IN (SELECT private.accessible_subject_ids()))
     ) THEN
    RAISE EXCEPTION 'not_enrolled';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.quiz_sessions_enforce_enrolment() FROM PUBLIC, anon;

COMMENT ON FUNCTION public.quiz_sessions_enforce_enrolment() IS
  'Raises not_enrolled when a quiz_sessions insert targets a subject, or carries question ids, outside the caller''s enrolled courses. No-op without auth.uid() (service role). #1637';

CREATE TRIGGER trg_quiz_sessions_enforce_enrolment
  BEFORE INSERT ON public.quiz_sessions
  FOR EACH ROW EXECUTE FUNCTION public.quiz_sessions_enforce_enrolment();
