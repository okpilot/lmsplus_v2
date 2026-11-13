-- #1181: a live question needs a subtopic when its topic has live subtopics.

DO $$
DECLARE
  v_missing text;
  v_mismatch text;
BEGIN
  SELECT string_agg(id::text, ', ') INTO v_missing FROM (
    SELECT q.id FROM public.questions q
    WHERE q.deleted_at IS NULL AND q.subtopic_id IS NULL
      AND EXISTS (SELECT 1 FROM public.easa_subtopics s WHERE s.topic_id = q.topic_id AND s.deleted_at IS NULL)
    LIMIT 10
  ) x;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'questions_require_subtopic: subtopic_required violated by live questions: %', v_missing;
  END IF;

  SELECT string_agg(id::text, ', ') INTO v_mismatch FROM (
    SELECT q.id FROM public.questions q
    WHERE q.deleted_at IS NULL AND q.subtopic_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.easa_subtopics s WHERE s.id = q.subtopic_id AND s.topic_id <> q.topic_id)
    LIMIT 10
  ) x;
  IF v_mismatch IS NOT NULL THEN
    RAISE EXCEPTION 'questions_require_subtopic: subtopic_topic_mismatch violated by live questions: %', v_mismatch;
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
    RAISE EXCEPTION 'subtopic_required';
  END IF;
  IF NEW.deleted_at IS NULL AND NEW.subtopic_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.easa_subtopics s WHERE s.id = NEW.subtopic_id AND s.topic_id <> NEW.topic_id
  ) THEN
    RAISE EXCEPTION 'subtopic_topic_mismatch';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.questions_require_subtopic() FROM PUBLIC;

CREATE TRIGGER questions_require_subtopic
  BEFORE INSERT OR UPDATE OF topic_id, subtopic_id, deleted_at ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.questions_require_subtopic();

REVOKE UPDATE (topic_id) ON public.easa_subtopics FROM authenticated;
