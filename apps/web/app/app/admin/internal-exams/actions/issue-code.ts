'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/require-admin'
import { rpc } from '@/lib/supabase-rpc'

const IssueCodeSchema = z.object({
  studentId: z.uuid(),
  subjectId: z.uuid(),
})

export type IssueCodeInput = z.infer<typeof IssueCodeSchema>

export type IssueCodeResult =
  | { success: true; codeId: string; code: string; expiresAt: string }
  | { success: false; error: string }

const ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: 'Not authenticated',
  not_admin: 'Admin permission required',
  admin_not_found: 'Admin permission required',
  student_not_found: 'Student not found in your organization',
  subject_not_found: 'Subject not found',
  exam_config_required: 'Configure exam for this subject first',
  code_generation_failed: 'Failed to generate code, please try again',
}

function mapRpcError(message: string): string {
  for (const [code, msg] of Object.entries(ERROR_MESSAGES)) {
    if (message.includes(code)) return msg
  }
  return 'Failed to issue internal exam code'
}

type RpcRow = { code_id: string; code: string; expires_at: string }

function isRpcRow(value: unknown): value is RpcRow {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.code_id === 'string' && typeof v.code === 'string' && typeof v.expires_at === 'string'
  )
}

export async function issueInternalExamCode(input: unknown): Promise<IssueCodeResult> {
  const parsed = IssueCodeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }

  const { supabase } = await requireAdmin()
  const { studentId, subjectId } = parsed.data

  const { data, error } = await rpc<unknown>(supabase, 'issue_internal_exam_code', {
    p_subject_id: subjectId,
    p_student_id: studentId,
  })

  if (error) {
    console.error('[issueInternalExamCode] RPC error:', error.message)
    return { success: false, error: mapRpcError(error.message) }
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!isRpcRow(row)) {
    console.error('[issueInternalExamCode] RPC returned unexpected shape')
    return { success: false, error: 'Failed to issue internal exam code' }
  }

  revalidatePath('/app/admin/internal-exams')
  return { success: true, codeId: row.code_id, code: row.code, expiresAt: row.expires_at }
}
