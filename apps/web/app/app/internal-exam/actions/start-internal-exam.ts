'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { rpc } from '@/lib/supabase-rpc'

const StartInternalExamInput = z.object({
  code: z.string().min(1).max(64),
})

const RpcRowSchema = z.object({
  session_id: z.uuid(),
  question_ids: z.array(z.uuid()),
  time_limit_seconds: z.number().int().positive(),
  total_questions: z.number().int().positive(),
  pass_mark: z.number().int().min(1).max(100),
  started_at: z.string(),
})

type RpcRow = z.infer<typeof RpcRowSchema>

export type StartInternalExamResult =
  | { success: true; sessionId: string }
  | { success: false; error: string }

const ERROR_MESSAGES: Array<[string, string]> = [
  ['not_authenticated', 'Not authenticated'],
  // UNIFIED — never reveal whether the code exists for a different student.
  ['code_not_found', 'Invalid or expired code. Please contact your administrator.'],
  ['code_not_yours', 'Invalid or expired code. Please contact your administrator.'],
  ['code_expired', 'This code has expired. Please contact your administrator.'],
  ['code_already_used', 'This code has already been used.'],
  ['code_voided', 'This code has been cancelled. Please contact your administrator.'],
  [
    'active_session_exists',
    'You already have an active internal exam session for this subject. Submit it before starting a new one.',
  ],
  ['insufficient_questions_for_exam', 'Cannot start exam: not enough questions configured.'],
]

function mapRpcError(message: string): string {
  for (const [token, friendly] of ERROR_MESSAGES) {
    if (message.includes(token)) return friendly
  }
  return 'Failed to start internal exam.'
}

export async function startInternalExam(raw: unknown): Promise<StartInternalExamResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Not authenticated' }

    const parsed = StartInternalExamInput.safeParse(raw)
    if (!parsed.success) {
      console.error('[startInternalExam] Invalid input')
      return { success: false, error: 'Invalid input' }
    }

    const { data, error } = await rpc<unknown>(supabase, 'start_internal_exam_session', {
      p_code: parsed.data.code,
    })

    if (error) {
      console.error('[startInternalExam] RPC error:', error.message)
      return { success: false, error: mapRpcError(error.message) }
    }

    const row: unknown = Array.isArray(data) ? data[0] : data
    const rowParsed = RpcRowSchema.safeParse(row)
    if (!rowParsed.success) {
      const failedFields = rowParsed.error.issues.map((i) => i.path.join('.'))
      console.error('[startInternalExam] Invalid RPC payload, fields:', failedFields)
      return { success: false, error: 'Failed to start internal exam.' }
    }

    const result: RpcRow = rowParsed.data
    return { success: true, sessionId: result.session_id }
  } catch (err) {
    console.error('[startInternalExam] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
