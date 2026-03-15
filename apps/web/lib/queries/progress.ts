import { createServerSupabaseClient } from '@repo/db/server'

export type SubjectDetail = {
  id: string
  code: string
  name: string
  short: string
  totalQuestions: number
  answeredCorrectly: number
  masteryPercentage: number
  topics: TopicDetail[]
}

export type TopicDetail = {
  id: string
  code: string
  name: string
  totalQuestions: number
  answeredCorrectly: number
  masteryPercentage: number
}

type SubjectRow = { id: string; code: string; name: string; short: string; sort_order: number }
type TopicRow = { id: string; code: string; name: string; subject_id: string; sort_order: number }
type QuestionRow = { id: string; subject_id: string; topic_id: string }
type ResponseRow = { question_id: string }

export async function getProgressData(): Promise<SubjectDetail[]> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) throw new Error(`Auth error: ${authError.message}`)
  if (!user) throw new Error('Not authenticated')

  const [subjectsRes, topicsRes, questionsRes, correctRes] = await Promise.all([
    supabase.from('easa_subjects').select('id, code, name, short, sort_order').order('sort_order'),
    supabase
      .from('easa_topics')
      .select('id, code, name, subject_id, sort_order')
      .order('sort_order'),
    supabase.from('questions').select('id, subject_id, topic_id').eq('status', 'active'),
    supabase
      .from('student_responses')
      .select('question_id')
      .eq('student_id', user.id)
      .eq('is_correct', true),
  ])

  const subjects = (subjectsRes.data ?? []) as SubjectRow[]
  const topics = (topicsRes.data ?? []) as TopicRow[]
  const questions = (questionsRes.data ?? []) as QuestionRow[]
  const correctIds = new Set(((correctRes.data ?? []) as ResponseRow[]).map((r) => r.question_id))

  const qBySubject = new Map<string, string[]>()
  const qByTopic = new Map<string, string[]>()
  for (const q of questions) {
    qBySubject.set(q.subject_id, [...(qBySubject.get(q.subject_id) ?? []), q.id])
    qByTopic.set(q.topic_id, [...(qByTopic.get(q.topic_id) ?? []), q.id])
  }

  return subjects
    .map((s) => {
      const sQuestions = qBySubject.get(s.id) ?? []
      const sCorrect = sQuestions.filter((id) => correctIds.has(id))

      const subjectTopics = topics
        .filter((t) => t.subject_id === s.id)
        .map((t) => {
          const tQuestions = qByTopic.get(t.id) ?? []
          const tCorrect = tQuestions.filter((id) => correctIds.has(id))
          return {
            id: t.id,
            code: t.code,
            name: t.name,
            totalQuestions: tQuestions.length,
            answeredCorrectly: tCorrect.length,
            masteryPercentage:
              tQuestions.length > 0 ? Math.round((tCorrect.length / tQuestions.length) * 100) : 0,
          }
        })
        .filter((t) => t.totalQuestions > 0)

      return {
        id: s.id,
        code: s.code,
        name: s.name,
        short: s.short,
        totalQuestions: sQuestions.length,
        answeredCorrectly: sCorrect.length,
        masteryPercentage:
          sQuestions.length > 0 ? Math.round((sCorrect.length / sQuestions.length) * 100) : 0,
        topics: subjectTopics,
      }
    })
    .filter((s) => s.totalQuestions > 0)
}
