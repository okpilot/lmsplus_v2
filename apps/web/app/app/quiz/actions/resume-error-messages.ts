// RPC error token (from start_quiz_session, mig 20260629000600) → user message for the
// resumeQuizSession Server Action. Split out of resume-helpers.ts.
// No `'use server'` — imported by the action.

import { matchRpcError } from '@/lib/rpc-error-match'

// Distinct situations get distinct copy: a different active session vs a stale draft.
const RESUME_ERROR_MESSAGES: Record<string, string> = {
  another_session_active:
    'You already have an active session. Finish or discard it before resuming this one.',
  not_enrolled: 'You are not enrolled in this course.',
  // Reachable on resume: the Supabase auth token can outlive a soft-deleted `users` row,
  // so a deactivated account can pass the action's auth check yet hit this RPC guard.
  'user not found or inactive': 'Your account is no longer active.',
  invalid_question_ids:
    'This saved quiz’s questions are no longer available — it may be out of date.',
  no_questions_provided:
    'This saved quiz’s questions are no longer available — it may be out of date.',
  // Mapped for RPC error-token completeness (agent-semantic-reviewer.md): a legacy draft, or one
  // a student inserts directly, can carry >500 ids.
  too_many_questions:
    'This saved quiz has too many questions and can’t be resumed. Please contact support.',
}

export function mapResumeRpcError(message: string | undefined): string {
  return (
    matchRpcError(message, RESUME_ERROR_MESSAGES) ??
    'Failed to resume this saved quiz. Please try again.'
  )
}
