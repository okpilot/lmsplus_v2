import { createServerSupabaseClient } from '@repo/db/server'
import type { QuestionFilters, QuestionRow, QuestionsListResult } from './types'

export const QUESTION_LIMIT = 100

export async function getQuestionsList(filters: QuestionFilters): Promise<QuestionsListResult> {
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
    .limit(QUESTION_LIMIT + 1)

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

  const { data, error } = await query
  if (error) {
    console.error('[getQuestionsList] query error:', error.message)
    return { ok: false, error: 'Failed to load questions' }
  }

  const rows = (data ?? []).map((row) => {
    const { easa_subjects, easa_topics, easa_subtopics, ...rest } = row
    return {
      ...rest,
      subject: easa_subjects ?? null,
      topic: easa_topics ?? null,
      subtopic: easa_subtopics ?? null,
    }
  })
  const hasMore = rows.length > QUESTION_LIMIT
  return {
    ok: true as const,
    questions: rows.slice(0, QUESTION_LIMIT) as QuestionRow[],
    hasMore,
  }
}
