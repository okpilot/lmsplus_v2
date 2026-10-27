// RAISE EXCEPTION texts of start_internal_exam_session → user-friendly strings.
// Matched exactly via matchRpcError.

export const START_INTERNAL_EXAM_ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: 'Not authenticated',
  // UNIFIED — never reveal whether the code exists for a different student.
  code_not_found: 'Invalid or expired code. Please contact your administrator.',
  code_not_yours: 'Invalid or expired code. Please contact your administrator.',
  code_expired: 'This code has expired. Please contact your administrator.',
  code_already_used: 'This code has already been used.',
  code_voided: 'This code has been cancelled. Please contact your administrator.',
  active_session_exists:
    'You already have an active internal exam session for this subject. Submit it before starting a new one.',
  // Single-active-session guard (PR A) — a different mode's session is live.
  another_session_active:
    'You already have an active session. Finish or discard it before starting a new one.',
  insufficient_questions_for_exam: 'Cannot start exam: not enough questions configured.',
  exam_config_required:
    'No exam configuration available for this subject. Please contact your administrator.',
  not_enrolled: 'You are not enrolled in this course.',
  'user not found or inactive':
    'Your account is no longer active. Please contact your administrator.',
}
