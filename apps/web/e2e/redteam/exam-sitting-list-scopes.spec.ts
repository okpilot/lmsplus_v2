/**
 * Red Team Spec: list_exam_sittings four scopes (Vector MQ, #1777)
 *
 * Attack: a cross-org admin pages every scope (upcoming, open, past, cancelled); a student and an
 * instructor call the new scopes; an admin passes scope strings outside the closed set.
 * Expected: no egmont sitting in any cross-org page; `not_admin`; `invalid_input`.
 * CONTROL: the egmont admin sees its scheduled, open and cancelled sittings each in exactly one
 * scope; the cross-org admin sees its own sitting under `upcoming`.
 *
 * Hermetic: sittings carry EXAM_SITTING_E2E_PREFIX; afterAll soft-deletes the tracked ones
 * (cleanupSittingFixtures, per-step accumulator).
 */

import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import {
  cleanupSittingFixtures,
  createSittingRpc,
  type SittingTrack,
} from './helpers/exam-sitting-seed'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedCrossOrgAdmin,
  seedRedTeamAdmin,
  seedRedTeamInstructor,
  seedRedTeamUsers,
} from './helpers/seed-users'

type Admin = ReturnType<typeof getAdminClient>
type Row = { id: string; status: string; total_count: number }

const SCOPES = ['upcoming', 'open', 'past', 'cancelled'] as const
const PAGE = 200

async function listAll(client: SupabaseClient, scope: string): Promise<Row[]> {
  const rows: Row[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await client.rpc('list_exam_sittings', {
      p_scope: scope,
      p_limit: PAGE,
      p_offset: offset,
    })
    if (error) throw new Error(`list_exam_sittings ${scope}: ${error.message}`)
    const page = (data ?? []) as Row[]
    rows.push(...page)
    if (page.length < PAGE) return rows
  }
}

test.describe('Red Team: list_exam_sittings scopes (MQ)', () => {
  let admin: Admin
  let egmontAdmin: SupabaseClient
  let crossAdmin: SupabaseClient
  let student: SupabaseClient
  let instructor: SupabaseClient
  let scheduledId: string
  let openId: string
  let cancelledId: string
  let crossSittingId: string
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }

  test.beforeAll(async () => {
    admin = getAdminClient()
    await seedRedTeamUsers()
    const a = await seedRedTeamAdmin()
    const ins = await seedRedTeamInstructor()
    const cross = await seedCrossOrgAdmin()
    track.adminId = a.adminUserId

    egmontAdmin = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    crossAdmin = await createAuthenticatedClient(cross.email, cross.password)
    student = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    instructor = await createAuthenticatedClient(ins.email, ins.password)

    scheduledId = await createSittingRpc(egmontAdmin, a.adminUserId)
    track.sittingIds.push(scheduledId)
    openId = await createSittingRpc(egmontAdmin, a.adminUserId)
    track.sittingIds.push(openId)
    const st = await egmontAdmin.rpc('start_exam_sitting', { p_sitting_id: openId })
    if (st.error) throw new Error(`start: ${st.error.message}`)
    cancelledId = await createSittingRpc(egmontAdmin, a.adminUserId)
    track.sittingIds.push(cancelledId)
    const cn = await egmontAdmin.rpc('cancel_exam_sitting', { p_sitting_id: cancelledId })
    if (cn.error) throw new Error(`cancel: ${cn.error.message}`)
    crossSittingId = await createSittingRpc(crossAdmin, cross.adminUserId)
    track.sittingIds.push(crossSittingId)
  })

  test.afterAll(async () => {
    await cleanupSittingFixtures(admin, track)
  })

  test('MQ: cross-org admin pages no egmont sitting in any scope', async () => {
    const egmont = [scheduledId, openId, cancelledId]
    for (const scope of SCOPES) {
      const ids = (await listAll(crossAdmin, scope)).map((r) => r.id)
      for (const id of egmont) expect(ids, `${scope} ${id}`).not.toContain(id)
    }
    // CONTROL: the cross-org admin's own scheduled sitting is listed.
    expect((await listAll(crossAdmin, 'upcoming')).map((r) => r.id)).toContain(crossSittingId)
  })

  test('MQ: each egmont sitting appears in exactly its own scope (control)', async () => {
    const expected: Record<string, (typeof SCOPES)[number]> = {
      [scheduledId]: 'upcoming',
      [openId]: 'open',
      [cancelledId]: 'cancelled',
    }
    const byScope = new Map<string, Row[]>()
    for (const scope of SCOPES) byScope.set(scope, await listAll(egmontAdmin, scope))
    for (const [id, scope] of Object.entries(expected)) {
      for (const s of SCOPES) {
        const hits = (byScope.get(s) ?? []).filter((r) => r.id === id)
        expect(hits, `${id} in ${s}`).toHaveLength(s === scope ? 1 : 0)
      }
    }
    const statusOf = (scope: string) => new Set((byScope.get(scope) ?? []).map((r) => r.status))
    expect([...statusOf('upcoming')]).toEqual(['scheduled'])
    expect([...statusOf('open')]).toEqual(['open'])
    expect([...statusOf('cancelled')]).toEqual(['cancelled'])
    for (const s of statusOf('past')) expect(s).toBe('closed')
    expect(
      (byScope.get('cancelled') ?? []).map((r) => r.id),
      'cross-org sitting in egmont cancelled scope',
    ).not.toContain(crossSittingId)
  })

  test('MQ: student and instructor are refused on every scope', async () => {
    for (const [who, client] of [
      ['student', student],
      ['instructor', instructor],
    ] as const) {
      for (const scope of SCOPES) {
        const { data, error } = await client.rpc('list_exam_sittings', { p_scope: scope })
        expect(error?.message ?? `${who} ${scope}: no error`, `${who} ${scope}`).toMatch(
          /not_admin/,
        )
        expect(data).toBeNull()
      }
    }
  })

  test('MQ: scope strings outside the closed set are rejected', async () => {
    for (const scope of ['scheduled', 'closed', 'all', 'OPEN', 'open ', '', "open' OR '1'='1"]) {
      const { error } = await egmontAdmin.rpc('list_exam_sittings', { p_scope: scope })
      expect(error?.message ?? `${JSON.stringify(scope)}: no error`, scope).toMatch(/invalid_input/)
    }
    // CONTROL: a valid scope succeeds for the same caller.
    const { error } = await egmontAdmin.rpc('list_exam_sittings', { p_scope: 'open' })
    expect(error).toBeNull()
  })
})
