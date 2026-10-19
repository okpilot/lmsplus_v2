/**
 * Red Team Spec: record_consent fired as a concurrent ToS + privacy pair (Vector IO, #1550)
 *
 * `recordConsent` (apps/web/app/consent/actions.ts) issues both `record_consent` calls in
 * one `Promise.all`. Each concurrent pair must land exactly one accepted row per document
 * type; a replayed pair (retry / double submit) must add none (mig 085 EXISTS guard).
 * user_consents fixtures are hard-deleted, as in user-consents-isolation.spec.ts.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { USER_CONSENTS_PAIR_VERSION as PAIR_VERSION } from './helpers/seed-consent'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed-users'

type Client = Awaited<ReturnType<typeof createAuthenticatedClient>>

const firePair = (client: Client) =>
  Promise.all(
    (['terms_of_service', 'privacy_policy'] as const).map((type) =>
      client.rpc('record_consent', {
        p_document_type: type,
        p_document_version: PAIR_VERSION,
        p_accepted: true,
        p_ip_address: '203.0.113.7',
        p_user_agent: 'redteam-IO',
      }),
    ),
  )

test.describe('Red Team: record_consent concurrent pair (Vector IO)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attackerClient: Client
  let attackerUserId: string

  const countByType = async () => {
    const { data, error } = await admin
      .from('user_consents')
      .select('document_type')
      .eq('user_id', attackerUserId)
      .eq('document_version', PAIR_VERSION)
      .eq('accepted', true)
    expect(error).toBeNull()
    const rows = Array.isArray(data) ? data : []
    return {
      tos: rows.filter((r) => r.document_type === 'terms_of_service').length,
      privacy: rows.filter((r) => r.document_type === 'privacy_policy').length,
    }
  }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    attackerUserId = seed.attackerUserId
    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
  })

  test.afterEach(async () => {
    const { data, error } = await admin
      .from('user_consents')
      .delete()
      .eq('user_id', attackerUserId)
      .eq('document_version', PAIR_VERSION)
      .select('id')
    if (error) throw new Error(`afterEach: ${error.message}`)
    if ((data?.length ?? 0) > 0) {
      console.log(`[consent-pair cleanup] removed ${data?.length} fixture row(s)`)
    }
  })

  test('Vector IO: a concurrent ToS + privacy pair records one row per type, and a replayed pair records none', async () => {
    expect(await countByType()).toEqual({ tos: 0, privacy: 0 })

    // Control arm: no prior acceptance, so the pair inserts.
    const first = await firePair(attackerClient)
    expect(first.map((r) => r.error)).toEqual([null, null])
    expect(await countByType()).toEqual({ tos: 1, privacy: 1 })

    // Replay: both acceptances already exist, so the pair is a no-op.
    const replay = await firePair(attackerClient)
    expect(replay.map((r) => r.error)).toEqual([null, null])
    expect(await countByType()).toEqual({ tos: 1, privacy: 1 })
  })
})
