import { createServerSupabaseClient } from '@repo/db/server'

export type SubjectDetail = {
  id: string
  code: string
  name: string
  short: string
  totalQuestions: number
  // Counts correct responses to ALL non-deleted questions, including ones that
  // later became draft — so it can exceed totalQuestions (active-only). Kept raw
  // on purpose: it's the orphan-retention signal (#540). masteryPercentage is the
  // clamped, display-safe derivative.
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
type QuestionRow = { id: string; subject_id: string; topic_id: string; status: string }
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
    supabase.from('questions').select('id, subject_id, topic_id, status').is('deleted_at', null),
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
  const subjectByQuestionId = new Map<string, string>()
  const topicByQuestionId = new Map<string, string>()
  for (const q of questions) {
    subjectByQuestionId.set(q.id, q.subject_id)
    if (q.topic_id) topicByQuestionId.set(q.id, q.topic_id)
    if (q.status === 'active') {
      const subjectArr = qBySubject.get(q.subject_id)
      if (subjectArr) subjectArr.push(q.id)
      else qBySubject.set(q.subject_id, [q.id])
      if (q.topic_id) {
        const topicArr = qByTopic.get(q.topic_id)
        if (topicArr) topicArr.push(q.id)
        else qByTopic.set(q.topic_id, [q.id])
      }
    }
  }

  const correctBySubject = new Map<string, number>()
  const correctByTopic = new Map<string, number>()
  for (const cid of correctIds) {
    const sid = subjectByQuestionId.get(cid)
    if (sid) correctBySubject.set(sid, (correctBySubject.get(sid) ?? 0) + 1)
    const tid = topicByQuestionId.get(cid)
    if (tid) correctByTopic.set(tid, (correctByTopic.get(tid) ?? 0) + 1)
  }

  return subjects
    .map((s) => {
      const sQuestions = qBySubject.get(s.id) ?? []
      const sCorrect = correctBySubject.get(s.id) ?? 0

      const subjectTopics = topics
        .filter((t) => t.subject_id === s.id)
        .map((t) => {
          const tQuestions = qByTopic.get(t.id) ?? []
          const tCorrect = correctByTopic.get(t.id) ?? 0
          return {
            id: t.id,
            code: t.code,
            name: t.name,
            totalQuestions: tQuestions.length,
            answeredCorrectly: tCorrect,
            masteryPercentage:
              tQuestions.length > 0
                ? Math.min(Math.round((tCorrect / tQuestions.length) * 100), 100)
                : 0,
          }
        })
        .filter((t) => t.totalQuestions > 0 || t.answeredCorrectly > 0)

      return {
        id: s.id,
        code: s.code,
        name: s.name,
        short: s.short,
        totalQuestions: sQuestions.length,
        answeredCorrectly: sCorrect,
        masteryPercentage:
          sQuestions.length > 0
            ? Math.min(Math.round((sCorrect / sQuestions.length) * 100), 100)
            : 0,
        topics: subjectTopics,
      }
    })
    .filter((s) => s.totalQuestions > 0 || s.answeredCorrectly > 0)
}
