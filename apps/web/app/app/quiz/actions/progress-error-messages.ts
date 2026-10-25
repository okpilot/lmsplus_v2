// RPC error token → user message for the quiz-progress writes: save_quiz_answer,
// save_quiz_position, claim_quiz_session, the saved-quiz RPCs and the progress save inside
// check_quiz_answer / check_non_mc_answer. Latest definitions: supabase/migrations/20261002000300
// (helpers), …0400, …0500, …0600, …0700, …0800, 20261003000200 (save/resume/discard saved quiz)
// and 20261003000300 (`session_saved`). The check RPCs also raise legacy SPACED strings — mapped
// here too. No `'use server'` — imported by actions.

import { matchRpcError, type RpcErrorPattern } from '@/lib/rpc-error-match'

const NOT_FOUND = 'This session could not be found.'
export const NOT_ACTIVE = 'Your account is no longer active.'
const BAD_ANSWER = 'This answer could not be saved. Please review it and try again.'
const BAD_PROGRESS = 'Your progress could not be saved. Reload the page and try again.'
const NO_QUESTION = 'That question is not part of this session.'
/** Copy the progress actions return when Zod rejects the input. */
export const INVALID_INPUT = 'Invalid input'
export const SIGN_IN = 'Your sign-in has expired. Please sign in again.'
const NO_FEATURE = 'This session type does not support saving progress.'
export const SAVED_QUIZ_LIMIT =
  'You can keep up to 20 saved quizzes. Discard one before saving another.'
const DAMAGED = 'This session is damaged and cannot save progress. Please start a new one.'

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
  session_not_saved: 'This quiz is not in your saved quizzes.',
  saved_quiz_limit_reached: SAVED_QUIZ_LIMIT,
  another_session_active: 'You already have an active session. Finish, save or discard it first.',
  unsupported_session_mode: NO_FEATURE,
  session_expired:
    'The time limit for this session has passed. Finish the session to submit your answers.',
  session_taken_over:
    'This quiz is open in another tab or device — reload this page to continue here.',
  session_config_malformed: DAMAGED,
  'session config is malformed — question_ids not set': DAMAGED,
  question_not_in_session: NO_QUESTION,
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

// Parameterised RAISE: `question % does not belong to session %` (check_quiz_answer, check_non_mc_answer).
const PROGRESS_ERROR_PATTERNS: ReadonlyArray<RpcErrorPattern<string>> = [
  [/^question \S+ does not belong to session \S+$/, NO_QUESTION],
]

const DISPLAYABLE = new Set(Object.values(PROGRESS_ERROR_MESSAGES))

/** Mapped copy for a recognised RPC error; `fallback` (generic, not displayable) otherwise. */
export function mapProgressRpcError(message: string | undefined, fallback: string): string {
  return matchRpcError(message, PROGRESS_ERROR_MESSAGES, PROGRESS_ERROR_PATTERNS) ?? fallback
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
