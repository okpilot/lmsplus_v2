-- codes link to a sitting entry (NULL = legacy code). Sitting is reached via entry.
ALTER TABLE public.internal_exam_codes ADD COLUMN sitting_entry_id uuid;
ALTER TABLE public.internal_exam_codes
  ADD CONSTRAINT internal_exam_codes_sitting_entry_fkey
  FOREIGN KEY (sitting_entry_id, organization_id, subject_id, student_id)
  REFERENCES public.exam_sitting_entries (id, organization_id, subject_id, user_id);
CREATE UNIQUE INDEX uq_internal_exam_codes_live_entry
  ON public.internal_exam_codes (sitting_entry_id)
  WHERE sitting_entry_id IS NOT NULL AND deleted_at IS NULL
    AND (voided_at IS NULL OR consumed_at IS NOT NULL);
CREATE INDEX idx_internal_exam_codes_consumed_session
  ON public.internal_exam_codes (consumed_session_id) WHERE consumed_session_id IS NOT NULL;
-- Per-entry lookups also need the voided and unused rows the partial unique index excludes.
CREATE INDEX idx_internal_exam_codes_sitting_entry
  ON public.internal_exam_codes (sitting_entry_id);
