import { createServerSupabaseClient } from '@repo/db/server'

export type SessionReport = {
  id: string
  mode: string
  subjectName: string | null
  totalQuestions: number
  answeredCount: number
  correctCount: number
  scorePercentage: number | null
  startedAt: string
  endedAt: string
  durationMinutes: number
}

type SessionRow = {
  id: string
  mode: string
  total_questions: number
  correct_count: number
  score_percentage: number | null
  started_at: string
  ended_at: string
  subject_id: string | null
}

type SubjectNameRow = { id: string; name: string }

type AnswerCountRow = { session_id: string }

export async function getAllSessions(): Promise<SessionReport[]> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) throw new Error(`Auth error: ${authError.message}`)
  if (!user) throw new Error('Not authenticated')

  const { data: sessions, error: sessionsError } = await supabase
    .from('quiz_sessions')
    .select(
      'id, mode, total_questions, correct_count, score_percentage, started_at, ended_at, subject_id',
    )
    .eq('student_id' as string & keyof never, user.id)
    .not('ended_at' as string & keyof never, 'is', null)
    .order('started_at' as string & keyof never, { ascending: false })
    .returns<SessionRow[]>()

  if (sessionsError) throw new Error(`Failed to fetch sessions: ${sessionsError.message}`)
  if (!sessions?.length) return []

  const sessionIds = sessions.map((s) => s.id)

  const [subjectsResult, answersResult] = await Promise.all([
    (() => {
      const subjectIds = [...new Set(sessions.map((s) => s.subject_id).filter(Boolean))] as string[]
      return subjectIds.length > 0
        ? supabase
            .from('easa_subjects')
            .select('id, name')
            .in('id' as string & keyof never, subjectIds)
            .returns<SubjectNameRow[]>()
        : Promise.resolve({ data: [] as SubjectNameRow[], error: null })
    })(),
    supabase
      .from('quiz_session_answers')
      .select('session_id')
      .in('session_id' as string & keyof never, sessionIds)
      .returns<AnswerCountRow[]>(),
  ])

  if (subjectsResult.error)
    throw new Error(`Failed to fetch subjects: ${subjectsResult.error.message}`)
  if (!subjectsResult.data) throw new Error('Failed to fetch subjects: unexpected null response')
  if (answersResult.error)
    throw new Error(`Failed to fetch answer counts: ${answersResult.error.message}`)

  const subjectMap = new Map((subjectsResult.data ?? []).map((s) => [s.id, s.name]))

  const answeredCountMap = new Map<string, number>()
  for (const row of answersResult.data ?? []) {
    answeredCountMap.set(row.session_id, (answeredCountMap.get(row.session_id) ?? 0) + 1)
  }

  return sessions.map((s) => {
    const start = new Date(s.started_at).getTime()
    const end = new Date(s.ended_at).getTime()
    const durationMinutes = Math.max(0, Math.round((end - start) / 60000))

    return {
      id: s.id,
      mode: s.mode,
      subjectName: s.subject_id ? (subjectMap.get(s.subject_id) ?? null) : null,
      totalQuestions: s.total_questions,
      answeredCount: answeredCountMap.get(s.id) ?? s.total_questions,
      correctCount: s.correct_count,
      scorePercentage: s.score_percentage,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      durationMinutes,
    }
  })
}
