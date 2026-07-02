/**
 * Red Team Spec: Audit Auth Event Completeness
 *
 * Asserts the 5 auth-related audit_events.event_type literals are written:
 * student.login (record_login), user.password_changed, user.password_reset,
 * user.created, user.deactivated (record_auth_event — Vector CT, #788).
 *
 * The 11 quiz/exam/internal-exam positive-emission tests live in
 * audit-completeness.spec.ts.
 *
 * Called via the RPCs directly, not the Server Actions — the Server Actions
 * fire it best-effort, so their timing is unreliable for an audit assertion.
 */

import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { expectAuditRow } from './helpers/audit-helpers'
import { cleanupFixtures, createFixtureTracker } from './helpers/cleanup'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed-users'

test.describe('Red Team: Audit Auth Event Completeness', () => {
  let admin: ReturnType<typeof getAdminClient>
  let studentClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let adminAuthedClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let studentUserId: string
  let victimUserId: string
  let adminUserId: string

  // Fixture tracker: the `users` set holds soft-deleted user ids to be restored
  // in afterEach (only the user.deactivated CT target).
  const tracker = createFixtureTracker()

  test.beforeAll(async () => {
    admin = getAdminClient()

    const seeded = await seedRedTeamUsers()
    studentUserId = seeded.attackerUserId
    victimUserId = seeded.victimUserId

    const seededAdmin = await seedRedTeamAdmin()
    adminUserId = seededAdmin.adminUserId

    studentClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    adminAuthedClient = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
  })

  test.afterEach(async () => {
    // Restore any soft-deleted users (user.deactivated test) so seed users
    // survive the run. Uses cleanupFixtures' users restore path.
    await cleanupFixtures(admin, tracker)
  })

  test('writes student.login when record_login() is invoked', async () => {
    // record_login() rate-limits at 60s — if a prior call was within the
    // window, the RPC returns without inserting. Snapshot the most recent
    // matching row before the call; afterwards either a new row exists
    // (delta), or the rate-limit kept an existing row that's still inside
    // the window. Snapshotting eliminates the false-positive where a
    // concurrent spec writes a student.login for the same actor.
    //
    // Known race (accepted): if a concurrent record_login fires for the
    // same studentUserId between the pre and post queries, the test passes
    // on the new row even though it wasn't produced by this invocation.
    // Practical risk is near-zero — Playwright runs the redteam project
    // serially, and studentUserId is the redteam-scoped attacker user.
    const { data: pre, error: preError } = await admin
      .from('audit_events')
      .select('id, created_at')
      .eq('event_type', 'student.login')
      .eq('actor_id', studentUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (preError) throw new Error(`student.login pre-query: ${preError.message}`)

    const { error } = await studentClient.rpc('record_login')
    expect(error, 'record_login error').toBeNull()

    const { data: post, error: postError } = await admin
      .from('audit_events')
      .select('id, created_at')
      .eq('event_type', 'student.login')
      .eq('actor_id', studentUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (postError) throw new Error(`student.login post-query: ${postError.message}`)

    expect(post, 'expected at least one student.login row after record_login').not.toBeNull()
    if (pre?.id && post?.id === pre.id) {
      // Rate-limited path: existing row must be within the 60s window.
      const ageMs = Date.now() - new Date(post.created_at as string).getTime()
      expect(ageMs).toBeLessThan(60_000)
    }
  })

  // Vector CT (#788): positive emission for record_auth_event (mig 093). The 4
  // whitelisted auth event_types must land in the immutable audit log with the
  // correct actor (= auth.uid()) and resource_id. Called via the RPC directly,
  // not the Server Actions — the Server Actions fire it best-effort, so their
  // timing is unreliable for an audit assertion.

  test('records user.password_changed in the audit log for a self-service password change', async () => {
    const testStart = new Date().toISOString()

    // Self-service event: caller is the student, resource MUST equal the actor.
    const { data, error } = await studentClient.rpc('record_auth_event', {
      p_event_type: 'user.password_changed',
      p_resource_id: studentUserId,
    })
    expect(error, 'record_auth_event user.password_changed error').toBeNull()
    expect(data).toBeNull() // record_auth_event RETURNS void → null data on success

    await expectAuditRow(admin, 'user.password_changed', studentUserId, testStart, studentUserId)
  })

  test('records user.password_reset in the audit log when an admin resets a student password', async () => {
    const testStart = new Date().toISOString()

    // Admin-only event: caller is the admin, resource is the active student.
    const { data, error } = await adminAuthedClient.rpc('record_auth_event', {
      p_event_type: 'user.password_reset',
      p_resource_id: studentUserId,
    })
    expect(error, 'record_auth_event user.password_reset error').toBeNull()
    expect(data).toBeNull() // record_auth_event RETURNS void → null data on success

    // actor = admin (auth.uid()), resource = the student whose password was reset.
    await expectAuditRow(admin, 'user.password_reset', adminUserId, testStart, studentUserId)
  })

  test('records user.created in the audit log when an admin creates a student', async () => {
    const testStart = new Date().toISOString()

    // record_auth_event does NOT re-SELECT the resource for admin events (mig 093 —
    // the resource lookup would need a deleted_at filter that breaks user.deactivated),
    // and the real createStudent flow records the just-created user's id. A fresh UUID
    // faithfully represents that brand-new student without provisioning a persistent
    // auth user that would accumulate across runs and require extra cleanup.
    const newUserId = randomUUID()
    const { data, error } = await adminAuthedClient.rpc('record_auth_event', {
      p_event_type: 'user.created',
      p_resource_id: newUserId,
    })
    expect(error, 'record_auth_event user.created error').toBeNull()
    expect(data).toBeNull() // record_auth_event RETURNS void → null data on success

    // actor = admin (auth.uid()), resource = the newly created student (not swapped).
    await expectAuditRow(admin, 'user.created', adminUserId, testStart, newUserId)
  })

  test('records user.deactivated in the audit log when an admin deactivates a student', async () => {
    // Mirror the real deactivateStudent flow: by the time the audit event is
    // recorded the target is ALREADY soft-deleted. record_auth_event does not
    // re-SELECT the resource, so a soft-deleted resource_id is accepted. The
    // admin CALLER stays active — only the resource is soft-deleted.
    const { data: deleted, error: deleteErr } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', victimUserId)
      .select('id')
    if (deleteErr) throw new Error(`user.deactivated soft-delete target: ${deleteErr.message}`)
    if (!deleted?.length) {
      throw new Error('user.deactivated target user row not found before soft-delete')
    }
    tracker.users.add(victimUserId)

    const testStart = new Date().toISOString()
    const { data, error } = await adminAuthedClient.rpc('record_auth_event', {
      p_event_type: 'user.deactivated',
      p_resource_id: victimUserId,
    })
    expect(error, 'record_auth_event user.deactivated error').toBeNull()
    expect(data).toBeNull() // record_auth_event RETURNS void → null data on success

    // actor = admin (auth.uid()), resource = the deactivated student.
    await expectAuditRow(admin, 'user.deactivated', adminUserId, testStart, victimUserId)
  })
})
