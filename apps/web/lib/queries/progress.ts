import { createServerSupabaseClient } from '@repo/db/server'
import { rpc } from '@/lib/supabase-rpc'

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
// Aggregated mastery counts from get_student_mastery_stats(). topic_id === null marks a
// subject-level row; a non-null topic_id marks a topic-level row. bigint arrives as
// string or number depending on driver — coerce with Number() before use.
type MasteryRow = {
  subject_id: string
  topic_id: string | null
  total: number | string
  correct: number | string
}

export async function getProgressData(): Promise<SubjectDetail[]> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) throw new Error(`Auth error: ${authError.message}`)
  if (!user) throw new Error('Not authenticated')

  const [subjectsRes, topicsRes, masteryResult] = await Promise.all([
    supabase.from('easa_subjects').select('id, code, name, short, sort_order').order('sort_order'),
    supabase
      .from('easa_topics')
      .select('id, code, name, subject_id, sort_order')
      .order('sort_order'),
    rpc<MasteryRow[]>(supabase, 'get_student_mastery_stats', {}),
  ])

  if (masteryResult.error) {
    throw new Error(`Failed to fetch mastery stats: ${masteryResult.error.message}`)
  }

  const subjects = (subjectsRes.data ?? []) as SubjectRow[]
  const topics = (topicsRes.data ?? []) as TopicRow[]

  // Partition the aggregated rows into subject-level (topic_id === null) and
  // topic-level (topic_id !== null) count maps. Postgres aggregates well under the
  // 1000-row PostgREST cap, so these counts are never truncated (#540).
  const subjectMap = new Map<string, { total: number; correct: number }>()
  const topicMap = new Map<string, { total: number; correct: number }>()
  for (const row of masteryResult.data ?? []) {
    if (!row.subject_id) continue
    const counts = { total: Number(row.total), correct: Number(row.correct) }
    if (row.topic_id === null) subjectMap.set(row.subject_id, counts)
    else topicMap.set(row.topic_id, counts)
  }

  return subjects
    .map((s) => {
      const { total: sTotal, correct: sCorrect } = subjectMap.get(s.id) ?? { total: 0, correct: 0 }

      const subjectTopics = topics
        .filter((t) => t.subject_id === s.id)
        .map((t) => {
          const { total: tTotal, correct: tCorrect } = topicMap.get(t.id) ?? {
            total: 0,
            correct: 0,
          }
          return {
            id: t.id,
            code: t.code,
            name: t.name,
            totalQuestions: tTotal,
            answeredCorrectly: tCorrect,
            masteryPercentage:
              tTotal > 0 ? Math.min(Math.round((tCorrect / tTotal) * 100), 100) : 0,
          }
        })
        .filter((t) => t.totalQuestions > 0 || t.answeredCorrectly > 0)

      return {
        id: s.id,
        code: s.code,
        name: s.name,
        short: s.short,
        totalQuestions: sTotal,
        answeredCorrectly: sCorrect,
        masteryPercentage: sTotal > 0 ? Math.min(Math.round((sCorrect / sTotal) * 100), 100) : 0,
        topics: subjectTopics,
      }
    })
    .filter((s) => s.totalQuestions > 0 || s.answeredCorrectly > 0)
}
