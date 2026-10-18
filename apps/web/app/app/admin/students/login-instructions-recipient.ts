import { adminClient } from '@repo/db/admin'

export type LoginInstructionsRecipient = {
  email: string
  fullName: string | null
}

type RecipientRow = {
  email: string
  full_name: string | null
}

/**
 * Fetches the send target's email/name, scoped to
 * the admin's organization, a non-soft-deleted row, and student/instructor
 * roles only (never another admin). Uses `adminClient` (service role) — `users`
 * carries no cross-row SELECT policy (mirrors `email-queries.ts`). Returns null
 * on no match (PGRST116) or a query error (logged, never thrown).
 */
export async function getLoginInstructionsRecipient(
  id: string,
  organizationId: string,
): Promise<LoginInstructionsRecipient | null> {
  const { data, error } = await adminClient
    .from('users')
    .select('email, full_name')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .in('role', ['student', 'instructor'])
    .single<RecipientRow>()

  if (error) {
    if (error.code === 'PGRST116') return null
    console.error('[getLoginInstructionsRecipient] DB error:', error.message)
    return null
  }
  if (!data) return null

  return { email: data.email, fullName: data.full_name }
}
