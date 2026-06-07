import { adminClient } from '@repo/db/admin'
import { revalidatePath } from 'next/cache'

export type ActionResult = { success: true } | { success: false; error: string }

export async function deactivateStudent(
  id: string,
  adminId: string,
  orgId: string,
): Promise<ActionResult> {
  const { error: banErr } = await adminClient.auth.admin.updateUserById(id, {
    ban_duration: '876600h',
  })
  if (banErr) {
    console.error('[toggleStudentStatus] Ban error:', banErr.message)
    return { success: false, error: 'Failed to deactivate student' }
  }

  const { data, error: updateErr } = await adminClient
    .from('users')
    .update({ deleted_at: new Date().toISOString(), deleted_by: adminId })
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('id')

  if (updateErr || !data?.length) {
    if (updateErr) console.error('[toggleStudentStatus] Deactivate error:', updateErr.message)
    const { error: rollbackErr } = await adminClient.auth.admin.updateUserById(id, {
      ban_duration: 'none',
    })
    if (rollbackErr) {
      console.error(
        '[toggleStudentStatus] Rollback failed — user may be in inconsistent state:',
        id,
        rollbackErr.message,
      )
    }
    return { success: false, error: 'Failed to deactivate student' }
  }

  revalidatePath('/app/admin/students')
  return { success: true }
}

export async function reactivateStudent(id: string, orgId: string): Promise<ActionResult> {
  const { error: unbanErr } = await adminClient.auth.admin.updateUserById(id, {
    ban_duration: 'none',
  })
  if (unbanErr) {
    console.error('[toggleStudentStatus] Unban error:', unbanErr.message)
    return { success: false, error: 'Failed to reactivate student' }
  }

  const { data, error: updateErr } = await adminClient
    .from('users')
    .update({ deleted_at: null, deleted_by: null })
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('id')

  if (updateErr || !data?.length) {
    if (updateErr) console.error('[toggleStudentStatus] Reactivate error:', updateErr.message)
    const { error: rollbackErr } = await adminClient.auth.admin.updateUserById(id, {
      ban_duration: '876600h',
    })
    if (rollbackErr) {
      console.error(
        '[toggleStudentStatus] Rollback failed — user may be in inconsistent state:',
        id,
        rollbackErr.message,
      )
    }
    return { success: false, error: 'Failed to reactivate student' }
  }

  revalidatePath('/app/admin/students')
  return { success: true }
}
