import type { createServerSupabaseClient } from '@repo/db/server'
import type { Database } from '@repo/db/types'
import type { DraftResult } from '../types'

type QuizDraftInsert = Database['public']['Tables']['quiz_drafts']['Insert']
type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

type SaveDraftParsed = {
  draftId?: string
  sessionId: string
  questionIds: string[]
  answers: Record<string, { selectedOptionId: string; responseTimeMs: number }>
  currentIndex: number
  subjectName?: string
  subjectCode?: string
}

export const MAX_DRAFTS = 20

function sessionConfig(i: SaveDraftParsed) {
  return { sessionId: i.sessionId, subjectName: i.subjectName, subjectCode: i.subjectCode }
}

export async function updateExistingDraft(
  supabase: SupabaseClient,
  input: SaveDraftParsed,
  userId: string,
): Promise<DraftResult> {
  const { data, error } = await supabase
    .from('quiz_drafts' as 'users')
    .update({
      question_ids: input.questionIds,
      answers: input.answers,
      current_index: input.currentIndex,
      session_config: sessionConfig(input),
    } as never)
    .eq('id', input.draftId as string)
    .eq('student_id', userId)
    .select('id')
  if (error) {
    console.error('[saveDraft] Update error:', error.message)
    return { success: false, error: 'Failed to update draft' }
  }
  if (!data || (data as unknown[]).length === 0) {
    return { success: false, error: 'Draft not found or already deleted' }
  }
  return { success: true }
}

/** 4 params: supabase client, parsed input, user id, org id — each a distinct domain role */
export async function insertNewDraft(
  supabase: SupabaseClient,
  input: SaveDraftParsed,
  userId: string,
  orgId: string,
): Promise<DraftResult> {
  const { count, error: countError } = await supabase
    .from('quiz_drafts' as 'users')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', userId)
  if (countError) {
    console.error('[saveDraft] Draft count query error:', countError.message)
    return { success: false, error: 'Failed to save draft' }
  }
  if ((count ?? 0) >= MAX_DRAFTS)
    return { success: false, error: 'Maximum 20 saved quizzes reached.' }
  const row: QuizDraftInsert = {
    student_id: userId,
    organization_id: orgId,
    session_config: sessionConfig(input),
    question_ids: input.questionIds,
    answers: input.answers,
    current_index: input.currentIndex,
  }
  const { error } = await supabase.from('quiz_drafts' as 'users').insert(row as never)
  if (error) {
    console.error('[saveDraft] Insert error:', error.message)
    return { success: false, error: 'Failed to save draft' }
  }
  return { success: true }
}
