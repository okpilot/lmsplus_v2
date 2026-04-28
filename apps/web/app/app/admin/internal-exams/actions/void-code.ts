'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { rpc } from '@/lib/supabase-rpc'

const VoidCodeSchema = z.object({
  codeId: z.uuid(),
  reason: z.string().min(1).max(500),
})

export type VoidCodeInput = z.infer<typeof VoidCodeSchema>

export type VoidCodeResult =
  | { success: true; codeId: string; sessionId: string | null; sessionEnded: boolean }
  | { success: false; error: string }

const ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: 'Not authenticated',
  not_admin: 'Admin permission required',
  admin_not_found: 'Admin permission required',
  cannot_void_finished_attempt: 'Cannot void a finished attempt — record is final',
  code_not_found: 'Code not found',
  code_voided: 'Code is already voided',
}

function mapRpcError(message: string): string {
  for (const [code, msg] of Object.entries(ERROR_MESSAGES)) {
    if (message.includes(code)) return msg
  }
  return 'Failed to void internal exam code'
}

type RpcRow = { code_id: string; session_id: string | null; session_ended: boolean }

function isRpcRow(value: unknown): value is RpcRow {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.code_id === 'string' &&
    (v.session_id === null || typeof v.session_id === 'string') &&
    typeof v.session_ended === 'boolean'
  )
}

export async function voidInternalExamCode(input: unknown): Promise<VoidCodeResult> {
  const parsed = VoidCodeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }

  const { supabase } = await requireAdmin()
  const { codeId, reason } = parsed.data

  const { data, error } = await rpc<unknown>(supabase, 'void_internal_exam_code', {
    p_code_id: codeId,
    p_reason: reason,
  })

  if (error) {
    console.error('[voidInternalExamCode] RPC error:', error.message)
    return { success: false, error: mapRpcError(error.message) }
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!isRpcRow(row)) {
    console.error('[voidInternalExamCode] RPC returned unexpected shape')
    return { success: false, error: 'Failed to void internal exam code' }
  }

  revalidatePath('/app/admin/internal-exams')
  return {
    success: true,
    codeId: row.code_id,
    sessionId: row.session_id,
    sessionEnded: row.session_ended,
  }
}
