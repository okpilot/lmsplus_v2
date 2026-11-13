-- #1181: a live question needs a subtopic when its topic has live subtopics.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.questions q
    WHERE q.deleted_at IS NULL AND q.subtopic_id IS NULL
      AND EXISTS (SELECT 1 FROM public.easa_subtopics s WHERE s.topic_id = q.topic_id AND s.deleted_at IS NULL)
  ) THEN
    RAISE EXCEPTION 'questions_require_subtopic: live questions without subtopic exist in topics that have subtopics';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.questions_require_subtopic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.deleted_at IS NULL AND NEW.subtopic_id IS NULL AND EXISTS (
    SELECT 1 FROM public.easa_subtopics s WHERE s.topic_id = NEW.topic_id AND s.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'subtopic_required' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.questions_require_subtopic() FROM PUBLIC;

CREATE TRIGGER questions_require_subtopic
  BEFORE INSERT OR UPDATE OF topic_id, subtopic_id, deleted_at ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.questions_require_subtopic();
