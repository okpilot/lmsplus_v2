// App-layer integration tier (#925) — remove actions against real local Postgres.
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
import { removeCandidates } from './remove-candidates'
import { removeSittingEntries } from './remove-entries'
import { voidSittingCode } from './void-sitting-code'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const password = 'test-pass-123'
const adminEmail = `int-pact-admin-${suffix}@test.local`

let orgId: string
let adminId: string
let instructorId: string
let s1: string
let s2: string
let refs: ReferenceIds
let sittingId: string
let entryId: string

describe('sitting people Server Actions (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `int-pact ${suffix}`, slug: `int-pact-${suffix}` })
    adminId = await createTestUser({ admin, orgId, email: adminEmail, password, role: 'admin' })
    instructorId = await createTestUser({
      admin,
      orgId,
      email: `int-pact-ins-${suffix}@test.local`,
      password,
      role: 'instructor',
    })
    s1 = await createTestUser({
      admin,
      orgId,
      email: `int-pact-s1-${suffix}@test.local`,
      password,
      role: 'student',
    })
    s2 = await createTestUser({
      admin,
      orgId,
      email: `int-pact-s2-${suffix}@test.local`,
      password,
      role: 'student',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `PACT_${suffix}`,
      subjectName: `People Action ${suffix}`,
      topicCode: `PACT_${suffix}_T1`,
      topicName: `People Topic ${suffix}`,
    })
    const { data, error } = await admin
      .from('exam_sittings')
      .insert({
        organization_id: orgId,
        mode: 'remote',
        invigilator_id: instructorId,
        created_by: adminId,
        scheduled_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      })
      .select('id')
      .single()
    if (error) throw new Error(`sitting: ${error.message}`)
    sittingId = data.id
    const cand = await admin
      .from('exam_sitting_candidates')
      .insert([s1, s2].map((u) => ({ organization_id: orgId, sitting_id: sittingId, user_id: u })))
    if (cand.error) throw new Error(`candidates: ${cand.error.message}`)
    const ent = await admin
      .from('exam_sitting_entries')
      .insert({
        organization_id: orgId,
        sitting_id: sittingId,
        user_id: s1,
        subject_id: refs.subjectId,
      })
      .select('id')
      .single()
    if (ent.error) throw new Error(`entry: ${ent.error.message}`)
    entryId = ent.data.id
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds: [adminId, instructorId, s1, s2] })
    await cleanupReferenceData({ admin, refs: [refs] })
  })

  it('removeSittingEntries soft-deletes the entry', async () => {
    await signInAs(adminEmail, password)
    const r = await removeSittingEntries({ sittingId, entryIds: [entryId] })
    expect(r).toMatchObject({ success: true, removed: 1 })
    const { data } = await admin
      .from('exam_sitting_entries')
      .select('deleted_at')
      .eq('id', entryId)
      .single()
    expect(data?.deleted_at).not.toBeNull()
  })

  it('removeSittingEntries reports entry_not_found copy for an unknown entry', async () => {
    await signInAs(adminEmail, password)
    expect(await removeSittingEntries({ sittingId, entryIds: [crypto.randomUUID()] })).toEqual({
      success: false,
      error: 'This exam is no longer in the sitting. Reload the page.',
    })
  })

  it('removeCandidates soft-deletes the candidate', async () => {
    await signInAs(adminEmail, password)
    const r = await removeCandidates({ sittingId, userIds: [s2] })
    expect(r).toMatchObject({ success: true, removed: 1 })
    const { data } = await admin
      .from('exam_sitting_candidates')
      .select('deleted_at')
      .eq('sitting_id', sittingId)
      .eq('user_id', s2)
      .single()
    expect(data?.deleted_at).not.toBeNull()
  })

  it('removeCandidates reports candidate_not_found copy for a person not in the sitting', async () => {
    await signInAs(adminEmail, password)
    expect(await removeCandidates({ sittingId, userIds: [s2] })).toEqual({
      success: false,
      error: 'Someone you selected is no longer in this sitting. Reload the page.',
    })
  })

  it('voidSittingCode voids an unused code and reports code_voided copy on a repeat', async () => {
    const ent = await admin
      .from('exam_sitting_entries')
      .insert({
        organization_id: orgId,
        sitting_id: sittingId,
        user_id: s1,
        subject_id: refs.subjectId,
      })
      .select('id')
      .single()
    if (ent.error) throw new Error(`entry: ${ent.error.message}`)
    const c = await admin
      .from('internal_exam_codes')
      .insert({
        code: `VP${suffix}`,
        subject_id: refs.subjectId,
        student_id: s1,
        issued_by: adminId,
        organization_id: orgId,
        sitting_entry_id: ent.data.id,
        expires_at: new Date(Date.now() + 7_200_000).toISOString(),
      })
      .select('id')
      .single()
    if (c.error) throw new Error(`code: ${c.error.message}`)
    await signInAs(adminEmail, password)
    expect(await voidSittingCode({ sittingId, codeId: c.data.id, reason: 'Wrong person' })).toEqual(
      {
        success: true,
        codeId: c.data.id,
      },
    )
    const { data } = await admin
      .from('internal_exam_codes')
      .select('voided_at')
      .eq('id', c.data.id)
      .single()
    expect(data?.voided_at).not.toBeNull()
    expect(await voidSittingCode({ sittingId, codeId: c.data.id, reason: 'again' })).toEqual({
      success: false,
      error: 'Code is already voided.',
    })
  })
})
