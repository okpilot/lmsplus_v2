'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import {
  extractPassMark,
  extractQuestionIds,
  isExamOverdue,
} from '@/app/app/quiz/actions/_overdue-helpers'
import { rpc } from '@/lib/supabase-rpc'

export type ActiveInternalExamSession = {
  sessionId: string
  subjectId: string
  subjectName: string
  subjectCode: string
  startedAt: string
  timeLimitSeconds: number
  passMark: number
  questionIds: string[]
}

export type GetActiveInternalExamSessionResult =
  | {
      success: true
      sessions: ActiveInternalExamSession[]
      orphanedSessionIds: string[]
      expiredSessionIds: string[]
    }
  | { success: false; error: string }

export async function getActiveInternalExamSession(): Promise<GetActiveInternalExamSessionResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Not authenticated' }

    const { data: userRow, error: userErr } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (userErr || !userRow?.organization_id) {
      console.error('[getActiveInternalExamSession] User lookup error:', userErr?.message)
      return { success: false, error: 'Failed to fetch active internal exam sessions.' }
    }

    const { data, error } = await supabase
      .from('quiz_sessions')
      .select('id, subject_id, started_at, time_limit_seconds, config, easa_subjects(name, short)')
      .eq('student_id', user.id)
      .eq('organization_id', userRow.organization_id)
      .is('ended_at', null)
      .is('deleted_at', null)
      .eq('mode', 'internal_exam')
      .order('started_at', { ascending: false })

    if (error) {
      console.error('[getActiveInternalExamSession] Query error:', error.message)
      return { success: false, error: 'Failed to fetch active internal exam sessions.' }
    }

    const sessions: ActiveInternalExamSession[] = []
    const orphanedSessionIds: string[] = []
    const expiredSessionIds: string[] = []
    for (const row of data ?? []) {
      const questionIds = extractQuestionIds(row.config)
      const passMark = extractPassMark(row.config)
      if (!questionIds || passMark === null) {
        const reason = !questionIds ? 'malformed questionIds' : 'malformed pass_mark'
        console.error(`[getActiveInternalExamSession] Skipping row (${reason}):`, row.id)
        orphanedSessionIds.push(row.id)
        continue
      }
      // Defensive: a row with non-positive/non-integer time_limit_seconds or an
      // unparseable started_at can't be evaluated by isExamOverdue. Internal
      // exam mode has no discard path, so a stranded row would lock the
      // student into a non-expiring official attempt. Quarantine instead.
      const rawTimeLimit = row.time_limit_seconds
      if (
        typeof rawTimeLimit !== 'number' ||
        !Number.isFinite(rawTimeLimit) ||
        rawTimeLimit <= 0 ||
        !Number.isInteger(rawTimeLimit)
      ) {
        console.error(
          '[getActiveInternalExamSession] Skipping row (invalid time_limit_seconds):',
          row.id,
        )
        orphanedSessionIds.push(row.id)
        continue
      }
      if (typeof row.started_at !== 'string' || Number.isNaN(Date.parse(row.started_at))) {
        console.error('[getActiveInternalExamSession] Skipping row (invalid started_at):', row.id)
        orphanedSessionIds.push(row.id)
        continue
      }
      const timeLimitSeconds = rawTimeLimit
      if (isExamOverdue(row.started_at, timeLimitSeconds)) {
        const { error: rpcErr } = await rpc<unknown>(supabase, 'complete_overdue_exam_session', {
          p_session_id: row.id,
        })
        if (rpcErr) {
          // Auto-complete failed: route to orphanedSessionIds so the discard-only
          // banner handles it (mirrors get-active-exam-session.ts).
          const log = '[getActiveInternalExamSession] Auto-complete failed:'
          console.error(log, row.id, rpcErr.message)
          orphanedSessionIds.push(row.id)
          continue
        }
        expiredSessionIds.push(row.id)
        continue
      }
      const rel = row.easa_subjects as { name?: unknown; short?: unknown } | null
      sessions.push({
        sessionId: row.id,
        subjectId: row.subject_id ?? '',
        subjectName: typeof rel?.name === 'string' ? rel.name : 'Unknown subject',
        subjectCode: typeof rel?.short === 'string' ? rel.short : '',
        startedAt: row.started_at,
        timeLimitSeconds,
        passMark,
        questionIds,
      })
    }

    return { success: true, sessions, orphanedSessionIds, expiredSessionIds }
  } catch (err) {
    console.error('[getActiveInternalExamSession] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
