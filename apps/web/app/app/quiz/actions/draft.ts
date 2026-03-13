'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import type { Database } from '@repo/db/types'
import { ZodError, z } from 'zod'
import type { DraftResult } from '../types'

type QuizDraftInsert = Database['public']['Tables']['quiz_drafts']['Insert']

const MAX_DRAFTS = 20

const DraftAnswerSchema = z.object({
  selectedOptionId: z.string().min(1),
  responseTimeMs: z.number().int().nonnegative(),
})

const SaveDraftInput = z.object({
  draftId: z.string().uuid().optional(),
  sessionId: z.string().uuid(),
  questionIds: z.array(z.string().uuid()).min(1),
  answers: z.record(z.string(), DraftAnswerSchema),
  currentIndex: z.number().int().nonnegative(),
  subjectName: z.string().max(100).optional(),
  subjectCode: z.string().max(10).optional(),
})

const DeleteDraftInput = z.object({
  draftId: z.string().uuid(),
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

    if (input.draftId) {
      // Update existing draft
      const { error } = await supabase
        .from('quiz_drafts' as 'users')
        .update({
          question_ids: input.questionIds,
          answers: input.answers,
          current_index: input.currentIndex,
          session_config: {
            sessionId: input.sessionId,
            subjectName: input.subjectName,
            subjectCode: input.subjectCode,
          },
        } as never)
        .eq('id', input.draftId)
        .eq('student_id', user.id)
      if (error) {
        console.error('[saveDraft] Update error:', error.message)
        return { success: false, error: 'Failed to update draft' }
      }
      return { success: true }
    }

    // Enforce 20-draft limit at app level
    const { count, error: countError } = await supabase
      .from('quiz_drafts' as 'users')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', user.id)
    if (countError) {
      console.error('[saveDraft] Count error:', countError.message)
      return { success: false, error: 'Failed to save draft' }
    }
    if ((count ?? 0) >= MAX_DRAFTS) {
      return { success: false, error: 'Maximum 20 saved quizzes reached.' }
    }

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
    const { error } = await supabase.from('quiz_drafts' as 'users').insert(row as never)

    if (error) {
      console.error('[saveDraft] Insert error:', error.message)
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

export async function deleteDraft(raw: unknown): Promise<{ success: boolean }> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false }

    const { draftId } = DeleteDraftInput.parse(raw)

    // quiz_drafts uses real DELETE (not soft delete) — approved exception for temp storage
    // Delete by id AND student_id to prevent one student deleting another's draft
    const { error } = await supabase
      .from('quiz_drafts' as 'users')
      .delete()
      .eq('id', draftId)
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
