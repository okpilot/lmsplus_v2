import type { SupabaseClient } from '@supabase/supabase-js'
import { requireRpcResult } from './guards'
import type { ProgressFixture } from './quiz-progress-fixture'
import { ORDER_ITEMS } from './quiz-progress-questions'

export const DEVICE = '11111111-1111-4111-8111-111111111111'
export const OTHER_DEVICE = '22222222-2222-4222-8222-222222222222'

export type FinishResult = {
  results: unknown[]
  total_questions: number
  answered_count: number
  correct_count: number
  score_percentage: number | string
  passed: boolean | null
  expired?: boolean
  session_id?: string
  part1_pct?: number | string
  part2_pct?: number | string
  part3_pct?: number | string
  passed_overall?: boolean
}

/** Saved-answer shapes the student save RPCs store, per question type. */
export const RIGHT = {
  mc: { selected_option_id: 'b' },
  short: { response_text: 'wilco' },
  dialog: { blanks: [{ blank_index: 0, response_text: 'cleared' }] },
  ordering: { order: ORDER_ITEMS.map((i) => i.id) },
  diagram: { mapping: [{ zone_id: 'zone-1', label_id: 'lbl-1' }] },
}
export const WRONG_MC = { selected_option_id: 'a' }

export const secondsAgo = (s: number) => new Date(Date.now() - s * 1000).toISOString()

/** Saves one answer through the real student RPC (save_quiz_answer). */
export async function saveAnswer(
  f: ProgressFixture,
  sessionId: string,
  questionId: string,
  answer: unknown,
) {
  const { error } = await f.student.rpc('save_quiz_answer', {
    p_session_id: sessionId,
    p_question_id: questionId,
    p_answer: answer,
    p_time_spent_ms: 1000,
    p_device_id: DEVICE,
  })
  if (error) throw new Error(`saveAnswer: ${error.message}`)
}

/** Saves answers through the real student RPC. */
export async function saveAnswers(
  f: ProgressFixture,
  sessionId: string,
  entries: Array<[string, unknown]>,
) {
  for (const [questionId, answer] of entries) await saveAnswer(f, sessionId, questionId, answer)
}

/** Records a viewed-only row (answer NULL) the way the app does. */
export async function saveViewedOnly(f: ProgressFixture, sessionId: string, questionId: string) {
  const { error } = await f.student.rpc('save_quiz_position', {
    p_session_id: sessionId,
    p_current_index: 0,
    p_pinned_question_ids: [],
    p_device_id: DEVICE,
    p_question_id: questionId,
    p_time_spent_ms: 500,
  })
  if (error) throw new Error(`saveViewedOnly: ${error.message}`)
}

export async function claimSession(f: ProgressFixture, sessionId: string, device: string) {
  const { error } = await f.student.rpc('claim_quiz_session', {
    p_session_id: sessionId,
    p_device_id: device,
  })
  if (error) throw new Error(`claimSession: ${error.message}`)
}

/** Inserts a progress row directly, bypassing the save RPCs' shape validation. */
export async function insertRawProgress(
  f: ProgressFixture,
  sessionId: string,
  questionId: string,
  answer: unknown,
) {
  const { error } = await f.admin.from('quiz_session_progress').insert({
    session_id: sessionId,
    question_id: questionId,
    student_id: f.studentId,
    answer,
    time_spent_ms: 1000,
    answered_at: new Date().toISOString(),
  })
  if (error) throw new Error(`insertRawProgress: ${error.message}`)
}

export async function backdateSession(f: ProgressFixture, sessionId: string, seconds: number) {
  const { error } = await f.admin
    .from('quiz_sessions')
    .update({ started_at: secondsAgo(seconds) })
    .eq('id', sessionId)
  if (error) throw new Error(`backdateSession: ${error.message}`)
}

export function finishSession(
  client: SupabaseClient,
  sessionId: string,
  device: string | null = DEVICE,
) {
  return client.rpc('finish_quiz_session', { p_session_id: sessionId, p_device_id: device })
}

export async function finishOk(f: ProgressFixture, sessionId: string): Promise<FinishResult> {
  const { data, error } = await finishSession(f.student, sessionId)
  if (error) throw new Error(`finish_quiz_session: ${error.message}`)
  return requireRpcResult<FinishResult>(data, 'finish_quiz_session')
}

/** Inserts an extra active question that shares the fixture's org, bank, subject and topic. */
export async function insertExtraQuestion(f: ProgressFixture, spec: Record<string, unknown>) {
  const { data: base, error: baseErr } = await f.admin
    .from('questions')
    .select('organization_id, bank_id, subject_id, topic_id, created_by')
    .eq('id', f.shortId)
    .single()
  if (baseErr) throw new Error(`insertExtraQuestion base: ${baseErr.message}`)
  const { data, error } = await f.admin
    .from('questions')
    .insert({
      ...requireRpcResult<Record<string, unknown>>(base, 'insertExtraQuestion base'),
      subtopic_id: null,
      difficulty: 'medium',
      status: 'active',
      explanation_text: 'extra',
      ...spec,
    })
    .select('id')
    .single()
  if (error) throw new Error(`insertExtraQuestion: ${error.message}`)
  return requireRpcResult<{ id: string }>(data, 'insertExtraQuestion').id
}

export const insertTwoBlankDialog = (f: ProgressFixture) =>
  insertExtraQuestion(f, {
    question_type: 'dialog_fill',
    question_text: 'Two blanks',
    dialog_template: '[atc] {{0|cleared}} to {{1|land}}.',
    blanks_config: [
      { index: 0, canonical: 'cleared', synonyms: [] },
      { index: 1, canonical: 'land', synonyms: [] },
    ],
  })

export const insertTwoZoneDiagram = (f: ProgressFixture) =>
  insertExtraQuestion(f, {
    question_type: 'diagram_label',
    question_text: 'Label two zones',
    diagram_config: {
      image_ref: 'rwy-27-09-lh-pattern',
      zones: [
        { id: 'zn-a', x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
        { id: 'zn-b', x: 0.6, y: 0.6, w: 0.1, h: 0.1 },
      ],
      labels: [
        { id: 'lb-a', text: 'Upwind' },
        { id: 'lb-b', text: 'Downwind' },
      ],
      answer: [
        { zone_id: 'zn-a', label_id: 'lb-a' },
        { zone_id: 'zn-b', label_id: 'lb-b' },
      ],
    },
  })

/** A dialog_fill whose only blank has no canonical answer (authoring defect). */
export const insertDialogWithoutCanonical = (f: ProgressFixture) =>
  insertExtraQuestion(f, {
    question_type: 'dialog_fill',
    question_text: 'Defective dialog',
    dialog_template: '[atc] {{0|cleared}} to land.',
    blanks_config: [{ index: 0, synonyms: [] }],
  })

/** A dialog_fill whose blank index is not an integer (authoring defect no CHECK rejects). */
export const insertDialogWithTextIndex = (f: ProgressFixture) =>
  insertExtraQuestion(f, {
    question_type: 'dialog_fill',
    question_text: 'Defective dialog index',
    dialog_template: '[atc] {{0|cleared}} to land.',
    blanks_config: [{ index: 'x', canonical: 'cleared', synonyms: [] }],
  })
