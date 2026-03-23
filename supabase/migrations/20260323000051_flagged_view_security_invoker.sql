-- Add security_invoker to active_flagged_questions view
-- so RLS policies on flagged_questions are enforced through the view.
CREATE OR REPLACE VIEW active_flagged_questions
WITH (security_invoker = true) AS
  SELECT * FROM flagged_questions WHERE deleted_at IS NULL;
