/**
 * Red Team Spec: record_auth_event RPC forgery guards (#788)
 *
 * `record_auth_event(p_event_type, p_resource_id, p_metadata)` is a SECURITY
 * DEFINER RPC EXECUTE-granted to `authenticated`, so it must be self-defending
 * against forged audit events. It derives actor_id / actor_role / org from
 * auth.uid() (never from caller input) and enforces three gates in order
 * (mig 093 / 20260606000009):
 *   1. auth.uid() IS NULL                  -> 'not authenticated'
 *   2. actor lookup WHERE id=auth.uid()    -> 'user not found or inactive'
 *      AND deleted_at IS NULL fails
 *   3. event_type whitelist:
 *        - 'user.password_changed' (self): resource MUST equal actor, else
 *          'self event resource must be the actor'
 *        - 'user.password_reset' | 'user.deactivated' | 'user.created' (admin):
 *          v_role <> 'admin' -> 'not authorized'
 *        - anything else -> 'unsupported event_type: %'
 *
 * The integration test covers the DB layer; this is the red-team E2E complement,
 * exercising the guards through the full auth-session stack (real student / admin
 * / cross-org admin JWTs via PostgREST).
 *
 * Vectors (attack-surface.md):
 *  - CN (A1): a student cannot record any admin-only event_type -> 'not authorized'.
 *  - CO (A2): a student cannot record a self-event for another user
 *             -> 'self event resource must be the actor'.
 *  - CP (A3): an authenticated caller cannot record an unlisted event_type
 *             -> 'unsupported event_type'.
 *  - CR (A5): a cross-org admin CAN record an admin event whose resource_id is a
 *             user in another org (ACCEPTED, error null) — but the audit row's
 *             organization_id is the CALLING admin's own org, proving no cross-org
 *             write. (Non-vacuous: the resource user genuinely lives in a different
 *             org from the caller.)
 *  - CS: actor_id invariant — when an admin records 'user.created' with
 *        p_resource_id = a student id, the audit row records actor_id = the admin
 *        and resource_id = the student (the two are not swapped).
 *
 * audit_events is IMMUTABLE / append-only (docs/security.md §5) — rows written
 * here are NEVER cleaned up. Every audit read is scoped by `gte('created_at',
 * testStart)` where testStart is captured just before the RPC call, plus actor_id
 * + event_type, so the assertion targets exactly the row this test produced.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedCrossOrgAdmin,
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed-users'

const RPC = 'record_auth_event'
const ADMIN_EVENT_TYPES = ['user.created', 'user.password_reset', 'user.deactivated'] as const

type AuditRow = {
  id: string
  organization_id: string
  actor_id: string
  resource_id: string | null
  event_type: string
}

test.describe('Red Team: record_auth_event RPC forgery guards (#788)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let studentClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let adminClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let crossOrgAdminClient: Awaited<ReturnType<typeof createAuthenticatedClient>>

  let attackerUserId: string
  let victimUserId: string
  let orgId: string
  let adminUserId: string
  let crossOrgAdminUserId: string
  let crossOrgId: string

  /**
   * Read the single audit_events row this test produced. Scoped by actor +
   * event_type + testStart (created_at). audit_events is append-only, so this
   * is a read-only assertion helper — no cleanup follows.
   */
  const findAuditRow = async (opts: {
    eventType: string
    actorId: string
    testStart: string
  }): Promise<AuditRow | null> => {
    const { data, error } = await admin
      .from('audit_events')
      .select('id, organization_id, actor_id, resource_id, event_type')
      .eq('event_type', opts.eventType)
      .eq('actor_id', opts.actorId)
      .gte('created_at', opts.testStart)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(`findAuditRow(${opts.eventType}): ${error.message}`)
    return (data as AuditRow | null) ?? null
  }

  test.beforeAll(async () => {
    admin = getAdminClient()

    const seed = await seedRedTeamUsers()
    attackerUserId = seed.attackerUserId
    victimUserId = seed.victimUserId
    orgId = seed.orgId

    const adminSeed = await seedRedTeamAdmin()
    adminUserId = adminSeed.adminUserId

    const crossOrgSeed = await seedCrossOrgAdmin()
    crossOrgAdminUserId = crossOrgSeed.adminUserId
    crossOrgId = crossOrgSeed.orgId

    // Actor-liveness pre-check: the RPC's gate 2 ('user not found or inactive')
    // fires before the event-type gates if a caller's users row is soft-deleted.
    // seedRedTeam*/upsertUser do NOT restore deleted_at, so a failed afterEach in
    // another spec could leave a caller soft-deleted (cross-spec risk). Assert all
    // RPC callers are active up front, otherwise CN/CO/CP would fail spuriously on
    // the gate-2 message instead of the gate-3 message under test.
    //
    // Run this BEFORE createAuthenticatedClient: it needs only the seeded user
    // ids, and a pre-check failure here must not leave the describe's tests
    // running against undefined clients (tracked beforeAll-crash pattern).
    const { data: callerRows, error: callerErr } = await admin
      .from('users')
      .select('id, deleted_at')
      .in('id', [attackerUserId, adminUserId, crossOrgAdminUserId])
    if (callerErr) throw new Error(`actor-liveness pre-check: ${callerErr.message}`)
    expect(callerRows ?? []).toHaveLength(3)
    for (const row of callerRows ?? []) {
      expect(
        (row as { deleted_at: string | null }).deleted_at,
        `caller ${(row as { id: string }).id} must be active (deleted_at IS NULL)`,
      ).toBeNull()
    }

    studentClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    adminClient = await createAuthenticatedClient(adminSeed.email, adminSeed.password)
    crossOrgAdminClient = await createAuthenticatedClient(crossOrgSeed.email, crossOrgSeed.password)

    // CR non-vacuity precondition: the cross-org admin and the resource user it
    // will reference must genuinely live in different orgs.
    expect(crossOrgId).not.toBe(orgId)
  })

  test('CN: a student cannot record any admin-only event_type', async () => {
    // Each admin event requires v_role = 'admin'; the student caller is rejected
    // by gate 3's admin branch. Use a non-self resource id so a future regression
    // can't accidentally pass through the self-event branch.
    // Gate 3's role check fires BEFORE any resource-state validation, so passing a
    // live (non-deleted) victimUserId for 'user.deactivated' is fine here: the real
    // deactivate flow's target is already soft-deleted, but mig 093 does not re-SELECT
    // the resource, so gate ordering is unaffected by the resource's deleted_at state.
    for (const eventType of ADMIN_EVENT_TYPES) {
      const { data, error } = await studentClient.rpc(RPC, {
        p_event_type: eventType,
        p_resource_id: victimUserId,
      })
      expect(error, `expected ${eventType} to be rejected`).not.toBeNull()
      expect(error?.message ?? '').toMatch(/not authorized/i)
      expect(data).toBeNull()
    }
  })

  test('CO: a student cannot record a self-event for another user', async () => {
    // 'user.password_changed' forces resource_id = actor. The student passes the
    // victim's id (a different user), so the self-event guard rejects it.
    const { data, error } = await studentClient.rpc(RPC, {
      p_event_type: 'user.password_changed',
      p_resource_id: victimUserId,
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/self event resource must be the actor/i)
    expect(data).toBeNull()
  })

  test('CP: an authenticated caller cannot record an unlisted event_type', async () => {
    // 'user.hacked' matches no whitelist branch -> the ELSE arm raises. The caller
    // is an active authenticated student, so gates 1 and 2 pass; gate 3's ELSE fires.
    const { data, error } = await studentClient.rpc(RPC, {
      p_event_type: 'user.hacked',
      p_resource_id: attackerUserId,
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/unsupported event_type/i)
    expect(data).toBeNull()
  })

  test("CR: a cross-org admin's event for a foreign-org user logs under the admin's own org", async () => {
    // A bogus/cross-org resource_id is ACCEPTED by design — the RPC does NOT
    // re-SELECT the resource to org-scope it (mig 093 comment). The security
    // property is that the resulting audit row's organization_id is the CALLING
    // admin's own org, never the resource user's org — so no cross-org write occurs.
    // Non-vacuous: assert the resource user truly lives in a DIFFERENT org first.
    const { data: resourceRow, error: resourceErr } = await admin
      .from('users')
      .select('organization_id')
      .eq('id', victimUserId)
      .single()
    expect(resourceErr).toBeNull()
    expect((resourceRow as { organization_id: string }).organization_id).toBe(orgId)
    expect(orgId).not.toBe(crossOrgId)

    const testStart = new Date().toISOString()
    const { data, error } = await crossOrgAdminClient.rpc(RPC, {
      p_event_type: 'user.created',
      p_resource_id: victimUserId,
    })
    // Accepted: no rejection.
    expect(error).toBeNull()
    expect(data).toBeNull()

    const row = await findAuditRow({
      eventType: 'user.created',
      actorId: crossOrgAdminUserId,
      testStart,
    })
    expect(row, 'audit row for the cross-org admin event must exist').not.toBeNull()
    // The row is logged under the admin's OWN org, NOT the foreign resource's org.
    expect(row?.organization_id).toBe(crossOrgId)
    expect(row?.organization_id).not.toBe(orgId)
    expect(row?.resource_id).toBe(victimUserId)
  })

  test('CS: actor_id is the admin and resource_id is the student (not swapped)', async () => {
    // An admin records 'user.created' for a student. The audit row must attribute
    // the action to the admin (actor_id = auth.uid()) and reference the student as
    // the resource (resource_id = p_resource_id) — the two must not be transposed.
    const testStart = new Date().toISOString()
    const { data, error } = await adminClient.rpc(RPC, {
      p_event_type: 'user.created',
      p_resource_id: victimUserId,
    })
    expect(error).toBeNull()
    expect(data).toBeNull()

    const row = await findAuditRow({
      eventType: 'user.created',
      actorId: adminUserId,
      testStart,
    })
    expect(row, 'audit row for the admin user.created event must exist').not.toBeNull()
    expect(row?.actor_id).toBe(adminUserId)
    expect(row?.resource_id).toBe(victimUserId)
    // Sanity: actor and resource are genuinely distinct, so a swap would be visible.
    expect(adminUserId).not.toBe(victimUserId)
    // The admin acts within its own (egmont) org.
    expect(row?.organization_id).toBe(orgId)
  })
})
