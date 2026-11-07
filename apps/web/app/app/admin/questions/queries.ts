import { requireAdmin } from '@/lib/auth/require-admin'
import { escapeLike } from '@/lib/utils/escape-like'
import { isPastEndPage } from '@/lib/utils/past-end-page'
import type { QuestionFilters, QuestionRow, QuestionsListResult } from './types'

export const PAGE_SIZE = 25

type Supabase = Awaited<ReturnType<typeof requireAdmin>>['supabase']

const QUESTION_COLUMNS = `
      id, question_number, question_text, difficulty, status,
      subject_id, topic_id, subtopic_id,
      options, explanation_text,
      question_image_url, explanation_image_url,
      lo_reference, has_calculations, created_at, updated_at,
      easa_subjects(code, name),
      easa_topics(name),
      easa_subtopics(name)
    `

function escapedSearchOf(filters: QuestionFilters): string | null {
  const searchTerm = filters.search?.trim()
  return searchTerm ? `%${escapeLike(searchTerm)}%` : null
}

// Method syntax keeps parameters bivariant so the typed PostgREST builder satisfies it.
type FilterableQuery<B> = {
  eq(col: string, val: unknown): B
  ilike(col: string, pattern: string): B
}

function applyQuestionFilters<B extends FilterableQuery<B>>(
  builder: B,
  filters: QuestionFilters,
): B {
  const escapedSearch = escapedSearchOf(filters)
  let q = builder
  if (filters.subjectId) q = q.eq('subject_id', filters.subjectId)
  if (filters.topicId) q = q.eq('topic_id', filters.topicId)
  if (filters.subtopicId) q = q.eq('subtopic_id', filters.subtopicId)
  if (filters.status) q = q.eq('status', filters.status)
  if (filters.hasCalculations !== undefined) q = q.eq('has_calculations', filters.hasCalculations)
  if (escapedSearch) q = q.ilike('question_text', escapedSearch)
  return q
}

function fetchQuestionsPage(supabase: Supabase, filters: QuestionFilters, from: number) {
  return (
    applyQuestionFilters(
      supabase
        .from('questions')
        .select(QUESTION_COLUMNS, { count: 'exact' })
        .is('deleted_at', null),
      filters,
    )
      // id tiebreaker keeps pages stable — created_at is not unique.
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
  )
}

function countQuestions(supabase: Supabase, filters: QuestionFilters) {
  return applyQuestionFilters(
    supabase.from('questions').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    filters,
  )
}

/**
 * The requested page is read with its exact total in one query. A page at or past the end
 * (PGRST103, or an empty page with a positive count) is snapped to the last page (#1041):
 * count, clamp, read again.
 */
async function loadQuestionsPage(supabase: Supabase, filters: QuestionFilters) {
  const requested = Math.max(1, filters.page ?? 1)
  const first = await fetchQuestionsPage(supabase, filters, (requested - 1) * PAGE_SIZE)
  if (!isPastEndPage(first)) return first

  const { count, error: countError } = await countQuestions(supabase, filters)
  if (countError) return { data: null, count: null, error: countError }
  const total = count ?? 0
  if (total === 0) return { data: [], count: 0, error: null }
  const lastPage = Math.min(requested, Math.ceil(total / PAGE_SIZE))
  const reread = await fetchQuestionsPage(supabase, filters, (lastPage - 1) * PAGE_SIZE)
  // A concurrent delete can leave the re-read past the end too: empty page, recount total.
  if (isPastEndPage(reread)) return { data: [], count: total, error: null }
  return reread
}

export async function getQuestionsList(filters: QuestionFilters): Promise<QuestionsListResult> {
  // Data-side placement of requireAdmin() (docs/security.md "Admin Route Protection");
  // covers a page that omits its call.
  const { supabase } = await requireAdmin()

  const { data, count, error } = await loadQuestionsPage(supabase, filters)

  if (error) {
    console.error('[getQuestionsList] query error:', error.message)
    return { ok: false, error: 'Failed to load questions' }
  }

  const total = count ?? 0
  if (total === 0) {
    return { ok: true as const, questions: [], totalCount: total }
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
