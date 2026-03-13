'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import type { Database } from '@repo/db/types'
import { ZodError, z } from 'zod'
import type { DraftResult } from '../types'

type QuizDraftInsert = Database['public']['Tables']['quiz_drafts']['Insert']
type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

const MAX_DRAFTS = 20
const SaveDraftInput = z.object({
  draftId: z.string().uuid().optional(),
  sessionId: z.string().uuid(),
  questionIds: z.array(z.string().uuid()).min(1),
  answers: z.record(
    z.string(),
    z.object({
      selectedOptionId: z.string().min(1),
      responseTimeMs: z.number().int().nonnegative(),
    }),
  ),
  currentIndex: z.number().int().nonnegative(),
  subjectName: z.string().max(100).optional(),
  subjectCode: z.string().max(10).optional(),
})
type SaveDraftParsed = z.infer<typeof SaveDraftInput>

function sessionConfig(i: SaveDraftParsed) {
  return { sessionId: i.sessionId, subjectName: i.subjectName, subjectCode: i.subjectCode }
}

export async function saveDraft(raw: unknown): Promise<DraftResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const input = SaveDraftInput.parse(raw)
    if (input.currentIndex >= input.questionIds.length) {
      return { success: false, error: 'Current index out of range' }
    }
    if (input.draftId) return updateExistingDraft(supabase, input, user.id)

    const { data: u } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single<{ organization_id: string }>()
    if (!u?.organization_id) return { success: false, error: 'User organization not found' }
    return insertNewDraft(supabase, input, user.id, u.organization_id)
  } catch (err) {
    if (err instanceof ZodError)
      return { success: false, error: err.errors[0]?.message ?? 'Invalid input' }
    console.error('[saveDraft] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}

async function updateExistingDraft(
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
async function insertNewDraft(
  supabase: SupabaseClient,
  input: SaveDraftParsed,
  userId: string,
  orgId: string,
): Promise<DraftResult> {
  const { count, error: countError } = await supabase
    .from('quiz_drafts' as 'users')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', userId)
  if (countError) return { success: false, error: 'Failed to save draft' }
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
  if (error) return { success: false, error: 'Failed to save draft' }
  return { success: true }
}
