import { adminClient } from '@repo/db/admin'
import { armTempPassword, restoreTempPasswordExpiry } from '@/lib/auth/temp-password-admin'

type IssueTempPasswordOpts = {
  userId: string
  organizationId: string
  password: string
  priorExpiresAt: string | null
}

type IssueTempPasswordOutcome = 'issued' | 'failed' | 'issued_not_armed'

/**
 * Arms the temp-password flag, writes the new Auth password, then arms it
 * again. Returns `'failed'` if either the first arm or the Auth write fails —
 * a failed Auth write restores the expiry read before the first arm, via a
 * compare-and-set on that arm's own value. Returns `'issued_not_armed'` if
 * the Auth write succeeds but the second arm fails, otherwise `'issued'`.
 */
export async function issueTempPassword(
  opts: IssueTempPasswordOpts,
): Promise<IssueTempPasswordOutcome> {
  const { userId, organizationId, password, priorExpiresAt } = opts

  const armed = await armTempPassword(userId, organizationId)
  if (!armed.success) {
    console.error(
      '[resetStudentPassword] Failed to arm temp password before reset for user:',
      userId,
    )
    return 'failed'
  }

  const passwordWritten = await writeAuthPassword(userId, password)
  if (!passwordWritten) {
    await rollbackFirstArm({
      userId,
      organizationId,
      armedExpiresAt: armed.expiresAt,
      priorExpiresAt,
    })
    return 'failed'
  }

  const rearmed = await armTempPassword(userId, organizationId)
  if (!rearmed.success) {
    console.error('[resetStudentPassword] Password set but re-arm failed for user:', userId)
    return 'issued_not_armed'
  }
  return 'issued'
}

/** Writes the new Auth password; logs and returns false on failure. */
async function writeAuthPassword(userId: string, password: string): Promise<boolean> {
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    password,
    user_metadata: { must_change_password: true },
  })
  if (error) {
    console.error('[resetStudentPassword] Password reset error:', error.message)
    return false
  }
  return true
}

/** Restores the first arm's expiry via compare-and-set; logs on failure. */
async function rollbackFirstArm(opts: {
  userId: string
  organizationId: string
  armedExpiresAt: string
  priorExpiresAt: string | null
}): Promise<void> {
  const { success: restored } = await restoreTempPasswordExpiry(opts)
  if (!restored) {
    console.error(
      '[resetStudentPassword] Rollback of temp-password expiry failed for user:',
      opts.userId,
    )
  }
}
