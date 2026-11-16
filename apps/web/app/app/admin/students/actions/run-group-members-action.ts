import { StudentGroupMembersSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/require-admin'
import { matchRpcError } from '@/lib/rpc-error-match'
import { GROUP_RPC_ERRORS, type GroupMembersResult } from './group-action-result'

type RpcName = 'add_student_group_members' | 'remove_student_group_members'

/** Validates, authorises, calls the membership RPC with the admin's own client, revalidates. */
export async function runGroupMembersAction(
  rpcName: RpcName,
  input: unknown,
): Promise<GroupMembersResult> {
  const parsed = StudentGroupMembersSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }

  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.rpc(rpcName, {
    p_group_id: parsed.data.groupId,
    p_user_ids: parsed.data.userIds,
  })

  if (error) {
    console.error(`[${rpcName}] RPC error:`, error.message)
    const mapped = matchRpcError(error.message, GROUP_RPC_ERRORS)
    return { success: false, error: mapped ?? 'Failed to update group members' }
  }

  revalidatePath('/app/admin/students')
  return { success: true, count: data ?? 0 }
}
