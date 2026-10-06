/**
 * Seeding through the student progress path (#1026): save_quiz_answer per
 * question, then finish_quiz_session grades the saved progress. Used instead of
 * the one-shot batch RPCs wherever a spec only needs a graded/ended session.
 *
 * Save BEFORE any backdating: save_quiz_answer refuses a session past
 * time_limit + 30s. No claim step is needed — the device is only checked once a
 * session has an active_device_id, which no start RPC sets.
 */

import type { getAdminClient } from '../../helpers/supabase'
import {
  VFR_RT_DIAGRAM_ANSWER,
  VFR_RT_MC_CORRECT,
  VFR_RT_ORDERING_KEY_IDS,
} from './seed-vfr-rt-part3'
import { VFR_RT_DF_ANSWER, VFR_RT_SA_ANSWER } from './seed-vfr-rt-pool'

type AdminClient = ReturnType<typeof getAdminClient>
type RpcError = { message: string }
type RpcResult = { data: unknown; error: RpcError | null }
export type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>
}

/** Constant device id for seeding; any uuid works while no active_device_id is set. */
export const SEED_DEVICE_ID = '11111111-1111-4111-8111-111111111111'
const SEED_TIME_SPENT_MS = 1500
const MC_OPTION_ID = /^[a-d]$/

/**
 * One saved answer. `answer` is one of: {selected_option_id} | {response_text} |
 * {blanks:[{blank_index,response_text}]} | {order:[ids]} | {mapping:[{zone_id,label_id}]}.
 */
export type SeedAnswer = { question_id: string; answer: Record<string, unknown> }

/** Save each answer through save_quiz_answer; throws on the first failure. */
export async function saveSeedAnswers(
  client: RpcClient,
  sessionId: string,
  answers: SeedAnswer[],
): Promise<void> {
  for (const a of answers) {
    const { error } = await client.rpc('save_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: a.question_id,
      p_answer: a.answer,
      p_time_spent_ms: SEED_TIME_SPENT_MS,
      p_device_id: SEED_DEVICE_ID,
    })
    if (error) throw new Error(`save_quiz_answer failed: ${error.message}`)
  }
}

/** Call finish_quiz_session and hand back the raw result so a spec can assert on it. */
export function finishSeedSession(client: RpcClient, sessionId: string): PromiseLike<RpcResult> {
  return client.rpc('finish_quiz_session', { p_session_id: sessionId, p_device_id: SEED_DEVICE_ID })
}

/** Save every answer, then finish; throws on a save failure, returns the finish result. */
export async function saveAndFinish(
  client: RpcClient,
  sessionId: string,
  answers: SeedAnswer[],
): Promise<RpcResult> {
  await saveSeedAnswers(client, sessionId, answers)
  return finishSeedSession(client, sessionId)
}

/** Question ids a session's config pins, guarded against a malformed config. */
async function readSessionQuestionIds(admin: AdminClient, sessionId: string): Promise<string[]> {
  const { data: session, error } = await admin
    .from('quiz_sessions')
    .select('config')
    .eq('id', sessionId)
    .single()
  if (error || !session) throw new Error(`buildMcProgressAnswers session: ${error?.message}`)
  const rawIds = (session.config as { question_ids?: unknown })?.question_ids
  if (!Array.isArray(rawIds)) {
    throw new Error(`buildMcProgressAnswers: config.question_ids is not an array`)
  }
  const ids = rawIds.filter((v): v is string => typeof v === 'string')
  if (ids.length === 0) throw new Error('buildMcProgressAnswers: session has no question_ids')
  return ids
}

/** First option id of an MC question; save_quiz_answer accepts only a-d. */
function firstOptionId(raw: unknown): string {
  const q = raw as { id: unknown; options: unknown }
  if (typeof q.id !== 'string') throw new Error('buildMcProgressAnswers: question id not a string')
  if (!Array.isArray(q.options)) {
    throw new Error(`buildMcProgressAnswers: question ${q.id} options is not an array`)
  }
  const optionId = (q.options[0] as { id?: unknown } | undefined)?.id
  if (typeof optionId !== 'string' || !MC_OPTION_ID.test(optionId)) {
    throw new Error(
      `buildMcProgressAnswers: question ${q.id} option id ${String(optionId)} is not a-d`,
    )
  }
  return optionId
}

/** One MC answer (the first option) per question the session pins, read via service role. */
export async function buildMcProgressAnswers(
  admin: AdminClient,
  sessionId: string,
): Promise<SeedAnswer[]> {
  const ids = await readSessionQuestionIds(admin, sessionId)
  const { data: questions, error } = await admin
    .from('questions')
    .select('id, options')
    .in('id', ids)
  if (error || !Array.isArray(questions)) {
    throw new Error(`buildMcProgressAnswers questions: ${error?.message ?? 'unexpected shape'}`)
  }
  return questions.map((raw) => ({
    question_id: (raw as { id: string }).id,
    answer: { selected_option_id: firstOptionId(raw) },
  }))
}

/** Correct saved answer for one VFR RT pool question. */
function vfrRtAnswer(
  question: { question_type: string },
  failPart2: boolean,
): Record<string, unknown> {
  switch (question.question_type) {
    case 'short_answer':
      return { response_text: VFR_RT_SA_ANSWER }
    case 'dialog_fill':
      return {
        blanks: [{ blank_index: 0, response_text: failPart2 ? 'WRONG' : VFR_RT_DF_ANSWER }],
      }
    case 'multiple_choice':
      return { selected_option_id: VFR_RT_MC_CORRECT }
    case 'ordering':
      return { order: VFR_RT_ORDERING_KEY_IDS }
    case 'diagram_label':
      return { mapping: VFR_RT_DIAGRAM_ANSWER }
    default:
      throw new Error(
        `buildVfrRtProgressAnswers: unsupported question_type ${question.question_type}`,
      )
  }
}

/**
 * One saved answer per VFR RT pool question, all correct by default.
 * `failPart2` makes every dialog_fill blank wrong (part2_pct -> 0).
 */
export function buildVfrRtProgressAnswers(
  questions: Array<{ id: string; question_type: string }>,
  opts?: { failPart2?: boolean },
): SeedAnswer[] {
  const failPart2 = opts?.failPart2 ?? false
  return questions.map((q) => ({ question_id: q.id, answer: vfrRtAnswer(q, failPart2) }))
}
