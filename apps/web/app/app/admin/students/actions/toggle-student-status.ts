'use server'

import { adminClient } from '@repo/db/admin'
import { ToggleStudentStatusSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/require-admin'

type ActionResult = { success: true } | { success: false; error: string }

export async function toggleStudentStatus(input: unknown): Promise<ActionResult> {
  const parsed = ToggleStudentStatusSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' }
  }

  const { userId, organizationId } = await requireAdmin()
  const { id } = parsed.data

  if (id === userId) {
    return { success: false, error: 'Cannot deactivate your own account' }
  }

  const { data: target, error: fetchErr } = await adminClient
    .from('users')
    .select('id, deleted_at')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .single<{ id: string; deleted_at: string | null }>()

  if (fetchErr) {
    if (fetchErr.code === 'PGRST116') {
      return { success: false, error: 'Student not found' }
    }
    console.error('[toggleStudentStatus] Fetch error:', fetchErr.message)
    return { success: false, error: 'Failed to update student status' }
  }

  if (target.deleted_at === null) {
    return await deactivate(id, userId)
  }
  return await reactivate(id)
}

async function deactivate(id: string, adminId: string): Promise<ActionResult> {
  const { error: banErr } = await adminClient.auth.admin.updateUserById(id, {
    ban_duration: '876600h',
  })
  if (banErr) {
    console.error('[toggleStudentStatus] Ban error:', banErr.message)
    return { success: false, error: 'Failed to deactivate student' }
  }

  const { error: updateErr } = await adminClient
    .from('users')
    .update({ deleted_at: new Date().toISOString(), deleted_by: adminId })
    .eq('id', id)

  if (updateErr) {
    console.error('[toggleStudentStatus] Deactivate error:', updateErr.message)
    await adminClient.auth.admin.updateUserById(id, { ban_duration: 'none' })
    return { success: false, error: 'Failed to deactivate student' }
  }

  revalidatePath('/app/admin/students')
  return { success: true }
}

async function reactivate(id: string): Promise<ActionResult> {
  const { error: unbanErr } = await adminClient.auth.admin.updateUserById(id, {
    ban_duration: 'none',
  })
  if (unbanErr) {
    console.error('[toggleStudentStatus] Unban error:', unbanErr.message)
    return { success: false, error: 'Failed to reactivate student' }
  }

  const { error: updateErr } = await adminClient
    .from('users')
    .update({ deleted_at: null, deleted_by: null })
    .eq('id', id)

  if (updateErr) {
    console.error('[toggleStudentStatus] Reactivate error:', updateErr.message)
    await adminClient.auth.admin.updateUserById(id, { ban_duration: '876600h' })
    return { success: false, error: 'Failed to reactivate student' }
  }

  revalidatePath('/app/admin/students')
  return { success: true }
}
