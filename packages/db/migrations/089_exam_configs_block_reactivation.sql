-- Migration 089: block direct reactivation of soft-deleted exam_configs (#755).
--
-- Attack vector AJ: an admin issues a direct UPDATE exam_configs SET deleted_at = NULL
-- to reactivate a soft-deleted config, bypassing the de-dup logic in upsert_exam_config.
-- That RPC only ever writes to rows that are already active (deleted_at IS NULL) — its
-- UPDATE branch touches only enabled/total_questions/time_limit_seconds/pass_mark/updated_at
-- and its INSERT path creates a fresh row, so it never clears deleted_at itself.
-- There is no legitimate path today that reactivates a soft-deleted exam_config.
--
-- Fix: a BEFORE UPDATE trigger raises an exception when deleted_at transitions from
-- NOT NULL to NULL. The trigger is unconditional — no role exemption — because there is
-- no legitimate reactivation path. A future controlled reactivation RPC would need to
-- be exempted here (e.g. by checking current_role or a session variable).

CREATE OR REPLACE FUNCTION block_exam_config_reactivation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    RAISE EXCEPTION 'exam_config reactivation must go through upsert_exam_config';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_exam_config_reactivation ON exam_configs;
CREATE TRIGGER trg_block_exam_config_reactivation
  BEFORE UPDATE OF deleted_at ON exam_configs
  FOR EACH ROW
  EXECUTE FUNCTION block_exam_config_reactivation();
