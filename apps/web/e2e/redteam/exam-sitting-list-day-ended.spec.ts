/**
 * Red Team Spec: list_exam_sittings day-ended effective status (Vector MW, #1777)
 *
 * Attack: egmont holds four day-ended open sittings and one day-ended scheduled sitting, more than
 * the lazy close sweeps per call (3), so some are listed through the effective-status path while
 * still stored open/scheduled. A cross-org admin pages every scope.
 * Expected: no egmont sitting in any cross-org page; their stored status is unchanged.
 * CONTROL: the egmont admin lists the four open ones under `past` as closed and auto-ended and the
 * scheduled one under `cancelled`, while at least two of the five are still stored unswept.
 *
 * Hermetic: sittings carry EXAM_SITTING_E2E_PREFIX; afterEach soft-deletes the tracked unclosed
 * sittings (cleanupSittingFixtures, per-step accumulator).
 */

import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import {
  cleanupSittingFixtures,
  insertEntry,
  insertMarkedSubject,
  insertSittingRow,
  type SittingTrack,
} from './helpers/exam-sitting-seed'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  seedCrossOrgAdmin,
  seedRedTeamAdmin,
} from './helpers/seed-users'

type Admin = ReturnType<typeof getAdminClient>
type Row = {
  id: string
  status: string
  closed_at: string | null
  ended_automatically: boolean
  candidates: number
  entries: number
  entries_without_code: number
  entries_finished: number
  entries_absent: number
  total_count: number
}

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

async function storedStatus(admin: Admin, ids: string[]): Promise<Map<string, string>> {
  const { data, error } = await admin.from('exam_sittings').select('id, status').in('id', ids)
  if (error || !data) throw new Error(`exam_sittings read: ${error?.message}`)
  return new Map(data.map((r) => [r.id as string, r.status as string]))
}

test.describe('Red Team: list_exam_sittings day-ended effective status (MW)', () => {
  let admin: Admin
  let egmontAdmin: SupabaseClient
  let crossAdmin: SupabaseClient
  let orgId: string
  let adminId: string
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const a = await seedRedTeamAdmin()
    const ca = await seedCrossOrgAdmin()
    orgId = a.orgId
    adminId = a.adminUserId
    track.adminId = adminId
    egmontAdmin = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    crossAdmin = await createAuthenticatedClient(ca.email, ca.password)
  })

  test.afterEach(async () => {
    await cleanupSittingFixtures(admin, track)
  })

  async function seedDayEnded(): Promise<{ openIds: string[]; scheduledId: string }> {
    const yesterday = new Date(Date.now() - 36 * 3600 * 1000)
    const openIds: string[] = []
    for (let i = 0; i < 4; i++) {
      const id = await insertSittingRow(admin, { orgId, adminId, scheduledAt: yesterday })
      track.sittingIds.push(id)
      const { error } = await admin
        .from('exam_sittings')
        .update({ started_at: yesterday.toISOString(), started_by: adminId })
        .eq('id', id)
      if (error) throw new Error(`start ${id}: ${error.message}`)
      openIds.push(id)
    }
    const scheduledId = await insertSittingRow(admin, { orgId, adminId, scheduledAt: yesterday })
    track.sittingIds.push(scheduledId)
    const st = await storedStatus(admin, [...openIds, scheduledId])
    for (const id of openIds) expect(st.get(id), `seed ${id}`).toBe('open')
    expect(st.get(scheduledId)).toBe('scheduled')
    return { openIds, scheduledId }
  }

  test('MW: cross-org admin pages no unswept day-ended egmont sitting in any scope', async () => {
    const { openIds, scheduledId } = await seedDayEnded()
    const egmont = [...openIds, scheduledId]
    for (const scope of SCOPES) {
      const ids = (await listAll(crossAdmin, scope)).map((r) => r.id)
      for (const id of egmont) expect(ids, `${scope} ${id}`).not.toContain(id)
    }
    const st = await storedStatus(admin, egmont)
    for (const id of openIds) expect(st.get(id), `stored ${id}`).toBe('open')
    expect(st.get(scheduledId)).toBe('scheduled')
  })

  test('MW: egmont admin lists unswept day-ended sittings by effective status (control)', async () => {
    const { openIds, scheduledId } = await seedDayEnded()
    const egmont = [...openIds, scheduledId]
    const subjectId = await insertMarkedSubject(admin)
    track.subjectIds.push(subjectId)
    const entryOpenId = openIds[0] as string
    await insertEntry(admin, { orgId, sittingId: entryOpenId, userId: adminId, subjectId })
    // One list call sweeps at most 3 sittings, so at least two of the five stay unswept after it.
    const first = await egmontAdmin.rpc('list_exam_sittings', {
      p_scope: 'past',
      p_limit: PAGE,
      p_offset: 0,
    })
    if (first.error) throw new Error(`list_exam_sittings past: ${first.error.message}`)
    const st = await storedStatus(admin, egmont)
    const past = await listAll(egmontAdmin, 'past')
    const unswept = egmont.filter((id) => ['open', 'scheduled'].includes(st.get(id) ?? ''))
    expect(unswept.length, 'unswept after one call').toBeGreaterThanOrEqual(2)
    for (const id of openIds) {
      const hit = past.filter((r) => r.id === id)
      expect(hit, `past ${id}`).toHaveLength(1)
      expect(hit[0]?.status).toBe('closed')
      expect(hit[0]?.ended_automatically).toBe(true)
      expect(hit[0]?.closed_at).not.toBeNull()
    }
    const withEntry = past.find((r) => r.id === entryOpenId)
    expect(withEntry).toMatchObject({
      candidates: 0,
      entries: 1,
      entries_without_code: 1,
      entries_finished: 0,
      entries_absent: 1,
      total_count: past.length,
    })
    for (const id of openIds.filter((i) => i !== entryOpenId)) {
      expect(past.find((r) => r.id === id)).toMatchObject({ entries: 0, entries_absent: 0 })
    }
    expect(past.map((r) => r.id)).not.toContain(scheduledId)
    const cancelled = await listAll(egmontAdmin, 'cancelled')
    expect(cancelled.filter((r) => r.id === scheduledId).map((r) => r.status)).toEqual([
      'cancelled',
    ])
    for (const scope of ['upcoming', 'open'] as const) {
      const ids = (await listAll(egmontAdmin, scope)).map((r) => r.id)
      for (const id of egmont) expect(ids, `${scope} ${id}`).not.toContain(id)
    }
  })
})
