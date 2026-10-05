// Seeds a freshly minted practice session from a saved draft (#1026). No 'use server' — called by
// resumeQuizSession. The new session's active_device_id is NULL, so the progress RPCs raise no
// takeover for the throwaway device id used here (_save_progress_row, mig 20261002000300).
import type { createServerSupabaseClient } from '@repo/db/server'
import { rpc } from '@/lib/supabase-rpc'
import { toAnswerJson } from './quiz-progress-helpers'
import { SaveAnswerInput } from './quiz-progress-schema'
import type { ResumeContext } from './resume-helpers'

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

// Tokens save_quiz_answer raises for ONE bad answer (20261002000400). Any other token — session
// state, takeover, transport — says the whole seed cannot proceed and aborts it.
const SKIPPABLE_TOKENS = new Set([
  'invalid_answer',
  'invalid_time_spent',
  'question_not_in_session',
])
const MAX_TIME_SPENT_MS = 86_400_000

const PAYLOAD_KEYS = ['selectedOptionId', 'responseText', 'blankAnswers', 'order', 'mapping']

type SaveAnswerArgs = {
  p_session_id: string
  p_question_id: string
  p_answer: Record<string, unknown>
  p_time_spent_ms: number
  p_device_id: string
}

/** The draft's client-written visit time as an integer the RPC accepts: [0, 24 h], else 0. */
function clampTimeSpentMs(raw: unknown): number {
  if (typeof raw !== 'number' || Number.isNaN(raw)) return 0
  return Math.min(MAX_TIME_SPENT_MS, Math.max(0, Math.trunc(raw)))
}

/** Draft answer (camelCase, client-written JSONB) → validated RPC args, or null when malformed. */
function toSaveAnswerArgs(
  sessionId: string,
  deviceId: string,
  entry: [string, unknown],
): SaveAnswerArgs | null {
  const [questionId, raw] = entry
  if (typeof raw !== 'object' || raw === null) return null
  const draftAnswer = raw as Record<string, unknown>
  const key = PAYLOAD_KEYS.find((k) => draftAnswer[k] !== undefined)
  if (!key) return null
  const parsed = SaveAnswerInput.safeParse({
    sessionId,
    questionId,
    deviceId,
    answer: { [key]: draftAnswer[key] },
    timeSpentMs: clampTimeSpentMs(draftAnswer.responseTimeMs),
  })
  if (!parsed.success) return null
  return {
    p_session_id: sessionId,
    p_question_id: parsed.data.questionId,
    p_answer: toAnswerJson(parsed.data.answer),
    p_time_spent_ms: parsed.data.timeSpentMs,
    p_device_id: deviceId,
  }
}

/** The draft's answers for questions in the session; one RPC per entry, so the rest are dropped. */
function sessionAnswers(ctx: ResumeContext): [string, unknown][] {
  if (typeof ctx.answers !== 'object' || ctx.answers === null) return []
  const inSession = new Set(ctx.questionIds)
  const all = Object.entries(ctx.answers)
  const kept = all.filter(([questionId]) => inSession.has(questionId))
  if (kept.length < all.length) {
    console.warn(
      '[resumeQuizSession] Draft answers outside the session dropped:',
      all.length - kept.length,
    )
  }
  return kept
}

/** Writes the draft's answers, then its position (clamped to [0, last question]), to the session. */
export async function seedSessionFromDraft(
  supabase: SupabaseClient,
  sessionId: string,
  ctx: ResumeContext,
): Promise<boolean> {
  const deviceId = crypto.randomUUID()
  for (const entry of sessionAnswers(ctx)) {
    const args = toSaveAnswerArgs(sessionId, deviceId, entry)
    if (!args) {
      console.warn('[resumeQuizSession] Malformed draft answer skipped for question', entry[0])
      continue
    }
    const { error } = await rpc<null>(supabase, 'save_quiz_answer', args)
    if (error && SKIPPABLE_TOKENS.has(error.message)) {
      console.warn('[resumeQuizSession] Rejected draft answer skipped for question', entry[0])
      continue
    }
    if (error) {
      console.error('[resumeQuizSession] Seed answer error:', error.message)
      return false
    }
  }
  const { error } = await rpc<null>(supabase, 'save_quiz_position', {
    p_session_id: sessionId,
    p_current_index: Math.max(0, Math.min(ctx.currentIndex, ctx.questionIds.length - 1)),
    p_pinned_question_ids: [],
    p_device_id: deviceId,
  })
  if (error) console.error('[resumeQuizSession] Seed position error:', error.message)
  return !error
}

/** Soft-deletes the freshly minted session after a failed seed. Logs, never throws. */
export async function discardMintedSession(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('student_id', userId)
      .select('id')
    if (error || (data?.length ?? 0) === 0) {
      console.error(
        '[resumeQuizSession] Rollback left an orphan session:',
        sessionId,
        error?.message,
      )
    }
  } catch (err) {
    console.error('[resumeQuizSession] Rollback threw:', err)
  }
}

/** Deletes the seeded draft. Best effort: logs a failure, a missing row or a throw; never throws. */
async function deleteSeededDraft(
  supabase: SupabaseClient,
  ids: { draftId: string; userId: string },
): Promise<void> {
  try {
    // quiz_drafts uses real DELETE (not soft delete) — approved exception for temp storage
    const { data, error } = await supabase
      .from('quiz_drafts')
      .delete()
      .eq('id', ids.draftId)
      .eq('student_id', ids.userId)
      .select('id')
    if (error) console.error('[resumeQuizSession] Draft delete error:', error.message)
    else if ((data?.length ?? 0) === 0)
      console.warn('[resumeQuizSession] Draft already gone:', ids.draftId)
  } catch (err) {
    console.error('[resumeQuizSession] Draft delete threw; keeping the seeded session:', err)
  }
}

/**
 * Seeds the new session, then deletes the draft. A failed or thrown seed keeps the draft and
 * soft-deletes the new session (a thrown seed rethrows the original error after the discard). Once
 * seeded the session is always kept: the draft delete is best effort, because a lost response can
 * hide a delete that ran. If the draft survives, its card stays listed.
 */
export async function finishResume(
  supabase: SupabaseClient,
  ids: { draftId: string; userId: string; sessionId: string },
  ctx: ResumeContext,
): Promise<boolean> {
  let seeded: boolean
  try {
    seeded = await seedSessionFromDraft(supabase, ids.sessionId, ctx)
  } catch (err) {
    await discardMintedSession(supabase, ids.sessionId, ids.userId)
    throw err
  }
  if (!seeded) {
    await discardMintedSession(supabase, ids.sessionId, ids.userId)
    return false
  }
  await deleteSeededDraft(supabase, ids)
  return true
}
