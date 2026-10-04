// RPC error token → user message for the quiz-progress writes: save_quiz_answer,
// save_quiz_position, claim_quiz_session, and the progress save inside check_quiz_answer /
// check_non_mc_answer. Latest definitions: supabase/migrations/20261002000300 (helpers),
// …0400, …0500, …0600, …0700, …0800 and 20261003000300 (`session_saved`). The check RPCs also
// raise legacy SPACED strings — mapped here too. No `'use server'` — imported by actions.

// INVARIANT: keys must not be substrings of one another — mapProgressRpcError matches via
// message.includes(key), so an overlapping key would make iteration order decide the mapping.
const NOT_FOUND = 'This session could not be found.'
const NOT_ACTIVE = 'Your account is no longer active.'
const BAD_ANSWER = 'This answer could not be saved. Please review it and try again.'
const BAD_PROGRESS = 'Your progress could not be saved. Reload the page and try again.'
const NO_QUESTION = 'That question is not part of this session.'
export const SIGN_IN = 'Your sign-in has expired. Please sign in again.'
const NO_FEATURE = 'This session type does not support saving progress.'
const DAMAGED = 'This session is damaged and cannot save progress. Please start a new one.'

// Exported so a co-located test can assert the invariant holds as keys are added.
export const PROGRESS_ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: SIGN_IN,
  'not authenticated': SIGN_IN,
  user_not_found_or_inactive: NOT_ACTIVE,
  'user not found or inactive': NOT_ACTIVE,
  session_not_found: NOT_FOUND,
  'session not found or not owned by this student': NOT_FOUND,
  session_discarded: 'This session was discarded.',
  session_ended: 'This session has already ended.',
  session_saved: 'This quiz was saved for later. Resume it from your saved quizzes.',
  unsupported_session_mode: NO_FEATURE,
  session_expired:
    'The time limit for this session has passed. Finish the session to submit your answers.',
  session_taken_over:
    'This quiz is open in another tab or device — reload this page to continue here.',
  session_config_malformed: DAMAGED,
  'session config is malformed': DAMAGED,
  question_not_in_session: NO_QUESTION,
  'does not belong to session': NO_QUESTION,
  question_not_found: 'This question is no longer available.',
  'question not found or has no correct option': 'This question is no longer available.',
  invalid_answer: BAD_ANSWER,
  answer_type_mismatch: BAD_ANSWER,
  invalid_blank_index: BAD_ANSWER,
  unsupported_question_type: BAD_ANSWER,
  question_blank_missing_canonical: BAD_ANSWER,
  question_missing_canonical_answer: BAD_ANSWER,
  invalid_time_spent: BAD_PROGRESS,
  invalid_position: BAD_PROGRESS,
  invalid_device: BAD_PROGRESS,
}

const DISPLAYABLE = new Set(Object.values(PROGRESS_ERROR_MESSAGES))

/** Mapped copy for a recognised RPC error; `fallback` (generic, not displayable) otherwise. */
export function mapProgressRpcError(message: string | undefined, fallback: string): string {
  const token = message ?? ''
  for (const [key, msg] of Object.entries(PROGRESS_ERROR_MESSAGES)) {
    if (token.includes(key)) return msg
  }
  return fallback
}

/** True for the copy shown when the sign-in has expired. */
export function isSignInError(message: string | undefined): boolean {
  return message === SIGN_IN
}

/** True for the copy shown when another tab or device holds the session. */
export function isTakeoverError(message: string | undefined): boolean {
  return message === PROGRESS_ERROR_MESSAGES.session_taken_over
}

/** True only for copy produced by the map above — safe to show the student verbatim. */
export function isDisplayableProgressError(message: string): boolean {
  return DISPLAYABLE.has(message)
}

/** Wraps a verifySessionMembership result as an action failure, or null when it passed. */
export function mapMembershipError(
  membershipError: string | null,
): { success: false; error: string } | null {
  return membershipError ? { success: false, error: membershipError } : null
}
