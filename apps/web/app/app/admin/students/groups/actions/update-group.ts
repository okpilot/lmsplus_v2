'use server'

import { UpdateStudentGroupSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/action-result'
import { requireAdmin } from '@/lib/auth/require-admin'
import { matchRpcError } from '@/lib/rpc-error-match'
import { GROUP_RPC_ERRORS } from '../../actions/group-action-result'

/** `description: ''` clears the description; omitted keeps it. */
export async function updateGroup(input: unknown): Promise<ActionResult> {
  const parsed = UpdateStudentGroupSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }

  const { supabase } = await requireAdmin()
  const { groupId, name, description } = parsed.data

  const { error } = await supabase.rpc('update_student_group', {
    p_group_id: groupId,
    p_name: name,
    ...(description === undefined ? {} : { p_description: description }),
  })
  if (error) {
    console.error('[updateGroup] RPC error:', error.message)
    return {
      success: false,
      error: matchRpcError(error.message, GROUP_RPC_ERRORS) ?? 'Failed to update group',
    }
  }

  revalidatePath('/app/admin/students')
  revalidatePath('/app/admin/students/groups')
  return { success: true }
}
