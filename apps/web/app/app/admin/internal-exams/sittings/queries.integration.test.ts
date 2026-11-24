// App-layer integration tier (#925) — sittings admin reads against real local Postgres.
//
// listSittings / getSummary go through the list_exam_sittings / get_exam_sitting_summary RPCs;
// getSitting reads exam_sittings directly and resolves the invigilator via the service role.
// requireAdmin() reads the admin's org from the cookie jar (vitest.integration.setup.ts).
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
import { getSitting, getSummary, listInvigilatorOptions, listSittings } from './queries'
import { SITTINGS_PAGE_SIZE } from './types'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const password = 'test-pass-123'
const adminEmail = `int-sit-admin-${suffix}@test.local`
const DAY_MS = 24 * 60 * 60 * 1000
const UPCOMING_COUNT = SITTINGS_PAGE_SIZE + 1

let orgId: string
let adminId: string
let instructorId: string
let retiredInstructorId: string
let studentId: string
let refs: ReferenceIds
let openId: string
let closedId: string
let cancelledId: string
let summaryId: string
let retiredInvigilatorSittingId: string

function futureIso(days: number): string {
  const d = new Date(Date.now() + days * DAY_MS)
  d.setUTCHours(10, 0, 0, 0)
  return d.toISOString()
}

async function insertSittings(
  rows: ReadonlyArray<Record<string, unknown>>,
  invigilatorId = instructorId,
): Promise<string[]> {
  const { data, error } = await admin
    .from('exam_sittings')
    .insert(
      rows.map((r) => ({
        organization_id: orgId,
        mode: 'remote',
        invigilator_id: invigilatorId,
        created_by: adminId,
        ...r,
      })),
    )
    .select('id')
  if (error) throw new Error(`insertSittings: ${error.message}`)
  return (data ?? []).map((r) => r.id as string)
}

async function insertOne(row: Record<string, unknown>, invigilatorId = instructorId) {
  const [id] = await insertSittings([row], invigilatorId)
  if (!id) throw new Error('insertOne: no id')
  return id
}

