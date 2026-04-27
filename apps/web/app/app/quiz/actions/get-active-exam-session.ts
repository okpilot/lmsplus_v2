'use server'

import { createServerSupabaseClient } from '@repo/db/server'

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
  | { success: true; sessions: ActiveExamSession[]; orphanedSessionIds: string[] }
  | { success: false; error: string }

function extractQuestionIds(config: unknown): string[] | null {
  if (typeof config !== 'object' || config === null) return null
  const ids = (config as Record<string, unknown>).question_ids
  if (!Array.isArray(ids) || ids.length === 0) return null
  if (ids.some((id) => typeof id !== 'string' || id.length === 0)) return null
  return ids as string[]
}

function extractPassMark(config: unknown): number | null {
  if (typeof config !== 'object' || config === null) return null
  const pm = (config as Record<string, unknown>).pass_mark
  if (typeof pm !== 'number' || !Number.isFinite(pm) || pm < 0 || pm > 100) return null
  return pm
}

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
    for (const row of data ?? []) {
      const questionIds = extractQuestionIds(row.config)
      const passMark = extractPassMark(row.config)
      if (!questionIds || passMark === null) {
        console.error('[getActiveExamSession] Skipping row with malformed config:', row.id)
        orphanedSessionIds.push(row.id)
        continue
      }
      const subjectRel =
        row.easa_subjects !== null && typeof row.easa_subjects === 'object'
          ? (row.easa_subjects as { name?: unknown; short?: unknown })
          : null
      const subjectName =
        subjectRel && typeof subjectRel.name === 'string' ? subjectRel.name : 'Unknown subject'
      const subjectCode = subjectRel && typeof subjectRel.short === 'string' ? subjectRel.short : ''
      sessions.push({
        sessionId: row.id,
        subjectId: row.subject_id ?? '',
        subjectName,
        subjectCode,
        startedAt: row.started_at,
        timeLimitSeconds: row.time_limit_seconds ?? 0,
        passMark,
        questionIds,
      })
    }

    return { success: true, sessions, orphanedSessionIds }
  } catch (err) {
    console.error('[getActiveExamSession] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
