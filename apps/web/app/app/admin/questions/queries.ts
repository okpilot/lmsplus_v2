import { createServerSupabaseClient } from '@repo/db/server'
import type { QuestionFilters, QuestionRow, QuestionsListResult } from './types'

export const PAGE_SIZE = 25

export async function getQuestionsList(filters: QuestionFilters): Promise<QuestionsListResult> {
  const supabase = await createServerSupabaseClient()

  const page = filters.page ?? 1
  const searchTerm = filters.search?.trim()
  const escapedSearch = searchTerm ? `%${searchTerm.replace(/[%_\\]/g, '\\$&')}%` : null

  // Count first — PostgREST returns 416 (and null count) for out-of-range .range() requests.
  let countQ = supabase
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
  if (filters.subjectId) countQ = countQ.eq('subject_id', filters.subjectId)
  if (filters.topicId) countQ = countQ.eq('topic_id', filters.topicId)
  if (filters.subtopicId) countQ = countQ.eq('subtopic_id', filters.subtopicId)
  if (filters.difficulty) countQ = countQ.eq('difficulty', filters.difficulty)
  if (filters.status) countQ = countQ.eq('status', filters.status)
  if (escapedSearch) countQ = countQ.ilike('question_text', escapedSearch)

  const { count, error: countError } = await countQ

  if (countError) {
    console.error('[getQuestionsList] count error:', countError.message)
    return { ok: false, error: 'Failed to load questions' }
  }

  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  if (total === 0 || page > totalPages) {
    return { ok: true as const, questions: [], totalCount: total }
  }

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let dataQ = supabase
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
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to)
  if (filters.subjectId) dataQ = dataQ.eq('subject_id', filters.subjectId)
  if (filters.topicId) dataQ = dataQ.eq('topic_id', filters.topicId)
  if (filters.subtopicId) dataQ = dataQ.eq('subtopic_id', filters.subtopicId)
  if (filters.difficulty) dataQ = dataQ.eq('difficulty', filters.difficulty)
  if (filters.status) dataQ = dataQ.eq('status', filters.status)
  if (escapedSearch) dataQ = dataQ.ilike('question_text', escapedSearch)

  const { data, error } = await dataQ

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
    totalCount: total,
  }
}
