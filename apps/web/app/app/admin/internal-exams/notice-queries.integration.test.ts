// App-layer integration tier (#925) — sitting notice reads against real local Postgres.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupReferenceData,
  cleanupTestData,
  createTestOrg,
  createTestUser,
  fixtureSuffix,
  getAdminClient,
  getAuthenticatedClient,
  type ReferenceIds,
  seedReferenceData,
} from '@/lib/integration-support/harness'
import { insertPassedSession } from '../../../../e2e/helpers/exam-sitting-seed'
import {
  getChangedNoticeCodes,
  getDeliverablePendingNotices,
  getNoticeRecipients,
  getSittingForNotice,
  getSubjectNames,
} from './notice-queries'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const password = 'test-pass-123'
const HOUR = 3_600_000

let orgId: string
let otherOrgId: string
let adminId: string
let otherAdminId: string
let instructorId: string
let foreignUserId: string
let refs: ReferenceIds
let sittingId: string
let otherSittingId: string
let usedSittingId: string
const userIds: string[] = []
const codeByLabel: Record<string, string> = {}
const userByLabel: Record<string, string> = {}

async function mkSitting(): Promise<string> {
  const s = await admin
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
  if (s.error) throw new Error(`sitting: ${s.error.message}`)
  return s.data.id
}

async function entryWithCode(
  label: string,
  sitting: string,
  code: Record<string, unknown> = {},
  entry: Record<string, unknown> = {},
) {
  const userId = await createTestUser({
    admin,
    orgId,
    email: `int-nq-${label}-${suffix}@test.local`,
    password,
    role: 'student',
    fullName: `Nq ${label} ${suffix}`,
  })
  userIds.push(userId)
  userByLabel[label] = userId
  const cand = await admin
    .from('exam_sitting_candidates')
    .insert({ organization_id: orgId, sitting_id: sitting, user_id: userId })
  if (cand.error) throw new Error(`candidate ${label}: ${cand.error.message}`)
  const ent = await admin
    .from('exam_sitting_entries')
    .insert({
      organization_id: orgId,
      sitting_id: sitting,
      user_id: userId,
      subject_id: refs.subjectId,
      ...entry,
    })
    .select('id')
    .single()
  if (ent.error) throw new Error(`entry ${label}: ${ent.error.message}`)
  const c = await admin
    .from('internal_exam_codes')
    .insert({
      code: `NQ${label}${suffix}`.slice(0, 12).toUpperCase(),
      subject_id: refs.subjectId,
      student_id: userId,
      issued_by: adminId,
      organization_id: orgId,
      sitting_entry_id: ent.data.id,
      expires_at: new Date(Date.now() + 5 * HOUR).toISOString(),
      emailed_at: new Date().toISOString(),
      ...code,
    })
    .select('id')
    .single()
  if (c.error) throw new Error(`code ${label}: ${c.error.message}`)
  codeByLabel[label] = c.data.id
}

