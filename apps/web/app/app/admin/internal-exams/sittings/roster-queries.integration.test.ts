// App-layer integration tier (#925) — sitting roster reads (list_exam_sitting_roster,
// list_exam_sitting_removed_entries, get_exam_sitting_summary) against real local Postgres.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupReferenceData,
  cleanupTestData,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
  type ReferenceIds,
  seedReferenceData,
  signInAs,
} from '@/lib/integration-support/harness'
import { getSummary } from './queries'
import { getRemoved, getRoster, getRosterAll } from './roster-queries'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const password = 'test-pass-123'
const adminEmail = `int-ros-admin-${suffix}@test.local`
const BULK = 250

let orgId: string
let adminId: string
let instructorId: string
let refs: ReferenceIds
let sittingId: string
let cancelledId: string
const userIds: string[] = []
let otherOrgId: string
let otherAdminId: string
const otherAdminEmail = `int-ros-other-${suffix}@test.local`

async function seedSitting(extra: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await admin
    .from('exam_sittings')
    .insert({
      organization_id: orgId,
      mode: 'remote',
      invigilator_id: instructorId,
      created_by: adminId,
      scheduled_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      ...extra,
    })
    .select('id')
    .single()
  if (error) throw new Error(`seedSitting: ${error.message}`)
  return data.id as string
}

describe('roster reads (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `int-ros ${suffix}`, slug: `int-ros-${suffix}` })
    otherOrgId = await createTestOrg({
      admin,
      name: `int-ros-b ${suffix}`,
      slug: `int-ros-b-${suffix}`,
    })
    adminId = await createTestUser({ admin, orgId, email: adminEmail, password, role: 'admin' })
    otherAdminId = await createTestUser({
      admin,
      orgId: otherOrgId,
      email: otherAdminEmail,
      password,
      role: 'admin',
    })
    instructorId = await createTestUser({
      admin,
      orgId,
      email: `int-ros-ins-${suffix}@test.local`,
      password,
      role: 'instructor',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `ROS_${suffix}`,
      subjectName: `Roster Subject ${suffix}`,
      topicCode: `ROS_${suffix}_T1`,
      topicName: `Roster Topic ${suffix}`,
    })
    sittingId = await seedSitting()
    cancelledId = await seedSitting({
      deleted_at: new Date().toISOString(),
      deleted_by: adminId,
    })
    for (let start = 0; start < BULK; start += 25) {
      const batch = await Promise.all(
        Array.from({ length: Math.min(25, BULK - start) }, (_, k) => {
          const i = start + k
          return createTestUser({
            admin,
            orgId,
            email: `int-ros-s${String(i).padStart(3, '0')}-${suffix}@test.local`,
            password,
            role: 'student',
            fullName: `Roster Student ${String(i).padStart(3, '0')} ${suffix}`,
          })
        }),
      )
      userIds.push(...batch)
    }
    const { error: candErr } = await admin
      .from('exam_sitting_candidates')
      .insert(userIds.map((id) => ({ organization_id: orgId, sitting_id: sittingId, user_id: id })))
    if (candErr) throw new Error(`seed candidates: ${candErr.message}`)
    const { error: entryErr } = await admin.from('exam_sitting_entries').insert({
      organization_id: orgId,
      sitting_id: sittingId,
      user_id: userIds[0],
      subject_id: refs.subjectId,
    })
    if (entryErr) throw new Error(`seed entry: ${entryErr.message}`)
  }, 180_000)

  afterAll(async () => {
    try {
      await cleanupTestData({
        admin,
        orgId,
        userIds: [adminId, instructorId, ...userIds],
      })
      await cleanupTestData({ admin, orgId: otherOrgId, userIds: [otherAdminId] })
      await cleanupReferenceData({ admin, refs: [refs] })
    } catch (e) {
      throw new Error(`afterAll: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, 180_000)

  describe('getRoster', () => {
    it('lists a person without entries, sorted by name, 50 per page, with the filtered total', async () => {
      await signInAs(adminEmail, password)
      const r = await getRoster({ sittingId, page: 1 })
      expect(r?.total).toBe(BULK)
      expect(r?.rows).toHaveLength(50)
      expect(r?.rows[1]?.entries).toEqual([])
      const names = r?.rows.map((x) => x.name) ?? []
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    })

    it('shows the entry of the first person with status no_code and no code', async () => {
      await signInAs(adminEmail, password)
      const r = await getRoster({ sittingId, page: 1 })
      const first = r?.rows.find((x) => x.userId === userIds[0])
      expect(first?.entries[0]).toMatchObject({ status: 'no_code', code: null })
    })

    it('filters by q and by Show needs_code', async () => {
      await signInAs(adminEmail, password)
      const q = await getRoster({ sittingId, q: 'Student 007', page: 1 })
      expect(q?.total).toBe(1)
      const needs = await getRoster({ sittingId, show: 'needs_code', page: 1 })
      expect(needs?.rows.map((x) => x.userId)).toEqual([userIds[0]])
      const attempts = await getRoster({ sittingId, show: 'attempts', page: 1 })
      expect(attempts?.total).toBe(0)
    })

    it('snaps a page past the end to the last page', async () => {
      await signInAs(adminEmail, password)
      const r = await getRoster({ sittingId, page: 99 })
      expect(r?.rows).toHaveLength(50)
      expect(r?.total).toBe(BULK)
    })

    it('reads a cancelled sitting', async () => {
      await signInAs(adminEmail, password)
      expect(await getRoster({ sittingId: cancelledId, page: 1 })).toEqual({ rows: [], total: 0 })
    })

    it('returns null for a sitting of another organization', async () => {
      await signInAs(otherAdminEmail, password)
      expect(await getRoster({ sittingId, page: 1 })).toBeNull()
    })
  })

  describe('getRosterAll', () => {
    it('merges three pages of 100 without duplicates', async () => {
      await signInAs(adminEmail, password)
      const rows = await getRosterAll(sittingId)
      expect(rows).toHaveLength(BULK)
      expect(new Set(rows.map((r) => r.userId)).size).toBe(BULK)
    })
  })

  describe('getRemoved', () => {
    it('lists a prune-removed entry with notice not sent', async () => {
      const { error } = await admin.from('audit_events').insert({
        organization_id: orgId,
        resource_id: sittingId,
        resource_type: 'exam_sitting',
        event_type: 'exam_sitting.entry_auto_removed',
        actor_role: 'admin',
        actor_id: adminId,
        metadata: {
          entry_id: crypto.randomUUID(),
          user_id: userIds[1],
          subject_id: refs.subjectId,
          passed_at: new Date().toISOString(),
        },
      })
      expect(error).toBeNull()
      await signInAs(adminEmail, password)
      const r = await getRemoved(sittingId)
      expect(r?.total).toBe(1)
      expect(r?.rows[0]).toMatchObject({ noticeSent: false })
    })

    it('reads a cancelled sitting', async () => {
      await signInAs(adminEmail, password)
      expect(await getRemoved(cancelledId)).toEqual({ rows: [], total: 0 })
    })

    it('returns null for a sitting of another organization', async () => {
      await signInAs(otherAdminEmail, password)
      expect(await getRemoved(sittingId)).toBeNull()
    })
  })

  describe('getSummary people counts', () => {
    it('counts pending removal notices, deactivated candidates and entries with an attempt', async () => {
      await admin
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', userIds[2])
      await signInAs(adminEmail, password)
      const s = await getSummary(sittingId)
      expect(s).toMatchObject({
        pendingRemovalNotices: 1,
        deactivatedCandidates: 1,
        entriesWithAttempt: 0,
      })
    })
  })
})
