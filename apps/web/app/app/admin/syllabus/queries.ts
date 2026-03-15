import { createServerSupabaseClient } from '@repo/db/server'
import type { SyllabusSubject, SyllabusTree } from './types'

type SubjectRow = { id: string; code: string; name: string; short: string; sort_order: number }
type TopicRow = { id: string; subject_id: string; code: string; name: string; sort_order: number }
type SubtopicRow = { id: string; topic_id: string; code: string; name: string; sort_order: number }
type QuestionRef = {
  subject_id: string | null
  topic_id: string | null
  subtopic_id: string | null
}

export async function getSyllabusTree(): Promise<SyllabusTree> {
  const supabase = await createServerSupabaseClient()

  const [subjectsRes, topicsRes, subtopicsRes, countsRes] = await Promise.all([
    supabase.from('easa_subjects').select('*').order('sort_order'),
    supabase.from('easa_topics').select('*').order('sort_order'),
    supabase.from('easa_subtopics').select('*').order('sort_order'),
    supabase.from('questions').select('subject_id, topic_id, subtopic_id'),
  ])

  const subjects = (subjectsRes.data ?? []) as SubjectRow[]
  const topics = (topicsRes.data ?? []) as TopicRow[]
  const subtopics = (subtopicsRes.data ?? []) as SubtopicRow[]
  const questions = (countsRes.data ?? []) as QuestionRef[]

  // Count questions per subject/topic/subtopic
  const subjectCounts = new Map<string, number>()
  const topicCounts = new Map<string, number>()
  const subtopicCounts = new Map<string, number>()

  for (const q of questions) {
    if (q.subject_id) {
      subjectCounts.set(q.subject_id, (subjectCounts.get(q.subject_id) ?? 0) + 1)
    }
    if (q.topic_id) {
      topicCounts.set(q.topic_id, (topicCounts.get(q.topic_id) ?? 0) + 1)
    }
    if (q.subtopic_id) {
      subtopicCounts.set(q.subtopic_id, (subtopicCounts.get(q.subtopic_id) ?? 0) + 1)
    }
  }

  // Build tree
  const tree: SyllabusTree = subjects.map(
    (s): SyllabusSubject => ({
      id: s.id,
      code: s.code,
      name: s.name,
      short: s.short,
      sort_order: s.sort_order,
      questionCount: subjectCounts.get(s.id) ?? 0,
      topics: topics
        .filter((t) => t.subject_id === s.id)
        .map((t) => ({
          id: t.id,
          code: t.code,
          name: t.name,
          sort_order: t.sort_order,
          questionCount: topicCounts.get(t.id) ?? 0,
          subtopics: subtopics
            .filter((st) => st.topic_id === t.id)
            .map((st) => ({
              id: st.id,
              code: st.code,
              name: st.name,
              sort_order: st.sort_order,
              questionCount: subtopicCounts.get(st.id) ?? 0,
            })),
        })),
    }),
  )

  return tree
}
