'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { rpc } from '@/lib/supabase-rpc'
import { extractPassMark, extractQuestionIds, isExamOverdue } from './_overdue-helpers'

export type ActiveExamSession = {
  sessionId: string
  subjectId: string
  subjectName: string
  subjectCode: string
  startedAt: string
  timeLimitSeconds: number
  passMark: number
  questionIds: string[]
}

export type GetActiveExamSessionResult =
  | {
      success: true
      sessions: ActiveExamSession[]
      orphanedSessionIds: string[]
      expiredSessionIds: string[]
    }
  | { success: false; error: string }

export async function getActiveExamSession(): Promise<GetActiveExamSessionResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('quiz_sessions')
      .select('id, subject_id, started_at, time_limit_seconds, config, easa_subjects(name, short)')
      .eq('student_id', user.id)
      .is('ended_at', null)
      .is('deleted_at', null)
      .eq('mode', 'mock_exam')
      .order('started_at', { ascending: false })

    if (error) {
      console.error('[getActiveExamSession] Query error:', error.message)
      return { success: false, error: 'Failed to fetch active exam sessions.' }
    }

    const sessions: ActiveExamSession[] = []
    const orphanedSessionIds: string[] = []
    const expiredSessionIds: string[] = []
    for (const row of data ?? []) {
      const questionIds = extractQuestionIds(row.config)
      const passMark = extractPassMark(row.config)
      if (!questionIds || passMark === null) {
        const reason = !questionIds ? 'malformed questionIds' : 'malformed pass_mark'
        console.error(`[getActiveExamSession] Skipping row (${reason}):`, row.id)
        orphanedSessionIds.push(row.id)
        continue
      }
      const timeLimitSeconds = row.time_limit_seconds ?? 0
      if (isExamOverdue(row.started_at, timeLimitSeconds)) {
        const { error: rpcErr } = await rpc<unknown>(supabase, 'complete_overdue_exam_session', {
          p_session_id: row.id,
        })
        if (rpcErr) {
          console.error('[getActiveExamSession] Auto-complete failed:', row.id, rpcErr.message)
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
    console.error('[getActiveExamSession] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
