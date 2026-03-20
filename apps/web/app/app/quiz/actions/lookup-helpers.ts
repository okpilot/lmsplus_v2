import type { SupabaseClient } from '@supabase/supabase-js'

export type QuestionWithGroup = { id: string; topic_id: string; subtopic_id: string | null }

/** Builds and executes the base question query with optional topic/subtopic scope. */
export async function buildQuestionQuery(
  supabase: SupabaseClient,
  subjectId: string,
  topicIds?: string[],
  subtopicIds?: string[],
) {
  let query = supabase
    .from('questions')
    .select('id, topic_id, subtopic_id')
    .eq('status', 'active')
    .eq('subject_id', subjectId)
    .is('deleted_at', null)

  // OR logic: include questions matching selected topics (leaf topics without
  // subtopics) OR selected subtopics.
  if (topicIds?.length && subtopicIds?.length) {
    query = query.or(
      `topic_id.in.(${topicIds.join(',')}),subtopic_id.in.(${subtopicIds.join(',')})`,
    )
  } else if (topicIds?.length) {
    query = query.in('topic_id', topicIds)
  } else if (subtopicIds?.length) {
    query = query.in('subtopic_id', subtopicIds)
  }

  const { data: rawData, error } = await query
  return { data: (rawData ?? []) as QuestionWithGroup[], error }
}

export function groupCounts(rows: QuestionWithGroup[]) {
  const byTopic: Record<string, number> = {}
  const bySubtopic: Record<string, number> = {}
  for (const r of rows) {
    byTopic[r.topic_id] = (byTopic[r.topic_id] ?? 0) + 1
    if (r.subtopic_id) {
      bySubtopic[r.subtopic_id] = (bySubtopic[r.subtopic_id] ?? 0) + 1
    }
  }
  return { byTopic, bySubtopic }
}
