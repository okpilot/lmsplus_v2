'use server'

import { DeleteStudentGroupSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/action-result'
import { requireAdmin } from '@/lib/auth/require-admin'
import { matchRpcError } from '@/lib/rpc-error-match'
import { GROUP_RPC_ERRORS } from '../../actions/group-action-result'

export async function deleteGroup(input: unknown): Promise<ActionResult> {
  const parsed = DeleteStudentGroupSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }

  const { supabase } = await requireAdmin()

  const { error } = await supabase.rpc('delete_student_group', { p_group_id: parsed.data.groupId })
  if (error) {
    console.error('[deleteGroup] RPC error:', error.message)
    return {
      success: false,
      error: matchRpcError(error.message, GROUP_RPC_ERRORS) ?? 'Failed to delete group',
    }
  }

  revalidatePath('/app/admin/students')
  return { success: true }
}