describe('sittings reads (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `int-sit ${suffix}`, slug: `int-sit-${suffix}` })
    adminId = await createTestUser({ admin, orgId, email: adminEmail, password, role: 'admin' })
    instructorId = await createTestUser({
      admin,
      orgId,
      email: `int-sit-ins-${suffix}@test.local`,
      password,
      role: 'instructor',
      fullName: `Ivy Invigilator ${suffix}`,
    })
    retiredInstructorId = await createTestUser({
      admin,
      orgId,
      email: `int-sit-ret-${suffix}@test.local`,
      password,
      role: 'instructor',
      fullName: `Retired Rick ${suffix}`,
    })
    studentId = await createTestUser({
      admin,
      orgId,
      email: `int-sit-stu-${suffix}@test.local`,
      password,
      role: 'student',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `SIT_${suffix}`,
      subjectName: `Sitting Subject ${suffix}`,
      topicCode: `SIT_${suffix}_T1`,
      topicName: `Sitting Topic ${suffix}`,
    })

    const upcoming = Array.from({ length: UPCOMING_COUNT }, (_, i) => ({
      scheduled_at: futureIso(i + 2),
    }))
    const [firstUpcoming] = await insertSittings(upcoming)
    summaryId = firstUpcoming as string

    const now = new Date().toISOString()
    openId = await insertOne({ scheduled_at: now, started_at: now, started_by: adminId })
    const yesterday = new Date(Date.now() - DAY_MS).toISOString()
    closedId = await insertOne({
      scheduled_at: yesterday,
      started_at: yesterday,
      started_by: adminId,
      closed_at: now,
      closed_by: adminId,
    })
    cancelledId = await insertOne({
      scheduled_at: futureIso(1),
      deleted_at: now,
      deleted_by: adminId,
    })

    // One candidate and one entry without any exam code → entriesWithoutCode = 1.
    const { error: candErr } = await admin
      .from('exam_sitting_candidates')
      .insert({ organization_id: orgId, sitting_id: summaryId, user_id: studentId })
    if (candErr) throw new Error(`seed candidate: ${candErr.message}`)
    const { error: entryErr } = await admin.from('exam_sitting_entries').insert({
      organization_id: orgId,
      sitting_id: summaryId,
      user_id: studentId,
      subject_id: refs.subjectId,
    })
    if (entryErr) throw new Error(`seed entry: ${entryErr.message}`)

    retiredInvigilatorSittingId = await insertOne(
      { scheduled_at: futureIso(60) },
      retiredInstructorId,
    )
    const { error: retireErr } = await admin
      .from('users')
      .update({ deleted_at: now })
      .eq('id', retiredInstructorId)
    if (retireErr) throw new Error(`retire instructor: ${retireErr.message}`)
  })

  afterAll(async () => {
    const errors: string[] = []
    try {
      await cleanupTestData({
        admin,
        orgId,
        userIds: [adminId, instructorId, retiredInstructorId, studentId],
      })
    } catch (e) {
      errors.push(`cleanupTestData: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (errors.length === 0) {
      try {
        await cleanupReferenceData({ admin, refs: [refs] })
      } catch (e) {
        errors.push(`cleanupReferenceData: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  describe('listSittings', () => {
    it('lists only open sittings for the open scope', async () => {
      await signInAs(adminEmail, password)
      const result = await listSittings('open')
      expect(result.totalCount).toBe(1)
      expect(result.rows.map((r) => r.id)).toEqual([openId])
      expect(result.rows[0]?.status).toBe('open')
    })

    it('lists only closed sittings for the past scope', async () => {
      await signInAs(adminEmail, password)
      const result = await listSittings('past')
      expect(result.rows.map((r) => r.id)).toEqual([closedId])
      expect(result.rows[0]?.status).toBe('closed')
    })

    it('lists a cancelled sitting only under the cancelled scope', async () => {
      await signInAs(adminEmail, password)
      const cancelled = await listSittings('cancelled')
      const upcoming = await listSittings('upcoming')
      expect(cancelled.rows.map((r) => r.id)).toEqual([cancelledId])
      expect(upcoming.rows.map((r) => r.id)).not.toContain(cancelledId)
    })

    it('returns disjoint pages with a stable total when upcoming sittings exceed one page', async () => {
      await signInAs(adminEmail, password)
      const page1 = await listSittings('upcoming', 1)
      const page2 = await listSittings('upcoming', 2)
      // 51 seeded + the retired-invigilator sitting.
      const total = UPCOMING_COUNT + 1
      expect(page1.totalCount).toBe(total)
      expect(page2.totalCount).toBe(total)
      expect(page1.rows).toHaveLength(SITTINGS_PAGE_SIZE)
      expect(page2.rows).toHaveLength(total - SITTINGS_PAGE_SIZE)
      const ids = new Set(page1.rows.map((r) => r.id))
      expect(page2.rows.filter((r) => ids.has(r.id))).toHaveLength(0)
    })

    it('returns the last page when the requested page is past the end', async () => {
      await signInAs(adminEmail, password)
      const last = await listSittings('upcoming', 2)
      const snapped = await listSittings('upcoming', 99)
      expect(last.rows.length).toBeGreaterThan(0)
      expect(snapped.rows.map((r) => r.id)).toEqual(last.rows.map((r) => r.id))
      expect(snapped.totalCount).toBe(last.totalCount)
    })

    it('snaps an out-of-range page to the first page when only one page exists', async () => {
      await signInAs(adminEmail, password)
      const first = await listSittings('open', 1)
      const snapped = await listSittings('open', 5)
      expect(first.rows).toHaveLength(1)
      expect(snapped.rows.map((r) => r.id)).toEqual(first.rows.map((r) => r.id))
    })

    it('returns an empty list for an out-of-range page of an empty scope', async () => {
      await signInAs(adminEmail, password)
      // Non-vacuous: the scope has a row before the sitting is cancelled.
      const before = await listSittings('open', 1)
      expect(before.totalCount).toBeGreaterThan(0)
      const { error } = await admin
        .from('exam_sittings')
        .update({ deleted_at: new Date().toISOString(), deleted_by: adminId })
        .eq('id', openId)
      if (error) throw new Error(`cancel open: ${error.message}`)
      let emptied: Awaited<ReturnType<typeof listSittings>>
      try {
        emptied = await listSittings('open', 3)
      } finally {
        await admin
          .from('exam_sittings')
          .update({ deleted_at: null, deleted_by: null })
          .eq('id', openId)
      }
      expect(emptied).toEqual({ rows: [], totalCount: 0 })
    })

    it('reports the invigilator name and a false active flag for a deactivated invigilator', async () => {
      await signInAs(adminEmail, password)
      const result = await listSittings('upcoming', 2)
      const all = [...(await listSittings('upcoming', 1)).rows, ...result.rows]
      const row = all.find((r) => r.id === retiredInvigilatorSittingId)
      expect(row?.invigilatorName).toBe(`Retired Rick ${suffix}`)
      expect(row?.invigilatorActive).toBe(false)
      const live = all.find((r) => r.id === summaryId)
      expect(live?.invigilatorName).toBe(`Ivy Invigilator ${suffix}`)
      expect(live?.invigilatorActive).toBe(true)
    })

    it('counts entries and entries without a code per sitting', async () => {
      await signInAs(adminEmail, password)
      const all = [
        ...(await listSittings('upcoming', 1)).rows,
        ...(await listSittings('upcoming', 2)).rows,
      ]
      const row = all.find((r) => r.id === summaryId)
      expect(row?.candidates).toBe(1)
      expect(row?.entries).toBe(1)
      expect(row?.entriesWithoutCode).toBe(1)
    })

    it('reports zero candidates and entries for a sitting that has none', async () => {
      await signInAs(adminEmail, password)
      const row = (await listSittings('open')).rows.find((r) => r.id === openId)
      expect(row).toBeDefined()
      expect(row?.candidates).toBe(0)
      expect(row?.entries).toBe(0)
      expect(row?.entriesWithoutCode).toBe(0)
    })
  })

  describe('getSummary', () => {
    it('returns the summary counts including entries without a code', async () => {
      await signInAs(adminEmail, password)
      const s = await getSummary(summaryId)
      expect(s).not.toBeNull()
      expect(s?.status).toBe('scheduled')
      expect(s?.candidates).toBe(1)
      expect(s?.entries).toBe(1)
      expect(s?.codesIssued).toBe(0)
      expect(s?.entriesWithoutCode).toBe(1)
      expect(s?.dayEnded).toBe(false)
    })

    it('returns null for an unknown sitting', async () => {
      await signInAs(adminEmail, password)
      expect(await getSummary('00000000-0000-4000-8000-000000000000')).toBeNull()
    })
  })

  describe('getSitting', () => {
    it('resolves the invigilator name and active flag via the service role', async () => {
      await signInAs(adminEmail, password)
      const row = await getSitting(summaryId)
      expect(row?.invigilatorId).toBe(instructorId)
      expect(row?.invigilatorName).toBe(`Ivy Invigilator ${suffix}`)
      expect(row?.invigilatorActive).toBe(true)
      expect(row?.status).toBe('scheduled')
    })

    it('reports a deactivated invigilator as inactive but still named', async () => {
      await signInAs(adminEmail, password)
      const row = await getSitting(retiredInvigilatorSittingId)
      expect(row?.invigilatorName).toBe(`Retired Rick ${suffix}`)
      expect(row?.invigilatorActive).toBe(false)
    })

    it('reads a cancelled sitting', async () => {
      await signInAs(adminEmail, password)
      const row = await getSitting(cancelledId)
      expect(row?.id).toBe(cancelledId)
      expect(row?.status).toBe('cancelled')
    })

    it('returns null for an unknown sitting', async () => {
      await signInAs(adminEmail, password)
      expect(await getSitting('00000000-0000-4000-8000-000000000000')).toBeNull()
    })
  })

  describe('listInvigilatorOptions', () => {
    it('lists active admins and instructors only', async () => {
      await signInAs(adminEmail, password)
      const options = await listInvigilatorOptions()
      const ids = options.map((o) => o.id)
      expect(ids).toContain(adminId)
      expect(ids).toContain(instructorId)
      expect(ids).not.toContain(studentId)
      expect(ids).not.toContain(retiredInstructorId)
      expect(options.find((o) => o.id === instructorId)?.name).toBe(
        `Ivy Invigilator ${suffix} (instructor)`,
      )
    })
  })
})
