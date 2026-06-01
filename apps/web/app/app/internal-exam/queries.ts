import { createServerSupabaseClient } from '@repo/db/server'
import { rpc } from '@/lib/supabase-rpc'

// SECURITY: code values are NEVER returned from this query. Admin distributes
// codes out-of-band; student types via the redemption modal. Shape omits `code`.
export type AvailableInternalExam = {
  id: string
  subjectId: string
  subjectName: string
  subjectShort: string
  expiresAt: string
  issuedAt: string
}

export type InternalExamHistoryEntry = {
  id: string
  subjectId: string
  subjectName: string
  subjectShort: string
  startedAt: string
  endedAt: string | null
  scorePercentage: number | null
  passed: boolean | null
  totalQuestions: number
  answeredCount: number
  attemptNumber: number
}

export type InternalExamQueryResult<T> = { success: boolean; data: T[] }

// RPC row shapes. These match the SECURITY DEFINER functions
// list_my_active_internal_exam_codes() and list_my_internal_exam_history().
// They are not in the generated types yet, so we cast and runtime-guard.
type AvailableRpcRow = {
  id: unknown
  subject_id: unknown
  subject_name: unknown
  subject_short: unknown
  expires_at: unknown
  issued_at: unknown
}

type HistoryRpcRow = {
  id: unknown
  subject_id: unknown
  subject_name: unknown
  subject_short: unknown
  started_at: unknown
  ended_at: unknown
  score_percentage: unknown
  passed: unknown
  total_questions: unknown
  answered_count: unknown
  attempt_number: unknown
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function asNullableString(v: unknown): string | null {
  if (v === null || v === undefined) return null
  return typeof v === 'string' ? v : null
}

function asNumber(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function asNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function asNullableBoolean(v: unknown): boolean | null {
  if (v === null || v === undefined) return null
  return typeof v === 'boolean' ? v : null
}

/**
 * Returns the current student's unconsumed, unvoided, unexpired internal-exam
 * codes via the SECURITY DEFINER RPC list_my_active_internal_exam_codes.
 * NEVER returns the code value itself — that is a privileged secret the admin
 * gives to the student out-of-band.
 */
export async function listAvailableInternalExams(): Promise<
  InternalExamQueryResult<AvailableInternalExam>
> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: true, data: [] }

  const { data, error } = await rpc<AvailableRpcRow[]>(
    supabase,
    'list_my_active_internal_exam_codes',
    {},
  )
  if (error) {
    console.error('[listAvailableInternalExams] Query error:', error.message)
    return { success: false, data: [] }
  }

  if (!Array.isArray(data)) return { success: true, data: [] }

  return {
    success: true,
    data: data.map((row) => ({
      id: asString(row.id),
      subjectId: asString(row.subject_id),
      subjectName: asString(row.subject_name) || 'Unknown subject',
      subjectShort: asString(row.subject_short),
      expiresAt: asString(row.expires_at),
      issuedAt: asString(row.issued_at),
    })),
  }
}

/**
 * Returns the current student's internal-exam session history via the
 * SECURITY DEFINER RPC list_my_internal_exam_history. Newest first.
 * attempt_number is computed in SQL (1 = oldest attempt for that subject).
 */
export async function listMyInternalExamHistory(): Promise<
  InternalExamQueryResult<InternalExamHistoryEntry>
> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: true, data: [] }

  const { data, error } = await rpc<HistoryRpcRow[]>(supabase, 'list_my_internal_exam_history', {})
  if (error) {
    console.error('[listMyInternalExamHistory] Query error:', error.message)
    return { success: false, data: [] }
  }

  if (!Array.isArray(data)) return { success: true, data: [] }

  return {
    success: true,
    data: data.map((row) => ({
      id: asString(row.id),
      subjectId: asString(row.subject_id),
      subjectName: asString(row.subject_name) || 'Unknown subject',
      subjectShort: asString(row.subject_short),
      startedAt: asString(row.started_at),
      endedAt: asNullableString(row.ended_at),
      scorePercentage: asNullableNumber(row.score_percentage),
      passed: asNullableBoolean(row.passed),
      totalQuestions: asNumber(row.total_questions),
      answeredCount: asNumber(row.answered_count),
      attemptNumber: asNumber(row.attempt_number) || 1,
    })),
  }
}
