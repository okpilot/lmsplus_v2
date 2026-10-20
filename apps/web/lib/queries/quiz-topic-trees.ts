import { createServerSupabaseClient } from '@repo/db/server'
import { cache } from 'react'
import type { SubtopicOption, TopicWithSubtopics } from './quiz-query-types'
import { getActiveQuestionCounts, type QuestionCountRow } from './quiz-question-counts'

type TopicTreeTopicRow = { id: string; code: string; name: string; sort_order: number }
type TopicTreeSubtopicRow = {
  id: string
  code: string
  name: string
  sort_order: number
  topic_id: string
}

/** Sums the active-question count rows of one subject per topic and per subtopic. */
function sumCounts(counts: QuestionCountRow[], subjectId: string) {
  const topicCounts = new Map<string, number>()
  const subtopicCounts = new Map<string, number>()
  for (const row of counts) {
    if (row.subject_id !== subjectId) continue
    topicCounts.set(row.topic_id, (topicCounts.get(row.topic_id) ?? 0) + Number(row.n))
    if (row.subtopic_id !== null) {
      subtopicCounts.set(
        row.subtopic_id,
        (subtopicCounts.get(row.subtopic_id) ?? 0) + Number(row.n),
      )
    }
  }
  return { topicCounts, subtopicCounts }
}

/**
 * Shapes one subject's topic tree: topics (sorted as given) each with their subtopics,
 * dropping every topic and subtopic that has no active questions.
 */
export function buildTopicTree(opts: {
  topics: TopicTreeTopicRow[]
  subtopics: TopicTreeSubtopicRow[]
  counts: QuestionCountRow[]
  subjectId: string
}): TopicWithSubtopics[] {
  const { topicCounts, subtopicCounts } = sumCounts(opts.counts, opts.subjectId)

  const subtopicsByTopic = new Map<string, SubtopicOption[]>()
  for (const st of opts.subtopics) {
    const count = subtopicCounts.get(st.id) ?? 0
    if (count === 0) continue
    const list = subtopicsByTopic.get(st.topic_id) ?? []
    list.push({ id: st.id, code: st.code, name: st.name, questionCount: count })
    subtopicsByTopic.set(st.topic_id, list)
  }

  return opts.topics
    .map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      questionCount: topicCounts.get(t.id) ?? 0,
      subtopics: subtopicsByTopic.get(t.id) ?? [],
    }))
    .filter((t) => t.questionCount > 0)
}

/** Buckets topic rows by subject id, preserving the given order within each subject. */
export function groupTopicsBySubject<T extends { subject_id: string }>(topics: T[]) {
  const bySubject = new Map<string, T[]>()
  for (const t of topics) {
    const list = bySubject.get(t.subject_id) ?? []
    list.push(t)
    bySubject.set(t.subject_id, list)
  }
  return bySubject
}

/**
 * Every subject's topic tree in one read (3 round trips total, in parallel), keyed by
 * subject id. Subjects whose built tree is empty are omitted so the client falls back to
 * the per-subject action. An empty counts result is treated as a failure for the same
 * reason: `getActiveQuestionCounts` degrades to `[]`, which would otherwise yield an
 * all-empty preload. The two table reads are unfiltered, so each asks for the exact row
 * count and a result cut at PostgREST `max_rows` throws instead of silently truncating.
 * Per-request memoised via `cache()`; the caller catches a throw.
 */
export const getAllTopicTrees = cache(async (): Promise<Record<string, TopicWithSubtopics[]>> => {
  const supabase = await createServerSupabaseClient()

  const [topicsRes, subtopicsRes, counts] = await Promise.all([
    supabase
      .from('easa_topics')
      .select('id, subject_id, code, name, sort_order', { count: 'exact' })
      .order('sort_order'),
    supabase
      .from('easa_subtopics')
      .select('id, code, name, sort_order, topic_id', { count: 'exact' })
      .order('sort_order'),
    getActiveQuestionCounts(),
  ])

  if (topicsRes.error) throw new Error(`Failed to fetch topics: ${topicsRes.error.message}`)
  if (subtopicsRes.error)
    throw new Error(`Failed to fetch subtopics: ${subtopicsRes.error.message}`)
  if (!counts.length) throw new Error('Failed to fetch topic trees: no question counts')

  const topics = (topicsRes.data ?? []) as (TopicTreeTopicRow & { subject_id: string })[]
  const subtopics = (subtopicsRes.data ?? []) as TopicTreeSubtopicRow[]
  if (topicsRes.count !== topics.length || subtopicsRes.count !== subtopics.length) {
    throw new Error('Failed to fetch topic trees: topic trees truncated at max_rows')
  }

  const result: Record<string, TopicWithSubtopics[]> = {}
  for (const [subjectId, subjectTopics] of groupTopicsBySubject(topics)) {
    const tree = buildTopicTree({ topics: subjectTopics, subtopics, counts, subjectId })
    if (tree.length > 0) result[subjectId] = tree
  }
  return result
})
