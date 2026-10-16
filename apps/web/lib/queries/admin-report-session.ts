import { cache } from 'react'
import { requireAdmin } from '@/lib/auth/require-admin'
import { fetchAdminSessionForReport, fetchSessionAnswerRows } from './admin-report-helpers'

export type AdminReportSessionRow = {
  id: string
  mode: string
  subject_id: string | null
  started_at: string
  ended_at: string | null
  total_questions: number
  correct_count: number
  score_percentage: number | string | null
  student_id: string
  passed: boolean | null
  time_limit_seconds: number | null
}

export type AdminReportAnswerRow = { question_id: string; answered_at: string }

export type AdminReportSessionResult =
  | { ok: true; session: AdminReportSessionRow; answerRows: AdminReportAnswerRow[] }
  | { ok: false }

const SESSION_SELECT =
  'id, mode, subject_id, started_at, ended_at, total_questions, correct_count, score_percentage, student_id, passed, time_limit_seconds'

// Cache key is sessionId only; identity and organization come from the cache()d requireAdmin
// of the same request, so one render reads the session and its answer rows once.
// Render path only; not for Server Actions (cache() does not memoize there).
export const loadAdminReportSession = cache(
  async (sessionId: string): Promise<AdminReportSessionResult> => {
    if (!sessionId) return { ok: false }
    const { organizationId } = await requireAdmin()

    const { data: session, error: sessionError } =
      await fetchAdminSessionForReport<AdminReportSessionRow>({
        sessionId,
        organizationId,
        select: SESSION_SELECT,
        logPrefix: '[loadAdminReportSession]',
      })
    if (sessionError) return { ok: false }
    // Not found, or not yet completed — prevents mid-session answer exposure
    if (!session?.ended_at) return { ok: false }

    // Session org-membership verified above — sessionId is safe to use unscoped.
    const { data: answerRows, error } = await fetchSessionAnswerRows<AdminReportAnswerRow>({
      sessionId,
      select: 'question_id, answered_at',
      orderColumns: ['answered_at', 'id'],
    })
    if (error) {
      console.error('[loadAdminReportSession] Answer rows query error:', error.message)
      return { ok: false }
    }
    return { ok: true, session, answerRows }
  },
)
