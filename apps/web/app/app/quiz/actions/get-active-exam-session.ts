'use server'

import { createServerSupabaseClient } from '@repo/db/server'

export type ActiveExamSession = {
  sessionId: string
  subjectId: string
  subjectName: string
  startedAt: string
  timeLimitSeconds: number
}

export type GetActiveExamSessionResult =
  | { success: true; sessions: ActiveExamSession[] }
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
      .select('id, subject_id, started_at, time_limit_seconds, easa_subjects(name)')
      .eq('student_id', user.id)
      .is('ended_at', null)
      .is('deleted_at', null)
      .eq('mode', 'mock_exam')
      .order('started_at', { ascending: false })

    if (error) {
      console.error('[getActiveExamSession] Query error:', error.message)
      return { success: false, error: 'Failed to fetch active exam sessions.' }
    }

    const sessions: ActiveExamSession[] = (data ?? []).map((row) => {
      const subjectName =
        row.easa_subjects !== null &&
        typeof row.easa_subjects === 'object' &&
        'name' in row.easa_subjects &&
        typeof (row.easa_subjects as { name: unknown }).name === 'string'
          ? (row.easa_subjects as { name: string }).name
          : 'Unknown subject'
      return {
        sessionId: row.id,
        subjectId: row.subject_id ?? '',
        subjectName,
        startedAt: row.started_at,
        timeLimitSeconds: row.time_limit_seconds ?? 0,
      }
    })

    return { success: true, sessions }
  } catch (err) {
    console.error('[getActiveExamSession] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