describe('notice-queries (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `int-nq ${suffix}`, slug: `int-nq-${suffix}` })
    otherOrgId = await createTestOrg({
      admin,
      name: `int-nq-b ${suffix}`,
      slug: `int-nq-b-${suffix}`,
    })
    const mkUser = (o: string, tag: string, role: 'admin' | 'instructor' | 'student') =>
      createTestUser({
        admin,
        orgId: o,
        email: `int-nq-${tag}-${suffix}@test.local`,
        password,
        role,
      })
    adminId = await mkUser(orgId, 'admin', 'admin')
    instructorId = await mkUser(orgId, 'ins', 'instructor')
    otherAdminId = await mkUser(otherOrgId, 'oadmin', 'admin')
    foreignUserId = await mkUser(otherOrgId, 'foreign', 'student')
    refs = await seedReferenceData({
      admin,
      subjectCode: `NQ_${suffix}`,
      subjectName: `Notice Subject ${suffix}`,
      topicCode: `NQ_${suffix}_T1`,
      topicName: `Notice Topic ${suffix}`,
    })
    sittingId = await mkSitting()
    otherSittingId = await mkSitting()
    await entryWithCode('a', sittingId)
    await entryWithCode('voided', sittingId, {
      voided_at: new Date().toISOString(),
      voided_by: adminId,
    })
    // A consumed code needs a real session; its own sitting keeps cancel_exam_sitting free of attempts.
    usedSittingId = await mkSitting()
    await entryWithCode('used', usedSittingId)
    const usedSession = await insertPassedSession(admin as never, {
      orgId,
      userId: userByLabel.used as string,
      subjectId: refs.subjectId,
      score: 90,
      endedAt: new Date(),
    })
    const consume = await admin
      .from('internal_exam_codes')
      .update({ consumed_at: new Date().toISOString(), consumed_session_id: usedSession })
      .eq('id', codeByLabel.used as string)
    if (consume.error) throw new Error(`consume: ${consume.error.message}`)
    await entryWithCode('dead', sittingId)
    await entryWithCode('elsewhere', otherSittingId)
    const { error } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', userByLabel.dead)
    if (error) throw new Error(`deactivate: ${error.message}`)
  }, 120_000)

  afterAll(async () => {
    try {
      await cleanupTestData({ admin, orgId, userIds: [adminId, instructorId, ...userIds] })
      await cleanupTestData({ admin, orgId: otherOrgId, userIds: [otherAdminId, foreignUserId] })
      await cleanupReferenceData({ admin, refs: [refs] })
    } catch (e) {
      throw new Error(`afterAll: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, 120_000)

  it('getNoticeRecipients returns name and email of an active user of the organization', async () => {
    const r = await getNoticeRecipients(orgId, [userByLabel.a as string])
    expect(r.get(userByLabel.a as string)).toEqual({
      name: `Nq a ${suffix}`,
      email: `int-nq-a-${suffix}@test.local`,
    })
  })

  it('getNoticeRecipients omits a deactivated user', async () => {
    const r = await getNoticeRecipients(orgId, [
      userByLabel.a as string,
      userByLabel.dead as string,
    ])
    expect(r.has(userByLabel.dead as string)).toBe(false)
    expect(r.has(userByLabel.a as string)).toBe(true)
  })

  it('getNoticeRecipients omits a user id of another organization', async () => {
    const r = await getNoticeRecipients(orgId, [foreignUserId])
    expect(r.size).toBe(0)
  })

  it('getSubjectNames maps subject ids to names', async () => {
    const r = await getSubjectNames([refs.subjectId])
    expect(r.get(refs.subjectId)).toBe(`Notice Subject ${suffix}`)
  })

  it('getChangedNoticeCodes returns only unvoided, unconsumed codes of this sitting', async () => {
    const all = Object.values(codeByLabel)
    const r = await getChangedNoticeCodes(orgId, sittingId, all)
    expect(r.map((x) => x.codeId).sort()).toEqual([codeByLabel.a, codeByLabel.dead].sort())
    expect(r.find((x) => x.codeId === codeByLabel.a)).toMatchObject({
      userId: userByLabel.a,
      subjectId: refs.subjectId,
    })
  })

  it('getChangedNoticeCodes excludes a consumed code of the sitting', async () => {
    const r = await getChangedNoticeCodes(orgId, usedSittingId, [codeByLabel.used as string])
    expect(r).toEqual([])
  })

  it('getChangedNoticeCodes excludes codes of another sitting', async () => {
    const r = await getChangedNoticeCodes(orgId, sittingId, [codeByLabel.elsewhere as string])
    expect(r).toEqual([])
  })

  it('getChangedNoticeCodes returns nothing for another organization', async () => {
    const r = await getChangedNoticeCodes(otherOrgId, sittingId, [codeByLabel.a as string])
    expect(r).toEqual([])
  })

  it('getSittingForNotice returns scheduled_at and mode for the organization sitting', async () => {
    const r = await getSittingForNotice(orgId, sittingId)
    expect(r).toMatchObject({ mode: 'remote' })
    expect(typeof r?.scheduledAt).toBe('string')
  })

  it('getSittingForNotice returns null for another organization', async () => {
    expect(await getSittingForNotice(otherOrgId, sittingId)).toBeNull()
  })

  it('getDeliverablePendingNotices counts a cancelled sitting once per deliverable code and drops the deactivated student', async () => {
    const c = await getAuthenticatedClient({
      email: `int-nq-admin-${suffix}@test.local`,
      password,
    })
    const cancel = await c.rpc('cancel_exam_sitting', { p_sitting_id: sittingId })
    if (cancel.error) throw new Error(`cancel: ${cancel.error.message}`)
    const items = await getDeliverablePendingNotices(c as never, orgId, sittingId)
    expect(items.every((i) => i.kind === 'sitting_cancelled')).toBe(true)
    const users = items.map((i) => i.userId)
    expect(users).toContain(userByLabel.a)
    expect(users).not.toContain(userByLabel.dead)
  })

  it('getSittingForNotice resolves a cancelled sitting', async () => {
    const r = await getSittingForNotice(orgId, sittingId)
    expect(r).not.toBeNull()
  })

  it('getDeliverablePendingNotices returns nothing for a sitting of another organization', async () => {
    const c = await getAuthenticatedClient({
      email: `int-nq-oadmin-${suffix}@test.local`,
      password,
    })
    expect(await getDeliverablePendingNotices(c as never, otherOrgId, sittingId)).toEqual([])
  })
})
