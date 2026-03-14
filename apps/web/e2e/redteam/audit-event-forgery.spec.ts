/**
 * Red Team Spec: Audit Event Forgery
 *
 * Vector F (MEDIUM): A student attempts to INSERT a fake event into the
 * audit_events table — e.g., impersonating an admin action or poisoning the
 * audit trail with fabricated records.
 *
 * audit_events is declared append-only (no UPDATE, no DELETE) but the question
 * is whether students can INSERT arbitrary rows at all.
 *
 * Status: CONFIRMED GAP (to be verified) — students may be able to INSERT.
 * The fixme test documents the secure expectation. Once an INSERT RLS policy
 * restricting inserts to service-role/RPCs only is applied, remove test.fixme.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed'

test.describe('Red Team: Audit Event Forgery', () => {
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let attackerUserId: string
  let adminClient: Awaited<ReturnType<typeof getAdminClient>>

  test.beforeAll(async () => {
    await seedRedTeamUsers()
    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    adminClient = getAdminClient()

    const { data: me } = await attackerClient.auth.getUser()
    attackerUserId = me?.user?.id ?? ''
    expect(attackerUserId).not.toBe('')
  })

  test('student cannot INSERT a fake admin event into audit_events', async () => {
    // Attack: forge an admin impersonation audit entry.
    // If this INSERT succeeds, an attacker can poison the audit trail —
    // making it appear that admin actions were taken, or covering their tracks.
    const { error } = await attackerClient.from('audit_events').insert({
      event_type: 'admin.impersonation',
      actor_id: attackerUserId,
      metadata: JSON.stringify({ target: 'admin', note: 'red team test — should be rejected' }),
    })

    // DESIRED: RLS should block this INSERT — students must not write audit events.
    // Currently this may succeed (gap). The test failing means the exploit works.
    expect(error).not.toBeNull()
  })

  test('student cannot INSERT a self-serving result event into audit_events', async () => {
    // Attack: forge a quiz completion event with a perfect score.
    // If students can write to audit_events, they can fabricate their own learning history.
    const { error } = await attackerClient.from('audit_events').insert({
      event_type: 'quiz.completed',
      actor_id: attackerUserId,
      metadata: JSON.stringify({
        score: 100,
        questions: 100,
        correct: 100,
        note: 'red team test — fabricated score',
      }),
    })

    expect(error).not.toBeNull()
  })

  test('student cannot UPDATE an existing audit event (append-only enforcement)', async () => {
    // Even if a student somehow knows an event ID, they must not be able to modify it.
    const { data: events } = await adminClient.from('audit_events').select('id').limit(1)

    if (!events || events.length === 0) {
      // No events to target — skip (not a test failure, just no data)
      return
    }

    const targetEventId = events[0].id

    const { error } = await attackerClient
      .from('audit_events')
      .update({ metadata: JSON.stringify({ tampered: true }) })
      .eq('id', targetEventId)

    // UPDATE must always fail — audit_events is immutable
    expect(error).not.toBeNull()
  })

  test('student cannot DELETE an audit event', async () => {
    const { data: events } = await adminClient.from('audit_events').select('id').limit(1)

    if (!events || events.length === 0) {
      return
    }

    const targetEventId = events[0].id

    const { error } = await attackerClient.from('audit_events').delete().eq('id', targetEventId)

    // DELETE must always fail — audit_events is immutable
    expect(error).not.toBeNull()
  })
})
