'use server'

import { adminClient } from '@repo/db/admin'
import { SoftDeleteQuestionSchema } from '@repo/db/schema'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/action-result'
import { requireAdmin } from '@/lib/auth/require-admin'

/**
 * Soft-delete a question.
 *
 * Runs the UPDATE through the **service-role** client, not the caller's RLS
 * client, because the RLS path cannot express this write at all: `questions`
 * has a single SELECT-capable policy (`tenant_isolation`, FOR ALL) whose
 * qualifier requires `deleted_at IS NULL`, so the row stops being visible to
 * the caller the instant the soft-delete lands and Postgres rejects the
 * statement with `new row violates row-level security policy`. Verified
 * against the live schema: the admin write grant is NOT the problem —
 * `admin_update_questions` (mig `20260324000054`) permits the write, and the
 * same UPDATE succeeds with both policies still in place once any permissive
 * SELECT policy covers the post-update row.
 *
 * Because the service-role client bypasses RLS, tenant isolation that RLS used
 * to provide is re-applied here in app code via the `organization_id` filter —
 * the same pattern as `toggle-student-status-mutations.ts`, the other admin
 * soft-delete. Dropping that filter would let an admin of one org soft-delete
 * another org's question by id.
 */
export async function softDeleteQuestion(input: unknown): Promise<ActionResult> {
  const parsed = SoftDeleteQuestionSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' }
  }

  const { userId, organizationId } = await requireAdmin()

  const { data, error } = await adminClient
    .from('questions')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: userId,
    })
    .eq('id', parsed.data.id)
    // Both filters replace guarantees the RLS client used to provide, so this
    // stays behaviour-preserving rather than widening: `organization_id`
    // restores tenant isolation, and `deleted_at IS NULL` restores
    // `tenant_isolation`'s row-visibility qualifier — without it a re-delete
    // would silently re-stamp deleted_at/deleted_by and overwrite the record of
    // who first deleted the question.
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .select('id')

  if (error) {
    console.error('[softDeleteQuestion] DB error:', error.message)
    return { success: false, error: 'Failed to delete question' }
  }
  if (!data?.length) {
    return { success: false, error: 'Question not found or not accessible' }
  }

  revalidatePath('/app/admin/questions')
  return { success: true }
}
