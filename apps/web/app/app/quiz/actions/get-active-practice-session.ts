'use server'

import { createServerSupabaseClient } from '@repo/db/server'

// Practice modes are the only quiz_sessions a student can hold open without a
// server-backed recovery surface — exams have ResumeExamBanner / recovery banners,
// Discovery auto-clears on the next start. A practice session abandoned in one
// browser is detectable only via localStorage (QuizRecoveryBanner), so a cross-
// browser / cleared-storage student gets `another_session_active` with no way to
// clear it. This query backs ActivePracticeBanner — the server-visible discard path.
const PRACTICE_MODES = ['quick_quiz', 'smart_review'] as const

export type ActivePracticeSession = {
  sessionId: string
  mode: (typeof PRACTICE_MODES)[number]
  subjectId: string
  subjectName: string
  subjectCode: string
  startedAt: string
}

export type GetActivePracticeSessionResult =
  | { success: true; session: ActivePracticeSession | null }
  | { success: false; error: string }

export async function getActivePracticeSession(): Promise<GetActivePracticeSessionResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Not authenticated' }

    const { data, error } = await supabase
      .from('quiz_sessions')
      .select('id, mode, subject_id, started_at, easa_subjects!subject_id(name, short)')
      .eq('student_id', user.id)
      .in('mode', PRACTICE_MODES)
      .is('ended_at', null)
      .is('deleted_at', null)
      .order('started_at', { ascending: false })
      // The single-active-session invariant guarantees ≤1 active session total;
      // bound to 1 defensively so a stray row never widens the result.
      .limit(1)

    if (error) {
      console.error('[getActivePracticeSession] Query error:', error.message)
      return { success: false, error: 'Failed to fetch active practice session.' }
    }

    const row = data?.[0]
    if (!row) return { success: true, session: null }

    const rel = row.easa_subjects as { name?: unknown; short?: unknown } | null
    return {
      success: true,
      session: {
        sessionId: row.id,
        mode: row.mode as (typeof PRACTICE_MODES)[number],
        subjectId: row.subject_id ?? '',
        subjectName: typeof rel?.name === 'string' ? rel.name : 'Unknown subject',
        subjectCode: typeof rel?.short === 'string' ? rel.short : '',
        startedAt: row.started_at,
      },
    }
  } catch (err) {
    console.error('[getActivePracticeSession] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
