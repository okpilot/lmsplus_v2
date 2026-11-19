-- block disable/delete/subject or org move of an exam config while a live (not soft-deleted) scheduled or open sitting uses the subject.
CREATE OR REPLACE FUNCTION private.trg_exam_config_sitting_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF ((OLD.enabled AND NOT NEW.enabled) OR (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
      OR NEW.subject_id IS DISTINCT FROM OLD.subject_id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id)
     AND EXISTS (
       SELECT 1 FROM public.exam_sitting_entries e
         JOIN public.exam_sittings s ON s.id = e.sitting_id
        WHERE e.organization_id = OLD.organization_id AND e.subject_id = OLD.subject_id
          AND e.deleted_at IS NULL AND s.deleted_at IS NULL AND s.status IN ('scheduled', 'open')
          AND NOT private.sitting_day_ended(s.scheduled_at)) THEN
    RAISE EXCEPTION 'exam_config_in_use';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.trg_exam_config_sitting_block() FROM PUBLIC, anon, authenticated;
