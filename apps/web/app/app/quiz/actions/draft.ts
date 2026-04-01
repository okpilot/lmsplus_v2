'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { ZodError, z } from 'zod'
import type { DraftResult } from '../types'
import { insertNewDraft, updateExistingDraft } from './draft-helpers'

const SaveDraftInput = z
  .object({
    draftId: z.uuid().optional(),
    sessionId: z.uuid(),
    questionIds: z.array(z.uuid()).min(1),
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
    feedback: z
      .record(
        z.string(),
        z.object({
          isCorrect: z.boolean(),
          correctOptionId: z.string(),
          explanationText: z.string().nullable(),
          explanationImageUrl: z.string().nullable(),
        }),
      )
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.currentIndex >= data.questionIds.length) {
      ctx.addIssue({
        // 'custom' is the Zod v4 literal for ZodIssueCode.custom
        code: 'custom',
        path: ['currentIndex'],
        message: 'Current index out of range',
      })
    }
    const questionIdSet = new Set(data.questionIds)
    for (const key of Object.keys(data.answers)) {
      if (!questionIdSet.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['answers', key],
          message: `Answer key "${key}" is not in questionIds`,
        })
      }
    }
  })

export async function saveDraft(raw: unknown): Promise<DraftResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Not authenticated' }

    const input = SaveDraftInput.parse(raw)
    if (input.draftId) return await updateExistingDraft(supabase, input, user.id)

    const { data: u, error: userError } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single<{ organization_id: string }>()
    if (userError) {
      console.error('[saveDraft] Users query error:', userError.message)
      return { success: false, error: 'Failed to look up user' }
    }
    if (!u?.organization_id) return { success: false, error: 'User organization not found' }
    return await insertNewDraft(supabase, input, user.id, u.organization_id)
  } catch (err) {
    if (err instanceof ZodError)
      return { success: false, error: err.issues[0]?.message ?? 'Invalid input' }
    console.error('[saveDraft] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
