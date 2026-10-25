// RAISE EXCEPTION texts of start_vfr_rt_exam_session → user-friendly strings.
// Matched exactly via matchRpcError.

export const START_VFR_RT_EXAM_ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: 'Not authenticated',
  user_not_found_or_inactive: 'Your account is inactive. Please contact your instructor.',
  exam_config_required: 'VFR RT mock exam is not enabled for your organization.',
  // The RPC attaches the shortfall detail via USING DETAIL — logged server-side
  // only, never surfaced to the student.
  insufficient_questions_for_vfr_rt_exam:
    'The VFR RT question pool is incomplete. Please contact your instructor.',
  // Single-active-session guard (PR A) — a different mode's session is live.
  another_session_active:
    'You already have an active session. Finish or discard it before starting a new one.',
}
