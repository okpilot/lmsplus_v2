-- Cross-device resume (#1026) 2e-b2b: the app completes sessions through finish_quiz_session
-- (20261004000300) and complete_overdue_exam_session (20261004000400); no app or SQL caller remains for the
-- legacy submit RPCs. Grants go with the functions.

DROP FUNCTION batch_submit_quiz(uuid, jsonb);
DROP FUNCTION public.submit_vfr_rt_exam_answers(uuid, jsonb);
DROP FUNCTION complete_empty_exam_session(uuid);
