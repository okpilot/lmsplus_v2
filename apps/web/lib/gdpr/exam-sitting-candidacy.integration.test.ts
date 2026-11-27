// App-layer integration tier (#925) — GDPR export of sitting candidacies and entries against
// real Postgres. Self-export runs under RLS (live rows only; no student SELECT policy on exam_sittings,
// so the sitting embed is null); admin export under the service role (live + removed, sitting
// date, mode and status resolved).
import { createServerSupabaseClient } from '@repo/db/server'
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
import { collectUserData } from './collect-user-data'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const password = 'test-pass-123'
const studentEmail = `int-gdpr-sit-s-${suffix}@test.local`

let orgId: string
let adminId: string
let instructorId: string
let studentId: string
let otherStudentId: string
let refs: ReferenceIds
let liveSitting: string
let removedSitting: string
let peerSitting: string
const SCHEDULED_LIVE = new Date(Date.now() + 3 * 86_400_000).toISOString()
const SCHEDULED_REMOVED = new Date(Date.now() + 5 * 86_400_000).toISOString()

async function seedSitting(mode: 'remote' | 'in_person', scheduledAt: string): Promise<string> {
  const { data, error } = await admin
    .from('exam_sittings')
    .insert({
      organization_id: orgId,
      mode,
      invigilator_id: instructorId,
      created_by: adminId,
      scheduled_at: scheduledAt,
    })
    .select('id')
    .single()
  if (error) throw new Error(`seedSitting: ${error.message}`)
  return data.id as string
}

async function seedRows(sittingId: string, userId: string, removed: boolean) {
  const removal = removed ? { deleted_at: new Date().toISOString(), deleted_by: adminId } : {}
  const { error: candErr } = await admin
    .from('exam_sitting_candidates')
    .insert({ organization_id: orgId, sitting_id: sittingId, user_id: userId, ...removal })
  if (candErr) throw new Error(`seed candidate: ${candErr.message}`)
  const { error: entryErr } = await admin.from('exam_sitting_entries').insert({
    organization_id: orgId,
    sitting_id: sittingId,
    user_id: userId,
    subject_id: refs.subjectId,
    ...removal,
  })
  if (entryErr) throw new Error(`seed entry: ${entryErr.message}`)
}

describe('collectUserData sitting candidacy (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `gdpr sit ${suffix}`, slug: `gdpr-sit-${suffix}` })
    adminId = await createTestUser({
      admin,
      orgId,
      email: `adm-${studentEmail}`,
      password,
      role: 'admin',
    })
    instructorId = await createTestUser({
      admin,
      orgId,
      email: `ins-${studentEmail}`,
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
    otherStudentId = await createTestUser({
      admin,
      orgId,
      email: `oth-${studentEmail}`,
      password,
      role: 'student',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `GSIT_${suffix}`,
      subjectName: `Gdpr Sitting Subject ${suffix}`,
      topicCode: `GSIT_${suffix}_T1`,
      topicName: `Gdpr Sitting Topic ${suffix}`,
    })
    liveSitting = await seedSitting('remote', SCHEDULED_LIVE)
    removedSitting = await seedSitting('in_person', SCHEDULED_REMOVED)
    peerSitting = await seedSitting('remote', SCHEDULED_LIVE)
    const { error: cancelErr } = await admin
      .from('exam_sittings')
      .update({ deleted_at: new Date().toISOString(), deleted_by: adminId })
      .eq('id', removedSitting)
    if (cancelErr) throw new Error(`cancel sitting: ${cancelErr.message}`)
    await seedRows(liveSitting, studentId, false)
    await seedRows(removedSitting, studentId, true)
    await seedRows(peerSitting, otherStudentId, false)
  }, 60_000)

  afterAll(async () => {
    await cleanupTestData({
      admin,
      orgId,
      userIds: [adminId, instructorId, studentId, otherStudentId],
    })
    await cleanupReferenceData({ admin, refs: [refs] })
  }, 60_000)

  it('self export returns live candidacies and entries only, sitting date, mode and status null, no warnings', async () => {
    await signInAs(studentEmail, password)
    const payload = await collectUserData(await createServerSupabaseClient(), studentId)

    expect(payload.warnings).toEqual([])
    expect(payload.exam_sitting_candidacies).toEqual([
      {
        id: expect.any(String),
        sitting_id: liveSitting,
        sitting_scheduled_at: null,
        sitting_mode: null,
        sitting_status: null,
        added_at: expect.any(String),
        deleted_at: null,
      },
    ])
    expect(payload.exam_sitting_entries).toEqual([
      {
        id: expect.any(String),
        sitting_id: liveSitting,
        subject_id: refs.subjectId,
        added_at: expect.any(String),
        deleted_at: null,
      },
    ])
  })

  it('admin export returns live and removed candidacies and entries with the sitting date, mode and status', async () => {
    const payload = await collectUserData(admin, studentId)

    expect(payload.warnings).toEqual([])
    expect(payload.exam_sitting_candidacies).toHaveLength(2)
    const bySitting = new Map(payload.exam_sitting_candidacies.map((c) => [c.sitting_id, c]))
    expect([...bySitting.keys()].sort()).toEqual([liveSitting, removedSitting].sort())
    expect(bySitting.has(peerSitting)).toBe(false)
    expect(bySitting.get(liveSitting)).toMatchObject({
      sitting_mode: 'remote',
      sitting_status: 'scheduled',
      deleted_at: null,
    })
    expect(bySitting.get(removedSitting)).toMatchObject({
      sitting_mode: 'in_person',
      sitting_status: 'cancelled',
    })
    expect(bySitting.get(removedSitting)?.deleted_at).not.toBeNull()
    expect(new Date(bySitting.get(liveSitting)?.sitting_scheduled_at as string).getTime()).toBe(
      new Date(SCHEDULED_LIVE).getTime(),
    )
    expect(new Date(bySitting.get(removedSitting)?.sitting_scheduled_at as string).getTime()).toBe(
      new Date(SCHEDULED_REMOVED).getTime(),
    )

    expect(payload.exam_sitting_entries).toHaveLength(2)
    const entries = new Map(payload.exam_sitting_entries.map((e) => [e.sitting_id, e]))
    expect([...entries.keys()].sort()).toEqual([liveSitting, removedSitting].sort())
    expect(entries.has(peerSitting)).toBe(false)
    expect(entries.get(liveSitting)).toMatchObject({ subject_id: refs.subjectId, deleted_at: null })
    expect(entries.get(removedSitting)?.deleted_at).not.toBeNull()
  })

  it('each export contains only that student own rows (peer self export)', async () => {
    await signInAs(`oth-${studentEmail}`, password)
    const self = await collectUserData(await createServerSupabaseClient(), otherStudentId)

    expect(self.warnings).toEqual([])
    expect(self.exam_sitting_candidacies.map((c) => c.sitting_id)).toEqual([peerSitting])
    expect(self.exam_sitting_entries.map((e) => e.sitting_id)).toEqual([peerSitting])
  })
})
