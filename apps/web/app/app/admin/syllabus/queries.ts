import { createServerSupabaseClient } from '@repo/db/server'
import type { SyllabusSubject, SyllabusTree } from './types'

type SubjectRow = { id: string; code: string; name: string; short: string; sort_order: number }
type TopicRow = { id: string; subject_id: string; code: string; name: string; sort_order: number }
type SubtopicRow = { id: string; topic_id: string; code: string; name: string; sort_order: number }

export async function getSyllabusTree(): Promise<SyllabusTree> {
  const supabase = await createServerSupabaseClient()

  const [subjectsRes, topicsRes, subtopicsRes, countsRes] = await Promise.all([
    supabase.from('easa_subjects').select('*').order('sort_order'),
    supabase.from('easa_topics').select('*').order('sort_order'),
    supabase.from('easa_subtopics').select('*').order('sort_order'),
    supabase.rpc('get_question_counts'),
  ])

  for (const res of [subjectsRes, topicsRes, subtopicsRes, countsRes]) {
    if (res.error) {
      console.error('[getSyllabusTree] DB error:', res.error.message)
      throw new Error('Failed to load syllabus tree')
    }
  }

  const subjects = (subjectsRes.data ?? []) as SubjectRow[]
  const topics = (topicsRes.data ?? []) as TopicRow[]
  const subtopics = (subtopicsRes.data ?? []) as SubtopicRow[]
  const countRows = countsRes.data ?? []

  // Sum question counts per subject/topic/subtopic (each row contributes to all three levels)
  const subjectCounts = new Map<string, number>()
  const topicCounts = new Map<string, number>()
  const subtopicCounts = new Map<string, number>()

  for (const row of countRows) {
    if (row.subject_id) {
      subjectCounts.set(row.subject_id, (subjectCounts.get(row.subject_id) ?? 0) + row.n)
    }
    if (row.topic_id) {
      topicCounts.set(row.topic_id, (topicCounts.get(row.topic_id) ?? 0) + row.n)
    }
    if (row.subtopic_id) {
      subtopicCounts.set(row.subtopic_id, (subtopicCounts.get(row.subtopic_id) ?? 0) + row.n)
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
