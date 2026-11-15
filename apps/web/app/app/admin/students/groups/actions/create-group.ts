'use server'

import { CreateStudentGroupSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/action-result'
import { requireAdmin } from '@/lib/auth/require-admin'
import { matchRpcError } from '@/lib/rpc-error-match'
import { GROUP_RPC_ERRORS } from '../../actions/group-action-result'

export async function createGroup(input: unknown): Promise<ActionResult> {
  const parsed = CreateStudentGroupSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }

  const { supabase } = await requireAdmin()
  const { name, description } = parsed.data

  const { error } = await supabase.rpc('create_student_group', {
    p_name: name,
    ...(description === undefined ? {} : { p_description: description }),
  })
  if (error) {
    console.error('[createGroup] RPC error:', error.message)
    return {
      success: false,
      error: matchRpcError(error.message, GROUP_RPC_ERRORS) ?? 'Failed to create group',
    }
  }

  revalidatePath('/app/admin/students')
  revalidatePath('/app/admin/students/groups')
  return { success: true }
}
