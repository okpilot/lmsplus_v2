import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestData } from './cleanup'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

/**
 * Integration tests for record_auth_event() RPC (migration 093 / #379).
 *
 * The RPC is SECURITY DEFINER, EXECUTE-granted to authenticated.
 * It must be self-defending against forged events — actor id/role are
 * derived from auth.uid(), never from caller input.
 *
 * Covered:
 *  (a) student records their own password-change → audit row created
 *  (b) student cannot forge an admin event type → throws 'not authorized'
 *  (c) student cannot record a self-event for another user → throws
 *  (d) unsupported event_type → throws
 *  (e) admin records a user.created event for a student in the same org → audit row created
 *  (f) admin cannot record an admin-only event for a user in a different org → throws
 */
describe('RPC: record_auth_event', () => {
  const admin = getAdminClient()
  const suffix = Date.now()

  let orgId: string
  let studentId: string
  let adminUserId: string
  let otherStudentId: string
  let studentClient: SupabaseClient
  let adminClient: SupabaseClient
  const userIds: string[] = []

  // Second org + user for cross-org rejection test
  let otherOrgId: string
  let otherOrgUserId: string

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org AuthEvent ${suffix}`,
      slug: `test-auth-event-${suffix}`,
    })

    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-auth-event-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)

    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-auth-event-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)

    otherStudentId = await createTestUser({
      admin,
      orgId,
      email: `student2-auth-event-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(otherStudentId)

    studentClient = await getAuthenticatedClient({
      email: `student-auth-event-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    adminClient = await getAuthenticatedClient({
      email: `admin-auth-event-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    // Second org — used to verify cross-org rejection for admin events
    otherOrgId = await createTestOrg({
      admin,
      name: `Other Org AuthEvent ${suffix}`,
      slug: `other-auth-event-${suffix}`,
    })
    otherOrgUserId = await createTestUser({
      admin,
      orgId: otherOrgId,
      email: `other-student-auth-event-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(otherOrgUserId)
  })

  afterAll(async () => {
    // Clean primary org (covers orgId-scoped audit_events + all userIds in the primary org)
    await cleanupTestData({ admin, orgId, userIds: userIds.filter((id) => id !== otherOrgUserId) })
    // Clean the cross-org user + their org separately
    await cleanupTestData({ admin, orgId: otherOrgId, userIds: [otherOrgUserId] })
  })

  // ── (a) Happy path: student records own password change ──────────────────────

  it('creates an audit row when a student records their own password_changed event', async () => {
    const { error } = await studentClient.rpc('record_auth_event', {
      p_event_type: 'user.password_changed',
      p_resource_id: studentId,
    })

    expect(error).toBeNull()

    // Verify the audit row was written (admin reads audit_events)
    const { data: rows, error: readErr } = await admin
      .from('audit_events')
      .select('actor_id, actor_role, event_type, resource_type, resource_id, organization_id')
      .eq('actor_id', studentId)
      .eq('event_type', 'user.password_changed')
      .order('created_at', { ascending: false })
      .limit(1)

    expect(readErr).toBeNull()
    expect(rows).toHaveLength(1)
    const row = rows![0]!
    expect(row.actor_id).toBe(studentId)
    expect(row.actor_role).toBe('student')
    expect(row.event_type).toBe('user.password_changed')
    expect(row.resource_type).toBe('user')
    expect(row.resource_id).toBe(studentId)
    expect(row.organization_id).toBe(orgId)
  })

  // ── (b) Student cannot forge an admin-only event ──────────────────────────

  it('rejects a student attempting to record an admin-only event (not authorized)', async () => {
    const { error } = await studentClient.rpc('record_auth_event', {
      p_event_type: 'user.created',
      p_resource_id: otherStudentId,
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/not authorized/i)
  })

  it('rejects a student attempting to record user.password_reset for another user', async () => {
    const { error } = await studentClient.rpc('record_auth_event', {
      p_event_type: 'user.password_reset',
      p_resource_id: otherStudentId,
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/not authorized/i)
  })

  it('rejects a student attempting to record user.deactivated for another user', async () => {
    const { error } = await studentClient.rpc('record_auth_event', {
      p_event_type: 'user.deactivated',
      p_resource_id: otherStudentId,
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/not authorized/i)
  })

  // ── (c) Student cannot forge a self-event for a different resource ────────

  it('rejects a student recording user.password_changed for a different user', async () => {
    const { error } = await studentClient.rpc('record_auth_event', {
      p_event_type: 'user.password_changed',
      p_resource_id: otherStudentId, // not the actor
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/self event resource must be the actor/i)
  })

  // ── (d) Unsupported event_type is rejected ────────────────────────────────

  it('rejects an unsupported event_type', async () => {
    const { error } = await studentClient.rpc('record_auth_event', {
      p_event_type: 'user.hacked',
      p_resource_id: studentId,
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/unsupported event_type/i)
  })

  // ── (e) Admin happy path: records user.created for a student in same org ──

  it('creates an audit row when an admin records user.created for a student in the same org', async () => {
    const { error } = await adminClient.rpc('record_auth_event', {
      p_event_type: 'user.created',
      p_resource_id: studentId,
    })

    expect(error).toBeNull()

    const { data: rows, error: readErr } = await admin
      .from('audit_events')
      .select('actor_id, actor_role, event_type, resource_id, organization_id')
      .eq('actor_id', adminUserId)
      .eq('event_type', 'user.created')
      .eq('resource_id', studentId)
      .order('created_at', { ascending: false })
      .limit(1)

    expect(readErr).toBeNull()
    expect(rows).toHaveLength(1)
    const row = rows![0]!
    expect(row.actor_id).toBe(adminUserId)
    expect(row.actor_role).toBe('admin')
    expect(row.resource_id).toBe(studentId)
    expect(row.organization_id).toBe(orgId)
  })

  // ── (f) Admin cannot record an event for a user in a different org ────────

  it('rejects an admin recording an event for a user in a different org', async () => {
    // adminClient is authenticated as an admin in orgId.
    // otherOrgUserId belongs to otherOrgId — outside the admin's org.
    const { error } = await adminClient.rpc('record_auth_event', {
      p_event_type: 'user.deactivated',
      p_resource_id: otherOrgUserId,
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/resource not in caller org/i)

    // Non-vacuous: verify the other-org user actually exists so the rejection
    // is an org boundary, not a missing row.
    const { data: exists, error: lookupErr } = await admin
      .from('users')
      .select('id')
      .eq('id', otherOrgUserId)
      .single()
    expect(lookupErr).toBeNull()
    expect(exists).not.toBeNull()
  })
})
