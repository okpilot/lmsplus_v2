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
 * The trigger fires BEFORE UPDATE on the users table and raises an exception
 * when a non-service-role connection attempts to modify role, organization_id,
 * or deleted_at. PostgREST surfaces this as an error in the response, unlike
 * RLS silent-block behaviour tested in rls-immutable-tables.
 *
 * Service-role writes (via the admin client) must continue to work — the trigger
 * explicitly bypasses checks when current_setting('role') = 'service_role'.
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
    const { error } = await studentClient
      .from('users')
      .update({ role: 'admin' })
      .eq('id', studentId)

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/Cannot modify role column/i)

    // Confirm the role is unchanged
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
      const { error } = await studentClient
        .from('users')
        .update({ organization_id: otherOrgId })
        .eq('id', studentId)

      expect(error).not.toBeNull()
      expect(error?.message).toMatch(/Cannot modify organization_id column/i)

      // Confirm the org is unchanged
      const { data } = await admin
        .from('users')
        .select('organization_id')
        .eq('id', studentId)
        .single()
      expect(data?.organization_id).toBe(orgId)
    } finally {
      // Clean up the extra org (no users to remove from it)
      await admin.from('organizations').delete().eq('id', otherOrgId)
    }
  })

  it('blocks a student from setting deleted_at directly', async () => {
    const { error } = await studentClient
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', studentId)

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/Cannot modify deleted_at column/i)

    // Confirm the user is not soft-deleted
    const { data } = await admin.from('users').select('deleted_at').eq('id', studentId).single()
    expect(data?.deleted_at).toBeNull()
  })

  // ── Safe column — trigger must not interfere ──────────────────────────────

  it('allows a student to update their own full_name', async () => {
    const { error } = await studentClient
      .from('users')
      .update({ full_name: 'Updated Name' })
      .eq('id', studentId)

    // No RLS UPDATE policy exists for students by design — PostgREST may return
    // a no-rows-affected success rather than an error. What matters is the
    // trigger does NOT raise — the error must not be a trigger exception.
    if (error) {
      expect(error.message).not.toMatch(/Cannot modify/i)
    }
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
