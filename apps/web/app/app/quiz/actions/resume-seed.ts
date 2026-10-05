// Seeds a freshly minted practice session from a saved draft (#1026). No 'use server' — called by
// resumeQuizSession. The new session's active_device_id is NULL, so the progress RPCs raise no
// takeover for the throwaway device id used here (_save_progress_row, mig 20261002000300).
import type { createServerSupabaseClient } from '@repo/db/server'
import { rpc } from '@/lib/supabase-rpc'
import { toAnswerJson } from './quiz-progress-helpers'
import { SaveAnswerInput } from './quiz-progress-schema'
import type { ResumeContext } from './resume-helpers'

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

const PAYLOAD_KEYS = ['selectedOptionId', 'responseText', 'blankAnswers', 'order', 'mapping']

type SaveAnswerArgs = {
  p_session_id: string
  p_question_id: string
  p_answer: Record<string, unknown>
  p_time_spent_ms: number
  p_device_id: string
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
    timeSpentMs: draftAnswer.responseTimeMs,
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

/** Writes the draft's answers, then its position (clamped to the question count), to the session. */
export async function seedSessionFromDraft(
  supabase: SupabaseClient,
  sessionId: string,
  ctx: ResumeContext,
): Promise<boolean> {
  const deviceId = crypto.randomUUID()
  const answers =
    typeof ctx.answers === 'object' && ctx.answers !== null ? Object.entries(ctx.answers) : []
  for (const entry of answers) {
    const args = toSaveAnswerArgs(sessionId, deviceId, entry)
    if (!args) {
      console.error('[resumeQuizSession] Malformed draft answer for question', entry[0])
      return false
    }
    const { error } = await rpc<null>(supabase, 'save_quiz_answer', args)
    if (error) {
      console.error('[resumeQuizSession] Seed answer error:', error.message)
      return false
    }
  }
  const { error } = await rpc<null>(supabase, 'save_quiz_position', {
    p_session_id: sessionId,
    p_current_index: Math.min(ctx.currentIndex, ctx.questionIds.length - 1),
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
  const { data, error } = await supabase
    .from('quiz_sessions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('student_id', userId)
    .select('id')
  if (error || (data?.length ?? 0) === 0) {
    console.error('[resumeQuizSession] Rollback left an orphan session:', sessionId, error?.message)
  }
}

/** Deletes the draft; false when it errored or was already gone. */
async function deleteSeededDraft(
  supabase: SupabaseClient,
  draftId: string,
  userId: string,
): Promise<boolean> {
  // quiz_drafts uses real DELETE (not soft delete) — approved exception for temp storage
  const { data, error } = await supabase
    .from('quiz_drafts')
    .delete()
    .eq('id', draftId)
    .eq('student_id', userId)
    .select('id')
  if (error) console.error('[resumeQuizSession] Draft delete error:', error.message)
  return !error && (data?.length ?? 0) > 0
}

/**
 * Seeds the new session, then deletes the draft. On any failure the draft is kept and the new
 * session is soft-deleted, so a retry starts clean.
 */
export async function finishResume(
  supabase: SupabaseClient,
  ids: { draftId: string; userId: string; sessionId: string },
  ctx: ResumeContext,
): Promise<boolean> {
  const seeded = await seedSessionFromDraft(supabase, ids.sessionId, ctx)
  if (seeded && (await deleteSeededDraft(supabase, ids.draftId, ids.userId))) return true
  await discardMintedSession(supabase, ids.sessionId, ids.userId)
  return false
}
