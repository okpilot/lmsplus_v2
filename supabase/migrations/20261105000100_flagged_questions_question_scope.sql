-- flagged_questions: RESTRICTIVE policies cover INSERT and undelete; trigger blocks any question_id change. #1177
CREATE POLICY flagged_questions_insert_visible_question ON public.flagged_questions
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.questions q WHERE q.id = flagged_questions.question_id));

CREATE POLICY flagged_questions_update_visible_question ON public.flagged_questions
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    deleted_at IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.questions q WHERE q.id = flagged_questions.question_id)
  );

CREATE OR REPLACE FUNCTION public.flagged_questions_protect_question_id()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.question_id IS DISTINCT FROM OLD.question_id THEN
    RAISE EXCEPTION 'flagged_questions.question_id is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.flagged_questions_protect_question_id() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_flagged_questions_protect_question_id
  BEFORE UPDATE OF question_id ON public.flagged_questions
  FOR EACH ROW EXECUTE FUNCTION public.flagged_questions_protect_question_id();
COMMENT ON TRIGGER trg_flagged_questions_protect_question_id ON public.flagged_questions IS 'question_id is immutable. #1177';
