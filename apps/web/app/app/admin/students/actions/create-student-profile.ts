import { adminClient } from '@repo/db/admin'

/**
 * Inserts the profile row with `temp_password_expires_at` unset — the account
 * has no password at all until an admin sends a set-password link. On
 * failure, deletes the just-created Auth user (Auth API + users INSERT
 * cannot share one SQL transaction) and logs if that rollback fails too.
 */
export async function insertStudentProfile(opts: {
  userId: string
  email: string
  fullName: string
  role: string
  organizationId: string
}): Promise<boolean> {
  const { error: insertErr } = await adminClient.from('users').upsert(
    {
      id: opts.userId,
      email: opts.email,
      full_name: opts.fullName,
      role: opts.role,
      organization_id: opts.organizationId,
    },
    { onConflict: 'id', ignoreDuplicates: true },
  )
  if (!insertErr) return true

  console.error('[createStudent] Profile insert failed:', insertErr.message)
  const { error: rollbackErr } = await adminClient.auth.admin.deleteUser(opts.userId)
  if (rollbackErr) {
    console.error(
      '[createStudent] Rollback failed — orphaned auth user:',
      opts.userId,
      rollbackErr.message,
    )
  }
  return false
}
