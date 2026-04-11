-- Replace full UNIQUE constraint with partial unique index on exam_configs.
-- The full constraint blocks re-creation after soft-delete (deleted row still holds the slot).
-- Partial index scopes uniqueness to active (non-deleted) rows only.

ALTER TABLE exam_configs
  DROP CONSTRAINT exam_configs_organization_id_subject_id_key;

CREATE UNIQUE INDEX uq_exam_configs_org_subject_active
  ON exam_configs (organization_id, subject_id)
  WHERE deleted_at IS NULL;
