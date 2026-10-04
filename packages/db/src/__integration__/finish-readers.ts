import { requireRpcResult } from './guards'
import type { ProgressFixture } from './quiz-progress-fixture'

export type AnswerRow = {
  question_id: string
  is_correct: boolean
  blank_index: number | null
}

/** Service-role read of the graded rows a session wrote. */
export async function answerRows(f: ProgressFixture, sessionId: string): Promise<AnswerRow[]> {
  const { data, error } = await f.admin
    .from('quiz_session_answers')
    .select('question_id, is_correct, blank_index')
    .eq('session_id', sessionId)
  if (error) throw new Error(`answerRows: ${error.message}`)
  if (!Array.isArray(data)) throw new Error('answerRows: unexpected shape')
  return data as AnswerRow[]
}

export async function responseCount(f: ProgressFixture, sessionId: string): Promise<number> {
  const { data, error } = await f.admin
    .from('student_responses')
    .select('id')
    .eq('session_id', sessionId)
  if (error) throw new Error(`responseCount: ${error.message}`)
  return Array.isArray(data) ? data.length : 0
}

export async function fsrsQuestionIds(f: ProgressFixture, questionIds: string[]) {
  const { data, error } = await f.admin
    .from('fsrs_cards')
    .select('question_id')
    .eq('student_id', f.studentId)
    .in('question_id', questionIds)
  if (error) throw new Error(`fsrsQuestionIds: ${error.message}`)
  return (Array.isArray(data) ? data : []).map((r) => (r as { question_id: string }).question_id)
}

export async function auditMetadata(
  f: ProgressFixture,
  sessionId: string,
  eventType: string,
): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await f.admin
    .from('audit_events')
    .select('metadata')
    .eq('resource_id', sessionId)
    .eq('event_type', eventType)
  if (error) throw new Error(`auditMetadata: ${error.message}`)
  return (Array.isArray(data) ? data : []).map(
    (r) => (r as { metadata: Record<string, unknown> }).metadata,
  )
}

export async function sessionRow(f: ProgressFixture, sessionId: string) {
  const { data, error } = await f.admin
    .from('quiz_sessions')
    .select('ended_at, score_percentage, passed, correct_count')
    .eq('id', sessionId)
    .single()
  if (error) throw new Error(`sessionRow: ${error.message}`)
  return requireRpcResult<{
    ended_at: string | null
    score_percentage: number | string | null
    passed: boolean | null
    correct_count: number | null
  }>(data, 'sessionRow')
}
