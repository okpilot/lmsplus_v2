/**
 * Red Team Spec: list_exam_sittings four scopes (Vector MQ, #1777)
 *
 * Attack: a cross-org admin pages every scope (upcoming, open, past, cancelled); a student and an
 * instructor call the new scopes; an admin passes scope strings outside the closed set.
 * Expected: no egmont sitting in any cross-org page; `not_admin`; `invalid_input`.
 * CONTROL: the egmont admin sees its scheduled, open, closed and cancelled sittings each in exactly
 * one scope; the cross-org admin sees its own sitting of each status in that status's scope.
 *
 * Hermetic: afterAll soft-deletes the tracked unclosed sittings (cleanupSittingFixtures, per-step
 * accumulator).
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
type Row = {
  id: string
  scheduled_at: string
  mode: string
  status: string
  invigilator_id: string
  invigilator_name: string
  invigilator_active: boolean
  permitted_materials: string | null
  started_at: string | null
  closed_at: string | null
  candidates: number
  entries: number
  entries_without_code: number
  entries_finished: number
  entries_absent: number
  ended_automatically: boolean
  total_count: number
}

const SCOPES = ['upcoming', 'open', 'past', 'cancelled'] as const
const PAGE = 200

// Wire type of every Row field; a trailing '?' allows null.
const ROW_SHAPE: Record<keyof Row, string> = {
  id: 'string',
  scheduled_at: 'string',
  mode: 'string',
  status: 'string',
  invigilator_id: 'string',
  invigilator_name: 'string',
  invigilator_active: 'boolean',
  permitted_materials: 'string?',
  started_at: 'string?',
  closed_at: 'string?',
  candidates: 'number',
  entries: 'number',
  entries_without_code: 'number',
  entries_finished: 'number',
  entries_absent: 'number',
  ended_automatically: 'boolean',
  total_count: 'number',
}

function isRow(r: unknown): r is Row {
  if (typeof r !== 'object' || r === null) return false
  const row = r as Record<string, unknown>
  return Object.entries(ROW_SHAPE).every(([key, spec]) => {
    const v = row[key]
    if (spec.endsWith('?') && v === null) return true
    return typeof v === spec.replace('?', '')
  })
}

async function listAll(client: SupabaseClient, scope: string): Promise<Row[]> {
  const rows: Row[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await client.rpc('list_exam_sittings', {
      p_scope: scope,
      p_limit: PAGE,
      p_offset: offset,
    })
    if (error) throw new Error(`list_exam_sittings ${scope}: ${error.message}`)
    if (!Array.isArray(data)) throw new Error(`list_exam_sittings ${scope}: non-array page`)
    const page: Row[] = []
    for (const r of data as unknown[]) {
      if (!isRow(r) || r.id === '') throw new Error(`list_exam_sittings ${scope}: malformed row`)
      page.push(r)
    }
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
  let closedId: string
  let adminUserId: string
  let crossSittingId: string
  let crossOpenId: string
  let crossClosedId: string
  let crossCancelledId: string
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }

  test.beforeAll(async () => {
    admin = getAdminClient()
    await seedRedTeamUsers()
    const a = await seedRedTeamAdmin()
    const ins = await seedRedTeamInstructor()
    const cross = await seedCrossOrgAdmin()
    track.adminId = a.adminUserId
    adminUserId = a.adminUserId

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
    closedId = await createSittingRpc(egmontAdmin, a.adminUserId)
    track.sittingIds.push(closedId)
    const st2 = await egmontAdmin.rpc('start_exam_sitting', { p_sitting_id: closedId })
    if (st2.error) throw new Error(`start closed: ${st2.error.message}`)
    const cl = await egmontAdmin.rpc('close_exam_sitting', { p_sitting_id: closedId })
    if (cl.error) throw new Error(`close: ${cl.error.message}`)
    crossSittingId = await createSittingRpc(crossAdmin, cross.adminUserId)
    track.sittingIds.push(crossSittingId)
    crossOpenId = await createSittingRpc(crossAdmin, cross.adminUserId)
    track.sittingIds.push(crossOpenId)
    const xst = await crossAdmin.rpc('start_exam_sitting', { p_sitting_id: crossOpenId })
    if (xst.error) throw new Error(`cross start: ${xst.error.message}`)
    crossClosedId = await createSittingRpc(crossAdmin, cross.adminUserId)
    track.sittingIds.push(crossClosedId)
    const xst2 = await crossAdmin.rpc('start_exam_sitting', { p_sitting_id: crossClosedId })
    if (xst2.error) throw new Error(`cross start closed: ${xst2.error.message}`)
    const xcl = await crossAdmin.rpc('close_exam_sitting', { p_sitting_id: crossClosedId })
    if (xcl.error) throw new Error(`cross close: ${xcl.error.message}`)
    crossCancelledId = await createSittingRpc(crossAdmin, cross.adminUserId)
    track.sittingIds.push(crossCancelledId)
    const xcn = await crossAdmin.rpc('cancel_exam_sitting', { p_sitting_id: crossCancelledId })
    if (xcn.error) throw new Error(`cross cancel: ${xcn.error.message}`)
  })

  test.afterAll(async () => {
    await cleanupSittingFixtures(admin, track)
  })

  test('MQ: cross-org admin pages no egmont sitting in any scope', async () => {
    const egmont = [scheduledId, openId, cancelledId, closedId]
    const own: Record<(typeof SCOPES)[number], string> = {
      upcoming: crossSittingId,
      open: crossOpenId,
      past: crossClosedId,
      cancelled: crossCancelledId,
    }
    for (const scope of SCOPES) {
      const ids = (await listAll(crossAdmin, scope)).map((r) => r.id)
      // CONTROL: the cross-org admin sees its own fixture for this scope.
      expect(ids, `${scope} own fixture`).toContain(own[scope])
      for (const id of egmont) expect(ids, `${scope} ${id}`).not.toContain(id)
    }
  })

  test('MQ: each egmont sitting appears in exactly its own scope (control)', async () => {
    const expected: Record<string, (typeof SCOPES)[number]> = {
      [scheduledId]: 'upcoming',
      [openId]: 'open',
      [cancelledId]: 'cancelled',
      [closedId]: 'past',
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
    expect([...statusOf('past')]).toEqual(['closed'])
    // Full output contract of the scheduled fixture.
    const sched = (byScope.get('upcoming') ?? []).find((r) => r.id === scheduledId)
    expect(Object.keys(sched ?? {}).sort()).toEqual(
      [
        'id',
        'scheduled_at',
        'mode',
        'status',
        'invigilator_id',
        'invigilator_name',
        'invigilator_active',
        'permitted_materials',
        'started_at',
        'closed_at',
        'candidates',
        'entries',
        'entries_without_code',
        'entries_finished',
        'entries_absent',
        'ended_automatically',
        'total_count',
      ].sort(),
    )
    expect(sched).toMatchObject({
      id: scheduledId,
      status: 'scheduled',
      invigilator_id: adminUserId,
      invigilator_active: true,
      started_at: null,
      closed_at: null,
      candidates: 0,
      entries: 0,
      entries_without_code: 0,
      entries_finished: 0,
      entries_absent: 0,
      ended_automatically: false,
    })
    expect(sched?.mode).toBe('remote')
    expect(Number.isNaN(Date.parse(sched?.scheduled_at ?? ''))).toBe(false)
    expect(sched?.invigilator_name.length).toBeGreaterThan(0)
    expect(sched?.invigilator_name).not.toBe('Unknown')
    expect(typeof sched?.permitted_materials).toBe('string')
    expect(sched?.total_count).toBe((byScope.get('upcoming') ?? []).length)
    expect(sched?.total_count).toBeGreaterThanOrEqual(1)
    for (const scope of SCOPES) {
      const ids = (byScope.get(scope) ?? []).map((r) => r.id)
      for (const id of [crossSittingId, crossOpenId, crossClosedId, crossCancelledId]) {
        expect(ids, `cross-org ${id} in egmont ${scope}`).not.toContain(id)
      }
    }
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
