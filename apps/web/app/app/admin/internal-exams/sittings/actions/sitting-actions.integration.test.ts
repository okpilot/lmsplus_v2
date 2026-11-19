// App-layer integration tier (#925) — sitting lifecycle Server Actions against real local Postgres.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupTestData,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
  signInAs,
} from '@/lib/integration-support/harness'
import { cancelSitting } from './cancel-sitting'
import { closeSitting } from './close-sitting'
import { createSitting } from './create-sitting'
import { startSitting } from './start-sitting'
import { updateSitting } from './update-sitting'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const password = 'test-pass-123'
const adminEmail = `int-sitact-admin-${suffix}@test.local`
const studentEmail = `int-sitact-stu-${suffix}@test.local`

let orgId: string
let adminId: string
let instructorId: string
let studentId: string

async function readSitting(id: string) {
  const { data, error } = await admin
    .from('exam_sittings')
    .select('status, mode, invigilator_id')
    .eq('id', id)
    .single()
  if (error) throw new Error(`readSitting: ${error.message}`)
  return data
}

async function countSittings(): Promise<number> {
  const { count, error } = await admin
    .from('exam_sittings')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
  if (error) throw new Error(`countSittings: ${error.message}`)
  return count ?? 0
}

function todayIso(): string {
  return new Date().toISOString()
}

async function createToday(): Promise<string> {
  const created = await createSitting({
    scheduledAt: todayIso(),
    mode: 'remote',
    invigilatorId: instructorId,
  })
  if (!created.success) throw new Error(`createSitting: ${created.error}`)
  return created.sittingId
}

describe('sitting Server Actions (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `int-sitact ${suffix}`,
      slug: `int-sitact-${suffix}`,
    })
    adminId = await createTestUser({ admin, orgId, email: adminEmail, password, role: 'admin' })
    instructorId = await createTestUser({
      admin,
      orgId,
      email: `int-sitact-ins-${suffix}@test.local`,
      password,
      role: 'instructor',
    })
    studentId = await createTestUser({
      admin,
      orgId,
      email: studentEmail,
      password,
      role: 'student',
    })
  })

  afterAll(async () => {
    try {
      await cleanupTestData({ admin, orgId, userIds: [adminId, instructorId, studentId] })
    } catch (e) {
      throw new Error(`afterAll: ${e instanceof Error ? e.message : String(e)}`)
    }
  })

  it('runs a sitting through create, change-only update, start and close', async () => {
    await signInAs(adminEmail, password)
    const id = await createToday()
    expect(await readSitting(id)).toMatchObject({
      status: 'scheduled',
      mode: 'remote',
      invigilator_id: instructorId,
    })

    const unchanged = await updateSitting({ sittingId: id, mode: 'remote' })
    expect(unchanged).toEqual({ success: true, changed: false, notices: { sent: 0, failed: [] } })

    const changed = await updateSitting({ sittingId: id, mode: 'in_person' })
    expect(changed).toEqual({ success: true, changed: true, notices: { sent: 0, failed: [] } })
    expect((await readSitting(id)).mode).toBe('in_person')

    const started = await startSitting({ sittingId: id })
    expect(started).toEqual({
      success: true,
      codesRestamped: 0,
      invigilatorActive: true,
      entriesWithoutCode: 0,
    })
    expect((await readSitting(id)).status).toBe('open')

    const closed = await closeSitting({ sittingId: id })
    expect(closed).toEqual({ success: true, codesVoided: 0, attemptsRunning: 0, absentCount: 0 })
    expect((await readSitting(id)).status).toBe('closed')
  })

  it('refuses to edit the time or mode of an open sitting', async () => {
    await signInAs(adminEmail, password)
    const id = await createToday()
    const started = await startSitting({ sittingId: id })
    expect(started.success).toBe(true)

    const result = await updateSitting({ sittingId: id, mode: 'in_person' })

    expect(result).toEqual({
      success: false,
      error: 'Time and mode cannot be changed once the sitting is open.',
    })
    expect((await readSitting(id)).mode).toBe('remote')
  })

  it('cancels a scheduled sitting', async () => {
    await signInAs(adminEmail, password)
    const id = await createToday()

    const result = await cancelSitting({ sittingId: id })

    expect(result).toEqual({
      success: true,
      codesVoided: 0,
      notices: { sent: 0, failed: [], unrecorded: 0 },
    })
    expect((await readSitting(id)).status).toBe('cancelled')
  })

  it('maps an unknown invigilator to its domain message and creates nothing', async () => {
    await signInAs(adminEmail, password)
    const before = await countSittings()
    expect(before).toBeGreaterThan(0)

    const result = await createSitting({
      scheduledAt: todayIso(),
      mode: 'remote',
      invigilatorId: '00000000-0000-4000-8000-000000000000',
    })

    expect(result).toEqual({
      success: false,
      error: 'The invigilator must be an active admin or instructor of your organization',
    })
    expect(await countSittings()).toBe(before)
  })

  it('rejects a student caller without creating a sitting', async () => {
    await signInAs(adminEmail, password)
    const before = await countSittings()
    expect(before).toBeGreaterThan(0)

    await signInAs(studentEmail, password)
    await expect(
      createSitting({ scheduledAt: todayIso(), mode: 'remote', invigilatorId: instructorId }),
    ).rejects.toThrow('NEXT_REDIRECT:/app/dashboard')

    expect(await countSittings()).toBe(before)
  })
})
