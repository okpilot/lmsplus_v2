-- Drop dead RPCs: submit_quiz_answer (#1494), get_student_profile_stats (#1663).
-- No app caller remains; students write answers via save_quiz_answer / finish_quiz_session.

DROP FUNCTION public.submit_quiz_answer(uuid, uuid, text, int);
DROP FUNCTION public.get_student_profile_stats();
