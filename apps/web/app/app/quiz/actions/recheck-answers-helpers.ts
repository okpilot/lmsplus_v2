// Session read and per-answer grading for recheckRestoredAnswers. No 'use server': these
// return answer keys, so they must never become endpoints.

import type { AnswerFeedback } from '../types'
import { gradeAnswer } from './check-answer-helpers'
import {
  checkDiagramLabelAnswer,
  checkDialogFillAnswer,
  checkOrderingAnswer,
  checkShortAnswer,
} from './check-non-mc-answer-dispatch'
import type { SupabaseClient } from './check-non-mc-answer-helpers'
import { PROGRESS_ERROR_MESSAGES, SIGN_IN } from './progress-error-messages'
import { type RecheckItem, RecheckItemSchema } from './recheck-answers-schema'

type GradeOpts = { item: RecheckItem; sessionId: string; deviceId: string }
type Graded = { ok: true; feedback: AnswerFeedback } | { ok: false; error: string }

/** The questions of the caller's active session; null when it is gone or not theirs. */
export async function readSessionQuestionIds(
  supabase: SupabaseClient,
  opts: { sessionId: string; userId: string },
): Promise<Set<string> | null | { error: string }> {
  const { data: session, error } = await supabase
    .from('quiz_sessions')
    .select('config')
    .eq('id', opts.sessionId)
    .eq('student_id', opts.userId)
    .is('ended_at', null)
    .is('deleted_at', null)
    .single()
  if (error) {
    if (error.code === 'PGRST116') return null
    console.error('[recheckRestoredAnswers] Session lookup error:', error.message, error.code)
    return { error: 'Could not check answer' }
  }
  const ids = (session as unknown as { config: { question_ids: unknown } } | null)?.config
    ?.question_ids
  return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [])
}

type Base = { questionId: string; sessionId: string; deviceId: string }

/** Sends one answer to the check matching its type. */
function dispatchGrade(supabase: SupabaseClient, item: RecheckItem, base: Base) {
  if ('selectedOptionId' in item) {
    return gradeAnswer(supabase, { ...base, selectedOptionId: item.selectedOptionId })
  }
  if ('responseText' in item) {
    return checkShortAnswer(supabase, { ...base, responseText: item.responseText })
  }
  if ('order' in item) return checkOrderingAnswer(supabase, { ...base, order: item.order })
  if ('mapping' in item) {
    return checkDiagramLabelAnswer(supabase, { ...base, mapping: item.mapping })
  }
  return checkDialogFillAnswer(supabase, { ...base, blankAnswers: item.blankAnswers })
}

async function gradeItem(supabase: SupabaseClient, opts: GradeOpts): Promise<Graded> {
  const { item, sessionId, deviceId } = opts
  const r = await dispatchGrade(supabase, item, {
    questionId: item.questionId,
    sessionId,
    deviceId,
  })
  if (!r.success) return { ok: false, error: r.error }
  const { success: _success, ...rest } = r
  return {
    ok: true,
    feedback: 'questionType' in rest ? rest : { questionType: 'multiple_choice', ...rest },
  }
}

const ENDS_BATCH = [
  'session_not_found',
  'session_discarded',
  'session_ended',
  'session_saved',
  'unsupported_session_mode',
  'session_config_malformed',
  'session_expired',
].map((token) => PROGRESS_ERROR_MESSAGES[token])

/** Errors the caller must see: the tab lost the session, the sign-in expired, or the account is inactive. */
function isFatal(error: string): boolean {
  return (
    error === SIGN_IN ||
    error === PROGRESS_ERROR_MESSAGES.session_taken_over ||
    error === PROGRESS_ERROR_MESSAGES.user_not_found_or_inactive
  )
}

type BatchOpts = { raw: unknown[]; allowed: Set<string>; sessionId: string; deviceId: string }

type BatchResult = { feedback: Record<string, AnswerFeedback>; fatal: string | null; done: boolean }

/**
 * Grades the answers one by one; stops at the first error that applies to the whole session.
 * `done` means the session can grade nothing more, so the caller sends no further batch.
 */
export async function gradeBatch(supabase: SupabaseClient, opts: BatchOpts): Promise<BatchResult> {
  const feedback: Record<string, AnswerFeedback> = {}
  for (const raw of opts.raw) {
    const parsed = RecheckItemSchema.safeParse(raw)
    if (!parsed.success) {
      console.error('[recheckRestoredAnswers] Skipped an invalid answer')
      continue
    }
    const item = parsed.data
    if (!opts.allowed.has(item.questionId)) {
      console.error('[recheckRestoredAnswers] Question not in session:', item.questionId)
      continue
    }
    const graded = await gradeItem(supabase, {
      item,
      sessionId: opts.sessionId,
      deviceId: opts.deviceId,
    })
    if (graded.ok) {
      feedback[item.questionId] = graded.feedback
      continue
    }
    console.error('[recheckRestoredAnswers] Grading failed:', item.questionId, graded.error)
    if (isFatal(graded.error)) return { feedback, fatal: graded.error, done: true }
    if (ENDS_BATCH.includes(graded.error)) return { feedback, fatal: null, done: true }
  }
  return { feedback, fatal: null, done: false }
}
