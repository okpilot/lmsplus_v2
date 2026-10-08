-- #1494: drops the legacy per-answer RPC submit_quiz_answer(uuid, uuid, text, int). Answers are saved with
-- save_quiz_answer and graded by finish_quiz_session; no app or SQL caller remains. The grant goes with the function.

DROP FUNCTION IF EXISTS public.submit_quiz_answer(uuid, uuid, text, integer);
