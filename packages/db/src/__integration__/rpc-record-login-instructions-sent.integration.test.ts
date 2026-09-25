import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import {
  createTestOrg,
  createTestUser,
  getAdminClient,
  getAnonClient,
  getAuthenticatedClient,
} from './setup'

/**
 * Integration tests for record_login_instructions_sent() RPC
 * (migration 20260925000100).
 *
 * SECURITY DEFINER, EXECUTE-granted to authenticated. Stamps
 * login_instructions_sent_at = now() and temp_password_expires_at =
 * now() + 7 days on the target public.users row, then writes one
 * 'user.login_instructions_sent' audit row. audit_events blocks direct
 * INSERTs (audit_no_direct_insert = WITH CHECK false), so the row can
 * only originate from this function.
 *
 * Covered:
 *  (a) admin sends to a student in their org → both columns stamped
 *      (expiry = sent + 7 days) + one audit row with exact fields
 *  (b) resend on the same target → both columns move later
 *  (c) non-admin (student) caller → 'not_admin', no audit row
 *  (d) unauthenticated caller (auth.uid() NULL) → 'not_authenticated'
 *  (e) cross-org target → 'user_not_found', target row unchanged
 *  (f) soft-deleted target → 'user_not_found', target row unchanged
 *  (g) admin target (role guard) → 'user_not_found', target row unchanged
 *  (h) unknown user id → 'user_not_found', no audit row
 *
 * Every rejection asserts the target row/columns are unchanged (or, for the
 * unknown-id case, that no audit row exists) — non-vacuous per code-style.md
 * §7: the target's pre-call state is read and asserted before the RPC call.
 *
 * Hermetic: users/org rows created here are hard-deleted by cleanupTestData
 * in afterAll (test teardown only, see cleanup.ts header). audit_events is
 * append-only/immutable, so assertions scope by resource_id rather than
 * deleting audit rows — cleanupTestData explicitly deletes audit_events by
 * organization_id (cleanup.ts:83-84) before deleting the org, not a cascade.
 */
