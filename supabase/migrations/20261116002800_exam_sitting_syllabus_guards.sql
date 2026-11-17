-- Live-parent guards on exam_sitting_entries.subject_id (form of 20261107000100).
-- Subject delete is already blocked by the exam_configs predicate in soft_delete_syllabus_item.
CREATE TRIGGER exam_sitting_entries_subject_id_live_parent_ins
  AFTER INSERT ON public.exam_sitting_entries FOR EACH ROW WHEN (NEW.subject_id IS NOT NULL)
  EXECUTE FUNCTION public.syllabus_live_parent('easa_subjects', 'subject_id');
CREATE TRIGGER exam_sitting_entries_subject_id_live_parent_upd
  AFTER UPDATE OF subject_id ON public.exam_sitting_entries FOR EACH ROW
  WHEN (NEW.subject_id IS NOT NULL AND (NEW.subject_id IS DISTINCT FROM OLD.subject_id))
  EXECUTE FUNCTION public.syllabus_live_parent('easa_subjects', 'subject_id');
