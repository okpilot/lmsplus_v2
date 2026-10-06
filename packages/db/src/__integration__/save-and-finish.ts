import type { SupabaseClient } from '@supabase/supabase-js'
import { DEVICE, type FinishResult } from './finish-fixture'
import { requireRpcResult } from './guards'

/** Device id every seed save/finish call presents (no start RPC pins a device). */
export const SEED_DEVICE = DEVICE

export type SeedAnswer = {
  questionId: string
  answer: unknown
  timeSpentMs?: number
}

/** Saved-answer payload builders, one per question type (exact keys the save RPC validates). */
export const P = {
  mc: (selectedOptionId: string) => ({ selected_option_id: selectedOptionId }),
  short: (responseText: string) => ({ response_text: responseText }),
  dialog: (blanks: string[]) => ({
    blanks: blanks.map((responseText, blankIndex) => ({
      blank_index: blankIndex,
      response_text: responseText,
    })),
  }),
  ordering: (itemIds: string[]) => ({ order: itemIds }),
  diagram: (pairs: Array<{ zone_id: string; label_id: string }>) => ({ mapping: pairs }),
}

/** Saves seed answers through save_quiz_answer. Throws on the first error. */
export async function saveSeedAnswers(
  client: SupabaseClient,
  sessionId: string,
  answers: SeedAnswer[],
) {
  for (const a of answers) {
    const { error } = await client.rpc('save_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: a.questionId,
      p_answer: a.answer,
      p_time_spent_ms: a.timeSpentMs ?? 1000,
      p_device_id: SEED_DEVICE,
    })
    if (error) throw new Error(`save_quiz_answer: ${error.message}`)
  }
}

/** Finishes a session through finish_quiz_session. Throws on error. */
export async function finishSeedSession(
  client: SupabaseClient,
  sessionId: string,
): Promise<FinishResult> {
  const { data, error } = await client.rpc('finish_quiz_session', {
    p_session_id: sessionId,
    p_device_id: SEED_DEVICE,
  })
  if (error) throw new Error(`finish_quiz_session: ${error.message}`)
  return requireRpcResult<FinishResult>(data, 'finish_quiz_session')
}

/** Saves the answers, then finishes the session. Save BEFORE any backdating. */
export async function saveAndFinish(
  client: SupabaseClient,
  sessionId: string,
  answers: SeedAnswer[],
): Promise<FinishResult> {
  await saveSeedAnswers(client, sessionId, answers)
  return finishSeedSession(client, sessionId)
}
