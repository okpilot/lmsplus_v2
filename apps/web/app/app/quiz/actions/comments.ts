'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'

const GetCommentsSchema = z.object({ questionId: z.uuid() })
const CreateCommentSchema = z.object({
  questionId: z.uuid(),
  body: z.string().min(1).max(2000),
})
const DeleteCommentSchema = z.object({ commentId: z.uuid() })

const COMMENT_SELECT = 'id, question_id, user_id, body, created_at, users(full_name, role)' as const

export async function getComments(raw: unknown) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: true as const, comments: [] }

  let parsed: z.infer<typeof GetCommentsSchema>
  try {
    parsed = GetCommentsSchema.parse(raw)
  } catch {
    return { success: false as const, error: 'Invalid input' }
  }

  const { data, error } = await supabase
    .from('question_comments')
    .select(COMMENT_SELECT)
    .eq('question_id', parsed.questionId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[getComments]', error.message)
    return { success: false as const, error: 'Failed to load comments' }
  }
  return { success: true as const, comments: data }
}

export async function createComment(raw: unknown) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false as const, error: 'Not authenticated' }

  let parsed: z.infer<typeof CreateCommentSchema>
  try {
    parsed = CreateCommentSchema.parse(raw)
  } catch {
    return { success: false as const, error: 'Invalid input' }
  }

  const { data, error } = await supabase
    .from('question_comments')
    .insert({ question_id: parsed.questionId, user_id: user.id, body: parsed.body })
    .select(COMMENT_SELECT)
    .single()

  if (error) {
    console.error('[createComment]', error.message)
    return { success: false as const, error: 'Failed to create comment' }
  }
  return { success: true as const, comment: data }
}

export async function deleteComment(raw: unknown) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false as const, error: 'Not authenticated' }

  let parsed: z.infer<typeof DeleteCommentSchema>
  try {
    parsed = DeleteCommentSchema.parse(raw)
  } catch {
    return { success: false as const, error: 'Invalid input' }
  }

  const { error } = await supabase.from('question_comments').delete().eq('id', parsed.commentId)

  if (error) {
    console.error('[deleteComment]', error.message)
    return { success: false as const, error: 'Failed to delete comment' }
  }
  return { success: true as const }
}
