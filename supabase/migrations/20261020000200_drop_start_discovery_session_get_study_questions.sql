-- #1548 PR3: Study/Discovery starts through start_discovery (20261020000100); no app or SQL caller remains
-- for start_discovery_session or get_study_questions. Grants go with the functions.

DROP FUNCTION public.start_discovery_session(uuid, uuid[]);
DROP FUNCTION public.get_study_questions(uuid[]);

COMMENT ON FUNCTION public.start_discovery(uuid, uuid[], uuid[], int, text[], text, text) IS
  'Study/Discovery start in one call: draws an MC-only, own-org set, creates the discovery session + audit row, returns {session_id, questions, flagged_ids}. DELIBERATE answer-key exposure: questions carry correct_option_id; exam integrity is enforced by the single-active-session check (a live session of any other mode, exam included, raises another_session_active before the payload is returned). Ids and payload come from one statement. Empty draw returns session_id null with no side effect (live sessions untouched, no checks beyond the active-user gate). The "all" filter sentinel is ignored. No replay branch: a concurrent second start raises another_session_active. SECURITY DEFINER, org-scoped by explicit join.';
