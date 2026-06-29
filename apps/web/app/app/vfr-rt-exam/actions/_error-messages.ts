// RPC error tokens from start_vfr_rt_exam_session (mig 099 / 20260610000800)
// mapped to user-friendly strings. mapRpcError() runs `String.includes()` so
// each entry must be a literal substring of a RAISE EXCEPTION string. Keep in
// sync with the RPC body if new tokens are added.

export const START_VFR_RT_EXAM_ERROR_MESSAGES: Array<[string, string]> = [
  ['not_authenticated', 'Not authenticated'],
  ['user_not_found_or_inactive', 'Your account is inactive. Please contact your instructor.'],
  ['exam_config_required', 'VFR RT mock exam is not enabled for your organization.'],
  // The RPC attaches the shortfall detail via USING DETAIL — logged server-side
  // only, never surfaced to the student.
  [
    'insufficient_questions_for_vfr_rt_exam',
    'The VFR RT question pool is incomplete. Please contact your instructor.',
  ],
  // Rare concurrent-start race: the RPC normally resumes an in-flight session,
  // but if the unique-constraint loser's re-read misses, it raises this. A
  // reload re-triggers the resume path.
  [
    'active_session_exists',
    'A VFR RT exam session is already starting. Please reload and try again.',
  ],
  // Single-active-session guard (PR A) — a different mode's session is live.
  [
    'another_session_active',
    'You already have an active session. Finish or discard it before starting a new one.',
  ],
]
