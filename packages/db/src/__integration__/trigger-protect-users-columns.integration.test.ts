import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupTestData,
  createTestOrg,
  createTestUser,
  getAdminClient,
  getAuthenticatedClient,
} from './setup'

/**
 * Integration tests for trg_protect_users_sensitive_columns (migration 041).
 *
 * The users table has no UPDATE policy (SELECT only), so RLS blocks all student
 * UPDATEs silently (0 rows affected, no error). The trigger is defense-in-depth:
 * if an UPDATE policy is ever added, the trigger raises an exception on
 * sensitive column changes.
 *
 * These tests verify: (1) students cannot change sensitive columns regardless
 * of mechanism, and (2) service-role bypasses both RLS and trigger.
 */
describe('trigger: protect_users_sensitive_columns', () => {
  const admin = getAdminClient()
  const suffix = Date.now()

  let orgId: string
  let studentId: string
  let studentClient: SupabaseClient
  const userIds: string[] = []

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org TriggerUsers ${suffix}`,
      slug: `test-trigger-users-${suffix}`,
    })

    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-trigger-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)

    studentClient = await getAuthenticatedClient({
      email: `student-trigger-${suffix}@test.local`,
      password: 'test-pass-123',
    })
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
  })

  // ── Authenticated (non-service-role) — trigger must block ─────────────────

  it('blocks a student from escalating their own role', async () => {
    // RLS blocks (no UPDATE policy) — error may be null (silent block) or
    // trigger exception if an UPDATE policy is added later
    await studentClient.from('users').update({ role: 'admin' }).eq('id', studentId)

    // The important assertion: role must not have changed
    const { data } = await admin.from('users').select('role').eq('id', studentId).single()
    expect(data?.role).toBe('student')
  })

  it('blocks a student from changing their organization_id', async () => {
    const otherOrgId = await createTestOrg({
      admin,
      name: `Other Org ${suffix}`,
      slug: `other-org-${suffix}`,
    })

    try {
      await studentClient.from('users').update({ organization_id: otherOrgId }).eq('id', studentId)

      // The important assertion: org must not have changed
      const { data } = await admin
        .from('users')
        .select('organization_id')
        .eq('id', studentId)
        .single()
      expect(data?.organization_id).toBe(orgId)
    } finally {
      // Clean up the extra org (no users to remove from it)
      await admin
        .from('organizations')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', otherOrgId)
    }
  })

  it('blocks a student from setting deleted_at directly', async () => {
    await studentClient
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', studentId)

    // The important assertion: user must not be soft-deleted
    const { data } = await admin.from('users').select('deleted_at').eq('id', studentId).single()
    expect(data?.deleted_at).toBeNull()
  })

  // ── Safe column — trigger must not interfere ──────────────────────────────

  it('does not treat full_name updates as sensitive-column trigger violations', async () => {
    const { error } = await studentClient
      .from('users')
      .update({ full_name: 'Updated Name' })
      .eq('id', studentId)

    // No RLS UPDATE policy exists — update is silently blocked by RLS (not trigger).
    // The key assertion: if there IS an error, it must NOT be a trigger exception.
    if (error) {
      expect(error.message).not.toMatch(/Cannot modify/i)
    }

    // Verify via admin that full_name is either updated (if UPDATE policy exists)
    // or unchanged (if RLS blocked) — either way, no trigger exception occurred
    const { data } = await admin.from('users').select('full_name').eq('id', studentId).single()
    expect(data).not.toBeNull()
  })

  // ── Service-role — trigger must bypass ───────────────────────────────────

  it('allows the service-role client to change role', async () => {
    // Promote to instructor via service role
    const { error: promoteError } = await admin
      .from('users')
      .update({ role: 'instructor' })
      .eq('id', studentId)

    expect(promoteError).toBeNull()

    const { data } = await admin.from('users').select('role').eq('id', studentId).single()
    expect(data?.role).toBe('instructor')

    // Restore original role for subsequent tests
    await admin.from('users').update({ role: 'student' }).eq('id', studentId)
  })

  it('allows the service-role client to set deleted_at (soft delete)', async () => {
    const ts = new Date().toISOString()

    const { error } = await admin.from('users').update({ deleted_at: ts }).eq('id', studentId)

    expect(error).toBeNull()

    const { data } = await admin.from('users').select('deleted_at').eq('id', studentId).single()
    expect(data?.deleted_at).not.toBeNull()

    // Restore for cleanup
    await admin.from('users').update({ deleted_at: null }).eq('id', studentId)
  })
})
