import { createServerSupabaseClient } from '@repo/db/server'
import type { QuestionFilters, QuestionRow, QuestionsListResult } from './types'

export const PAGE_SIZE = 25

export async function getQuestionsList(filters: QuestionFilters): Promise<QuestionsListResult> {
  const supabase = await createServerSupabaseClient()

  const page = filters.page ?? 1
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('questions')
    .select(
      `
      id, question_number, question_text, difficulty, status,
      subject_id, topic_id, subtopic_id,
      options, explanation_text,
      question_image_url, explanation_image_url,
      lo_reference, created_at, updated_at,
      easa_subjects(code, name),
      easa_topics(name),
      easa_subtopics(name)
    `,
      { count: 'exact' },
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to)

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

  const { data, count, error } = await query
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
  return {
    ok: true as const,
    questions: rows as QuestionRow[],
    totalCount: count ?? 0,
  }
}
