'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import type { Database } from '@repo/db/types'
import { ZodError, z } from 'zod'
import type { DraftResult } from '../types'

type QuizDraftInsert = Database['public']['Tables']['quiz_drafts']['Insert']
const DraftAnswerSchema = z.object({
  selectedOptionId: z.string().min(1),
  responseTimeMs: z.number().int().nonnegative(),
})

const SaveDraftInput = z.object({
  sessionId: z.string().uuid(),
  questionIds: z.array(z.string().uuid()).min(1),
  answers: z.record(z.string(), DraftAnswerSchema),
  currentIndex: z.number().int().nonnegative(),
  subjectName: z.string().max(100).optional(),
  subjectCode: z.string().max(10).optional(),
})

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
    const orgId = await getOrganizationId(supabase, user.id)
    if (!orgId) return { success: false, error: 'User organization not found' }

    const row: QuizDraftInsert = {
      student_id: user.id,
      organization_id: orgId,
      session_config: {
        sessionId: input.sessionId,
        subjectName: input.subjectName,
        subjectCode: input.subjectCode,
      },
      question_ids: input.questionIds,
      answers: input.answers,
      current_index: input.currentIndex,
    }
    // Supabase client generics don't resolve quiz_drafts Insert — use typed variable + cast
    const { error } = await supabase
      .from('quiz_drafts' as 'users')
      .upsert(row as never, { onConflict: 'student_id' })

    if (error) {
      console.error('[saveDraft] Upsert error:', error.message)
      return { success: false, error: 'Failed to save draft' }
    }
    return { success: true }
  } catch (err) {
    if (err instanceof ZodError)
      return { success: false, error: err.errors[0]?.message ?? 'Invalid input' }
    console.error('[saveDraft] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}

export async function deleteDraft(): Promise<{ success: boolean }> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false }
    // quiz_drafts uses real DELETE (not soft delete) — approved exception for temp storage
    const { error } = await supabase
      .from('quiz_drafts' as 'users')
      .delete()
      .eq('student_id', user.id)

    if (error) {
      console.error('[deleteDraft] Delete error:', error.message)
      return { success: false }
    }
    return { success: true }
  } catch (err) {
    console.error('[deleteDraft] Uncaught error:', err)
    return { success: false }
  }
}

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

async function getOrganizationId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('users')
    .select('organization_id')
    .eq('id', userId)
    .single<{ organization_id: string }>()
  return data?.organization_id ?? null
}
