// RPC error tokens from start_vfr_rt_exam_session (mig 099 / 20260610000800)
// mapped to user-friendly strings. mapRpcError() runs `String.includes()` so
// each entry must be a literal substring of a RAISE EXCEPTION string. Keep in
// sync with the RPC body if new tokens are added.

export const START_VFR_RT_EXAM_ERROR_MESSAGES: Array<[string, string]> = [
  ['not_authenticated', 'Not authenticated'],
  ['exam_config_required', 'VFR RT mock exam is not enabled for your organization.'],
  // The RPC attaches the shortfall detail via USING DETAIL — logged server-side
  // only, never surfaced to the student.
  [
    'insufficient_questions_for_vfr_rt_exam',
    'The VFR RT question pool is incomplete. Please contact your instructor.',
  ],
]