describe('RPC: record_login_instructions_sent', () => {
  const admin = getAdminClient()
  const suffix = fixtureSuffix()

  let orgId: string
  let adminUserId: string
  let adminClient: SupabaseClient
  const userIds: string[] = []

  let otherOrgId: string
  let otherOrgAdminId: string
  const otherUserIds: string[] = []

  let targetCounter = 0

  /** Seed a fresh target user in `org`, unique per call, tracked for cleanup. */
  async function createTarget(opts: {
    org: string
    role: 'admin' | 'instructor' | 'student'
    trackIn?: string[]
  }): Promise<{ id: string; email: string }> {
    targetCounter += 1
    const email = `target-${targetCounter}-${suffix}@test.local`
    const id = await createTestUser({
      admin,
      orgId: opts.org,
      email,
      password: 'test-pass-123',
      role: opts.role,
    })
    ;(opts.trackIn ?? userIds).push(id)
    return { id, email }
  }

  /** Read the two tracked columns for a target user via the service-role client. */
  async function readColumns(userId: string) {
    const { data, error } = await admin
      .from('users')
      .select('login_instructions_sent_at, temp_password_expires_at')
      .eq('id', userId)
      .single()
    if (error) throw new Error(`readColumns: ${error.message}`)
    return data as {
      login_instructions_sent_at: string | null
      temp_password_expires_at: string | null
    }
  }

  /** Count audit rows for the RPC's event_type against a resource_id. */
  async function auditCount(resourceId: string): Promise<number> {
    const { data, error } = await admin
      .from('audit_events')
      .select('id')
      .eq('event_type', 'user.login_instructions_sent')
      .eq('resource_id', resourceId)
    if (error) throw new Error(`auditCount: ${error.message}`)
    return data?.length ?? 0
  }

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org LoginInstr ${suffix}`,
      slug: `test-login-instr-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-login-instr-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    adminClient = await getAuthenticatedClient({
      email: `admin-login-instr-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    otherOrgId = await createTestOrg({
      admin,
      name: `Other Org LoginInstr ${suffix}`,
      slug: `other-login-instr-${suffix}`,
    })
    otherOrgAdminId = await createTestUser({
      admin,
      orgId: otherOrgId,
      email: `other-admin-login-instr-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    otherUserIds.push(otherOrgAdminId)
  })

  afterAll(async () => {
    const errors: string[] = []
    try {
      await cleanupTestData({ admin, orgId, userIds })
    } catch (e) {
      errors.push(`cleanup ${orgId}: ${e instanceof Error ? e.message : String(e)}`)
    }
    try {
      await cleanupTestData({ admin, orgId: otherOrgId, userIds: otherUserIds })
    } catch (e) {
      errors.push(`cleanup ${otherOrgId}: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  // ── (a) Admin happy path ────────────────────────────────────────────────

  it('stamps a 7-day expiry and writes one audit row when an admin sends instructions to a student in their org', async () => {
    const { id: studentId } = await createTarget({ org: orgId, role: 'student' })

    const before = await readColumns(studentId)
    expect(before.login_instructions_sent_at).toBeNull()
    expect(before.temp_password_expires_at).toBeNull()

    const { error } = await adminClient.rpc('record_login_instructions_sent', {
      p_user_id: studentId,
    })
    expect(error).toBeNull()

    const after = await readColumns(studentId)
    expect(after.login_instructions_sent_at).not.toBeNull()
    expect(after.temp_password_expires_at).not.toBeNull()
    const sentAt = new Date(after.login_instructions_sent_at as string).getTime()
    const expiresAt = new Date(after.temp_password_expires_at as string).getTime()
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    expect(Math.abs(expiresAt - sentAt - sevenDaysMs)).toBeLessThan(5000)

    const { data: rows, error: readErr } = await admin
      .from('audit_events')
      .select(
        'actor_id, actor_role, event_type, resource_type, resource_id, organization_id, metadata',
      )
      .eq('event_type', 'user.login_instructions_sent')
      .eq('resource_id', studentId)
    expect(readErr).toBeNull()
    expect(rows).toHaveLength(1)
    const row = rows![0]!
    expect(row.actor_id).toBe(adminUserId)
    expect(row.actor_role).toBe('admin')
    expect(row.resource_type).toBe('user')
    expect(row.organization_id).toBe(orgId)
    expect(row.metadata).toMatchObject({ expires_at: after.temp_password_expires_at })
  })

  // ── (b) Resend moves both timestamps later ──────────────────────────────

  it('moves both timestamps later on a resend to an instructor', async () => {
    const { id: instructorId } = await createTarget({ org: orgId, role: 'instructor' })

    const { error: firstErr } = await adminClient.rpc('record_login_instructions_sent', {
      p_user_id: instructorId,
    })
    expect(firstErr).toBeNull()
    const first = await readColumns(instructorId)
    expect(first.login_instructions_sent_at).not.toBeNull()

    const { error: secondErr } = await adminClient.rpc('record_login_instructions_sent', {
      p_user_id: instructorId,
    })
    expect(secondErr).toBeNull()
    const second = await readColumns(instructorId)

    // The two RPC calls are separate transactions with an intervening network
    // roundtrip, so now() strictly advances between them.
    expect(new Date(second.login_instructions_sent_at as string).getTime()).toBeGreaterThan(
      new Date(first.login_instructions_sent_at as string).getTime(),
    )
    expect(new Date(second.temp_password_expires_at as string).getTime()).toBeGreaterThan(
      new Date(first.temp_password_expires_at as string).getTime(),
    )
  })

  // ── (c) Non-admin caller is rejected ────────────────────────────────────

  it('rejects a student (non-admin) caller with not_admin and writes no audit row', async () => {
    const { id: studentId, email } = await createTarget({ org: orgId, role: 'student' })
    const studentClient = await getAuthenticatedClient({
      email,
      password: 'test-pass-123',
    })

    const { error } = await studentClient.rpc('record_login_instructions_sent', {
      p_user_id: studentId,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/not_admin/)
    expect(await auditCount(studentId)).toBe(0)
  })

  // ── (d) Unauthenticated caller is rejected ──────────────────────────────

  it('rejects an unauthenticated call with not_authenticated', async () => {
    const { id: studentId } = await createTarget({ org: orgId, role: 'student' })
    const anonClient = getAnonClient()

    const { error } = await anonClient.rpc('record_login_instructions_sent', {
      p_user_id: studentId,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/not_authenticated/)
    expect(await auditCount(studentId)).toBe(0)
  })

  // ── (e) Cross-org target is rejected ────────────────────────────────────

  it('rejects a target belonging to another org with user_not_found, leaving it unchanged', async () => {
    const { id: foreignId } = await createTarget({
      org: otherOrgId,
      role: 'student',
      trackIn: otherUserIds,
    })
    const before = await readColumns(foreignId)
    expect(before.login_instructions_sent_at).toBeNull()

    const { error } = await adminClient.rpc('record_login_instructions_sent', {
      p_user_id: foreignId,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/user_not_found/)

    const after = await readColumns(foreignId)
    expect(after.login_instructions_sent_at).toBeNull()
    expect(after.temp_password_expires_at).toBeNull()
    expect(await auditCount(foreignId)).toBe(0)
  })

  // ── (f) Soft-deleted target is rejected ─────────────────────────────────

  it('rejects a soft-deleted target with user_not_found, leaving it unchanged', async () => {
    const { id: studentId } = await createTarget({ org: orgId, role: 'student' })
    const { data: deleted, error: delErr } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', studentId)
      .select('id')
    if (delErr) throw new Error(`soft-delete: ${delErr.message}`)
    expect(deleted).toHaveLength(1)

    const { error } = await adminClient.rpc('record_login_instructions_sent', {
      p_user_id: studentId,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/user_not_found/)

    const after = await readColumns(studentId)
    expect(after.login_instructions_sent_at).toBeNull()
    expect(after.temp_password_expires_at).toBeNull()
    expect(await auditCount(studentId)).toBe(0)
  })

  // ── (g) Admin target is rejected (role guard) ───────────────────────────

  it('rejects an admin target with user_not_found, leaving it unchanged', async () => {
    const { id: otherAdminId } = await createTarget({ org: orgId, role: 'admin' })
    const before = await readColumns(otherAdminId)
    expect(before.login_instructions_sent_at).toBeNull()

    const { error } = await adminClient.rpc('record_login_instructions_sent', {
      p_user_id: otherAdminId,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/user_not_found/)

    const after = await readColumns(otherAdminId)
    expect(after.login_instructions_sent_at).toBeNull()
    expect(after.temp_password_expires_at).toBeNull()
    expect(await auditCount(otherAdminId)).toBe(0)
  })

  // ── (h) Unknown user id is rejected ─────────────────────────────────────

  it('rejects an unknown user id with user_not_found and writes no audit row', async () => {
    const unknownId = '00000000-0000-0000-0000-000000000000'

    const { error } = await adminClient.rpc('record_login_instructions_sent', {
      p_user_id: unknownId,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/user_not_found/)
    expect(await auditCount(unknownId)).toBe(0)
  })
})
