-- Add has_calculations marker to questions for the quiz-start calc filter (#837).
--
-- The questions table had no way to mark a question as requiring a calculation
-- (mass & balance, navigation, performance, met conversions). This column is the
-- marker; it is backfilled MANUALLY by admins via the question editor + the bulk
-- "mark as calculation" action. Consumed by the tri-state calc filter on the
-- student quiz builder (get_random_question_ids / get_filtered_question_counts,
-- p_calc_mode — see mig 20260611000400).

ALTER TABLE questions ADD COLUMN has_calculations BOOLEAN NOT NULL DEFAULT false;

-- Column-level SELECT gate (mig 20260610000100) REVOKEd the blanket SELECT from
-- `authenticated` and re-GRANTed every column EXCEPT the four answer-key columns.
-- New columns are NOT covered by that grant, so authenticated cannot read
-- has_calculations until granted explicitly. The SECURITY INVOKER `_filtered_question_pool`
-- helper reads q.has_calculations as the student, so without this grant the calc filter
-- fails with "permission denied for table questions" (42501). has_calculations is not
-- answer-key data — exposing it to students is intended (it drives the quiz-start filter).
GRANT SELECT (has_calculations) ON questions TO authenticated;

COMMENT ON COLUMN questions.has_calculations IS
  'Admin-tagged: question requires a calculation. Backfilled manually via the admin question editor / bulk action. Consumed by the quiz-start calc filter (p_calc_mode in the filtered-question-pool RPCs). #837.';
