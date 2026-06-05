/**
 * Red Team Spec: user_consents Isolation (GDPR consent gate, #384)
 *
 * Vector X (MEDIUM): a user probes user_consents for another user's user_id, trying to
 *   read their consent records. RLS `user_consents_select_own USING (user_id = auth.uid())`
 *   must scope every read to the caller → 0 rows for a foreign user_id.
 * Vector Y (MEDIUM): a user calls `.from('user_consents').insert(...)` directly via
 *   PostgREST, bypassing the `record_consent()` RPC. RLS
 *   `user_consents_no_direct_insert WITH CHECK (false)` must reject every client insert.
 *
 * (Vectors V "forged __consent cookie" and Z "cookie injected without completing the flow"
 *  are proxy/browser-gate concerns — see apps/web/proxy.ts — and require a page-navigation
 *  Playwright test, not this API-level harness. They remain open on #384.)
 *
 * Status: Expected to PASS (defenses should hold). A failing assertion means the exploit works.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed'

const SEED_VERSION = 'redteam-x-1.0'
const SELF_VERSION = 'redteam-x-self'
const FORGED_VERSION = 'redteam-y-forged'

test.describe('Red Team: user_consents Isolation', () => {
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let adminClient: ReturnType<typeof getAdminClient>
  let attackerUserId: string
  let victimUserId: string
  let seededConsentId: string | null = null

  test.beforeAll(async () => {
    const seed = await seedRedTeamUsers()
    attackerUserId = seed.attackerUserId
    victimUserId = seed.victimUserId
    adminClient = getAdminClient()
    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)

    // Non-vacuity seed: the victim HAS a consent record. The service role bypasses the
    // WITH CHECK(false) insert policy. Without this row, Vector X's "attacker sees 0"
    // would pass vacuously (absence of data, not RLS enforcement).
    const { data, error } = await adminClient
      .from('user_consents')
      .insert({
        user_id: victimUserId,
        document_type: 'terms_of_service',
        document_version: SEED_VERSION,
        accepted: true,
      })
      .select('id')
      .single<{ id: string }>()
    expect(error).toBeNull()
    seededConsentId = data?.id ?? null
    expect(seededConsentId).not.toBeNull()

    // Positive-control seed: the attacker has their OWN consent record. This lets the
    // positive-control test below prove the RLS policy SCOPES reads to the owner (returns
    // the caller's own rows) rather than blocking every read — a block-all policy would
    // also pass Vector X vacuously.
    const { error: selfErr } = await adminClient.from('user_consents').insert({
      user_id: attackerUserId,
      document_type: 'privacy_policy',
      document_version: SELF_VERSION,
      accepted: true,
    })
    expect(selfErr).toBeNull()
  })

  test.afterAll(async () => {
    // Hard-delete the seeded victim row (service role bypasses the no-delete RLS) so the
    // table stays hermetic for downstream specs. Also sweep any forged row in case a
    // future regression let Vector Y through.
    const { data, error } = await adminClient
      .from('user_consents')
      .delete()
      .in('document_version', [SEED_VERSION, SELF_VERSION, FORGED_VERSION])
      .select('id')
    if (error) {
      // Surface the hermiticity breach to Playwright's report — a stranded fixture row
      // poisons downstream specs, so a silent stdout log is not enough.
      console.error('[user-consents cleanup] delete failed:', error.message)
      throw new Error(`user-consents cleanup failed: ${error.message}`)
    }
    if ((data?.length ?? 0) > 0) {
      console.log(`[user-consents cleanup] removed ${data?.length} fixture row(s)`)
    }
  })

  test('Vector X (#384): a user cannot read another user consent records via a user_id probe', async () => {
    // Non-vacuity: admin confirms the victim actually has the seeded consent row.
    const { data: adminRows, error: adminErr } = await adminClient
      .from('user_consents')
      .select('id')
      .eq('user_id', victimUserId)
      .eq('document_version', SEED_VERSION)
    expect(adminErr).toBeNull()
    expect(adminRows?.length ?? 0).toBeGreaterThan(0)

    // Attacker (a different authenticated user) probes the victim's user_id directly.
    // RLS user_consents_select_own USING (user_id = auth.uid()) scopes to the caller → 0 rows.
    const { data, error } = await attackerClient
      .from('user_consents')
      .select('id, document_type, accepted')
      .eq('user_id', victimUserId)
    expect(error).toBeNull()
    expect(Array.isArray(data) ? data.length : -1).toBe(0)
  })

  test("positive control: a user reads their OWN consent records but never another user's", async () => {
    // Proves user_consents_select_own SCOPES reads to the owner rather than blocking all
    // reads — a block-everything policy would also pass Vector X above (attacker sees 0),
    // so this control is what makes the isolation proof meaningful.
    const { data, error } = await attackerClient
      .from('user_consents')
      .select('id, user_id, document_version')
    expect(error).toBeNull()
    const rows = (Array.isArray(data) ? data : []) as Array<{ user_id: string; document_version: string }>
    expect(rows.length).toBeGreaterThan(0)
    // Every visible row belongs to the caller…
    expect(rows.every((r) => r.user_id === attackerUserId)).toBe(true)
    // …the attacker's own seeded row is visible…
    expect(rows.some((r) => r.document_version === SELF_VERSION)).toBe(true)
    // …and the victim's row is not.
    expect(rows.some((r) => r.document_version === SEED_VERSION)).toBe(false)
  })

  test('Vector Y (#384): a user cannot directly INSERT into user_consents, bypassing record_consent', async () => {
    // RLS user_consents_no_direct_insert WITH CHECK (false) blocks every client insert —
    // even for the caller's OWN user_id — so consent can only be recorded via record_consent().
    const { error } = await attackerClient.from('user_consents').insert({
      user_id: attackerUserId,
      document_type: 'terms_of_service',
      document_version: FORGED_VERSION,
      accepted: true,
    })
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501') // RLS WITH CHECK violation

    // Belt-and-suspenders: confirm no forged row actually landed (service-role read).
    const { data: forged, error: checkErr } = await adminClient
      .from('user_consents')
      .select('id')
      .eq('user_id', attackerUserId)
      .eq('document_version', FORGED_VERSION)
    expect(checkErr).toBeNull()
    expect(forged?.length ?? -1).toBe(0)
  })
})
