-- Add exam-specific columns to quiz_sessions
-- time_limit_seconds: countdown duration for exam mode (NULL for study mode)
-- passed: whether the student passed the exam (NULL for study mode or incomplete)

ALTER TABLE quiz_sessions
  ADD COLUMN time_limit_seconds INT NULL,
  ADD COLUMN passed BOOLEAN NULL;

-- Add comment for clarity
COMMENT ON COLUMN quiz_sessions.time_limit_seconds IS 'Exam countdown duration in seconds. NULL for study mode.';
COMMENT ON COLUMN quiz_sessions.passed IS 'Whether score met pass_mark threshold. NULL for study mode or incomplete sessions.';
