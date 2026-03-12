'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { ZodError, z } from 'zod'
import type { DraftResult, LoadDraftResult } from '../types'

const DraftAnswerSchema = z.object({
  selectedOptionId: z.string().min(1),
  responseTimeMs: z.number().int().nonnegative(),
})

const SaveDraftInput = z.object({
  sessionId: z.string().uuid(),
  questionIds: z.array(z.string().uuid()).min(1),
  answers: z.record(z.string(), DraftAnswerSchema),
  currentIndex: z.number().int().nonnegative(),
})

type QuizDraftRow = {
  id: string
  student_id: string
  organization_id: string
  session_config: { sessionId: string }
  question_ids: string[]
  answers: Record<string, { selectedOptionId: string; responseTimeMs: number }>
  current_index: number
  created_at: string
  updated_at: string
}

export async function saveDraft(raw: unknown): Promise<DraftResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const input = SaveDraftInput.parse(raw)
    const orgId = await getOrganizationId(supabase, user.id)
    if (!orgId) return { success: false, error: 'User organization not found' }

    const { error } = await supabase.from('quiz_drafts' as never).upsert(
      {
        student_id: user.id,
        organization_id: orgId,
        session_config: { sessionId: input.sessionId },
        question_ids: input.questionIds,
        answers: input.answers,
        current_index: input.currentIndex,
      } as never,
      { onConflict: 'student_id' },
    )

    if (error) {
      console.error('[saveDraft] Upsert error:', error.message)
      return { success: false, error: 'Failed to save draft' }
    }

    return { success: true }
  } catch (err) {
    if (err instanceof ZodError) {
      return { success: false, error: err.errors[0]?.message ?? 'Invalid input' }
    }
    console.error('[saveDraft] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}

export async function loadDraft(): Promise<LoadDraftResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { draft: null }

    const { data, error } = await supabase
      .from('quiz_drafts' as never)
      .select('*')
      .eq('student_id' as never, user.id as never)
      .maybeSingle()

    if (error) {
      console.error('[loadDraft] Query error:', error.message)
      return { draft: null }
    }

    if (!data) return { draft: null }

    const row = data as unknown as QuizDraftRow
    return {
      draft: {
        id: row.id,
        sessionId: (row.session_config as { sessionId: string }).sessionId,
        questionIds: row.question_ids,
        answers: row.answers,
        currentIndex: row.current_index,
      },
    }
  } catch (err) {
    console.error('[loadDraft] Uncaught error:', err)
    return { draft: null }
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
    await supabase
      .from('quiz_drafts' as never)
      .delete()
      .eq('student_id' as never, user.id as never)

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
