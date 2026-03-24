import { createServerSupabaseClient } from '@repo/db/server'
import type { QuestionFilters, QuestionRow } from './types'

export async function getQuestionsList(filters: QuestionFilters): Promise<QuestionRow[]> {
  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('questions')
    .select(`
      id, question_number, question_text, difficulty, status,
      subject_id, topic_id, subtopic_id,
      options, explanation_text,
      question_image_url, explanation_image_url,
      lo_reference, created_at, updated_at,
      easa_subjects(code, name),
      easa_topics(name),
      easa_subtopics(name)
    `)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100)

  if (filters.subjectId) {
    query = query.eq('subject_id', filters.subjectId)
  }
  if (filters.topicId) {
    query = query.eq('topic_id', filters.topicId)
  }
  if (filters.subtopicId) {
    query = query.eq('subtopic_id', filters.subtopicId)
  }
  if (filters.difficulty) {
    query = query.eq('difficulty', filters.difficulty)
  }
  if (filters.status) {
    query = query.eq('status', filters.status)
  }
  if (filters.search) {
    query = query.ilike('question_text', `%${filters.search}%`)
  }

  const { data } = await query

  return (data ?? []).map((row) => ({
    ...row,
    subject: row.easa_subjects ?? null,
    topic: row.easa_topics ?? null,
    subtopic: row.easa_subtopics ?? null,
  })) as unknown as QuestionRow[]
}
