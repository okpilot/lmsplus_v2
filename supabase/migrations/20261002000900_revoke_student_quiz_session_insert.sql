-- Students start sessions only through SECURITY DEFINER start RPCs; closes red-team GK/GL; #1026.
DROP POLICY "students_insert_sessions" ON public.quiz_sessions;
REVOKE INSERT ON public.quiz_sessions FROM authenticated;
