// RPC error token (from start_quiz_session, mig 20260629000600) → user message for the
// resumeQuizSession Server Action. Split out of resume-helpers.ts to keep that file under
// the 200-line utility cap (code-style.md §1). No `'use server'` — imported by the action.

// Distinct situations get distinct copy: a different active session vs a stale draft.
// INVARIANT: keys must not be substrings of one another — mapResumeRpcError matches via
// token.includes(key), so an overlapping key would make iteration order decide the mapping.
// Exported so a co-located test can assert the invariant holds as keys are added.
export const RESUME_ERROR_MESSAGES: Record<string, string> = {
  another_session_active:
    'You already have an active session. Finish or discard it before resuming this one.',
  // Reachable on resume: the Supabase auth token can outlive a soft-deleted `users` row,
  // so a deactivated account can pass the action's auth check yet hit this RPC guard.
  'user not found or inactive': 'Your account is no longer active.',
  invalid_question_ids:
    'This saved quiz’s questions are no longer available — it may be out of date.',
  no_questions_provided:
    'This saved quiz’s questions are no longer available — it may be out of date.',
  // Unreachable for a draft saved after the schema cap (.max(500)), but mapped for RPC
  // error-token completeness (agent-semantic-reviewer.md) — a legacy row could carry >500 ids.
  too_many_questions:
    'This saved quiz has too many questions and can’t be resumed. Please contact support.',
}

export function mapResumeRpcError(message: string | undefined): string {
  const token = message ?? ''
  for (const [key, msg] of Object.entries(RESUME_ERROR_MESSAGES)) {
    if (token.includes(key)) return msg
  }
  return 'Failed to resume this saved quiz. Please try again.'
}
