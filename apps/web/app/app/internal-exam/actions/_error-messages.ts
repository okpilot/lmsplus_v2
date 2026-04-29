// RPC error tokens from start_internal_exam_session (mig 060/065/070/071)
// mapped to user-friendly strings. mapRpcError() runs `String.includes()` so
// each entry must be a literal substring of a RAISE EXCEPTION string. Keep in
// sync with the RPC body if new tokens are added.

export const START_INTERNAL_EXAM_ERROR_MESSAGES: Array<[string, string]> = [
  ['not_authenticated', 'Not authenticated'],
  // UNIFIED — never reveal whether the code exists for a different student.
  ['code_not_found', 'Invalid or expired code. Please contact your administrator.'],
  ['code_not_yours', 'Invalid or expired code. Please contact your administrator.'],
  ['code_expired', 'This code has expired. Please contact your administrator.'],
  ['code_already_used', 'This code has already been used.'],
  ['code_voided', 'This code has been cancelled. Please contact your administrator.'],
  [
    'active_session_exists',
    'You already have an active internal exam session for this subject. Submit it before starting a new one.',
  ],
  ['insufficient_questions_for_exam', 'Cannot start exam: not enough questions configured.'],
  [
    'exam_config_required',
    'No exam configuration available for this subject. Please contact your administrator.',
  ],
  // Literal RAISE EXCEPTION string from mig 070/071 (with spaces, not snake_case).
  [
    'user not found or inactive',
    'Your account is no longer active. Please contact your administrator.',
  ],
]
