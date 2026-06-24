'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import type { DraftResult } from '../types'
import { insertNewDraft, updateExistingDraft } from './draft-helpers'

const SaveDraftInput = z
  .object({
    draftId: z.uuid().optional(),
    sessionId: z.uuid(),
    questionIds: z.array(z.uuid()).min(1),
    answers: z.record(
      z.string(),
      z
        .object({
          selectedOptionId: z.string().min(1).optional(),
          responseText: z.string().min(1).optional(),
          blankAnswers: z
            .array(z.object({ index: z.number().int().min(0).max(9999), text: z.string().min(1) }))
            .min(1)
            .optional(),
          responseTimeMs: z.number().int().nonnegative(),
        })
        // Exactly one answer payload must be present (MC / short / dialog).
        .refine(
          (a) =>
            [a.selectedOptionId, a.responseText, a.blankAnswers].filter((x) => x !== undefined)
              .length === 1,
          { message: 'Draft answer must carry exactly one answer payload' },
        ),
    ),
    currentIndex: z.number().int().nonnegative(),
    subjectName: z.string().max(100).optional(),
    subjectCode: z.string().max(10).optional(),
    feedback: z
      .record(
        z.string(),
        z.discriminatedUnion('questionType', [
          z.object({
            questionType: z.literal('multiple_choice'),
            isCorrect: z.boolean(),
            correctOptionId: z.string().min(1),
            explanationText: z.string().nullable(),
            explanationImageUrl: z.string().nullable(),
          }),
          z.object({
            questionType: z.literal('short_answer'),
            isCorrect: z.boolean(),
            correctAnswer: z.string().nullable(),
            explanationText: z.string().nullable(),
            explanationImageUrl: z.string().nullable(),
          }),
          z.object({
            questionType: z.literal('dialog_fill'),
            isCorrect: z.boolean(),
            blanks: z.array(
              z.object({
                index: z.number().int(),
                isCorrect: z.boolean(),
                canonical: z.string(),
              }),
            ),
            explanationText: z.string().nullable(),
            explanationImageUrl: z.string().nullable(),
          }),
        ]),
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
    for (const key of Object.keys(data.feedback ?? {})) {
      if (!questionIdSet.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['feedback', key],
          message: `Feedback key "${key}" is not in questionIds`,
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

    let input: z.infer<typeof SaveDraftInput>
    try {
      input = SaveDraftInput.parse(raw)
    } catch {
      console.error('[saveDraft] Invalid input')
      return { success: false, error: 'Invalid input' }
    }
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
    console.error('[saveDraft] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
