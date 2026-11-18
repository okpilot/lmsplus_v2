// App-layer integration tier (#925) — sitting popup reads (Add people / Add exams / Issue codes)
// against real local Postgres: list_exam_sitting_people, get_exam_sitting_subject_eligibility,
// get_exam_sitting_issue_preview, get_exam_sitting_group_add_counts, get_exam_sitting_same_day_people,
// the courses read and the candidate read behind `candidateIds` / `resolveSelection`.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { requireAdmin } from '@/lib/auth/require-admin'
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
import {
  candidateIds,
  getGroupAddCounts,
  getIssuePreview,
  getSameDayPeople,
  getSubjectEligibility,
  listCourseOptions,
  listGroupOptions,
  listPeople,
  resolveSelection,
} from './people-queries'
import { getRoster } from './roster-queries'
import { ENDED, NEEDS_CODE_STATUSES } from './types'

const admin = getAdminClient()
const suffix = fixtureSuffix()
const password = 'test-pass-123'
const adminEmail = `int-pq-admin-${suffix}@test.local`
const otherAdminEmail = `int-pq-other-${suffix}@test.local`
const instructorEmail = `int-pq-ins-${suffix}@test.local`
const BULK = 55
const DAY = 86_400_000
const PPL_A = 'c0a5e000-0000-4000-8000-000000000001'
const VFR_RT = 'c0a5e000-0000-4000-8000-000000000002'
const ATPL_A = 'c0a5e000-0000-4000-8000-000000000003'

let orgId: string
let otherOrgId: string
let adminId: string
let otherAdminId: string
let instructorId: string
let refs: ReferenceIds
let refsOff: ReferenceIds
const extraUserIds: string[] = []
const bulk: string[] = []

const dayAt = (offsetDays: number, hour: number) => {
  const d = new Date()
  d.setUTCHours(hour, 0, 0, 0)
  return new Date(d.getTime() + offsetDays * DAY).toISOString()
}

async function seedSitting(o: {
  day?: number
  hour?: number
  state?: 'scheduled' | 'open' | 'closed'
}): Promise<string> {
  const state = o.state ?? 'scheduled'
  const stamp = new Date(Date.now() - 2000).toISOString()
  const { data, error } = await admin
    .from('exam_sittings')
    .insert({
      organization_id: orgId,
      mode: 'remote',
      invigilator_id: adminId,
      created_by: adminId,
      scheduled_at: dayAt(o.day ?? 3, o.hour ?? 9),
      ...(state !== 'scheduled' ? { started_at: stamp, started_by: adminId } : {}),
      ...(state === 'closed' ? { closed_at: stamp, closed_by: adminId } : {}),
    })
    .select('id')
    .single()
  if (error) throw new Error(`seedSitting: ${error.message}`)
  return data.id as string
}

let studentN = 0
async function student(name: string, o: { courses?: string[]; dead?: boolean } = {}) {
  const n = ++studentN
  const id = await createTestUser({
    admin,
    orgId,
    email: `int-pq-${n}-${suffix}@test.local`,
    password,
    role: 'student',
    fullName: name,
    ...(o.courses ? { courses: o.courses } : {}),
  })
  extraUserIds.push(id)
  if (o.dead)
    await admin.from('users').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  return id
}

async function candidate(sittingId: string, userId: string, removed = false) {
  const { error } = await admin.from('exam_sitting_candidates').insert({
    organization_id: orgId,
    sitting_id: sittingId,
    user_id: userId,
    ...(removed ? { deleted_at: new Date().toISOString(), deleted_by: adminId } : {}),
  })
  if (error) throw new Error(`candidate: ${error.message}`)
}

async function entry(sittingId: string, userId: string, subjectId: string): Promise<string> {
  const { data, error } = await admin
    .from('exam_sitting_entries')
    .insert({
      organization_id: orgId,
      sitting_id: sittingId,
      user_id: userId,
      subject_id: subjectId,
    })
    .select('id')
    .single()
  if (error) throw new Error(`entry: ${error.message}`)
  return data.id as string
}

let codeN = 0
async function code(
  entryId: string,
  userId: string,
  subjectId: string,
  o: { expired?: boolean; voided?: boolean; consumed?: { sessionId: string | null } } = {},
) {
  const { error } = await admin.from('internal_exam_codes').insert({
    code: `PQ${suffix}${++codeN}`,
    subject_id: subjectId,
    student_id: userId,
    issued_by: adminId,
    organization_id: orgId,
    sitting_entry_id: entryId,
    expires_at: new Date(Date.now() + (o.expired ? -3_600_000 : 7_200_000)).toISOString(),
    ...(o.voided
      ? { voided_at: new Date().toISOString(), voided_by: adminId, void_reason: 'manual' }
      : {}),
    ...(o.consumed
      ? {
          consumed_at: new Date().toISOString(),
          ...(o.consumed.sessionId ? { consumed_session_id: o.consumed.sessionId } : {}),
        }
      : {}),
  })
  if (error) throw new Error(`code: ${error.message}`)
}

async function session(userId: string, subjectId: string, o: { ended: boolean; passed: boolean }) {
  const { data, error } = await admin
    .from('quiz_sessions')
    .insert({
      organization_id: orgId,
      student_id: userId,
      mode: 'internal_exam',
      subject_id: subjectId,
      config: { pass_mark: 75, question_ids: [] },
      total_questions: 0,
      started_at: new Date(Date.now() - 3_600_000).toISOString(),
      ended_at: o.ended ? new Date(Date.now() - 1_800_000).toISOString() : null,
      passed: o.ended ? o.passed : null,
      score_percentage: o.ended ? (o.passed ? 90 : 40) : null,
    })
    .select('id')
    .single()
  if (error) throw new Error(`session: ${error.message}`)
  return data.id as string
}

let mainId: string
let closedId: string
let endedId: string
let insideId: string
let removedId: string
let deadId: string
let atplId: string
let groupId: string
let groupName: string
let deletedGroupId: string
let otherOrgGroupId: string
const groupActive: string[] = []
let groupDead: string

const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {})

describe('sitting popup reads (app-layer integration)', () => {
  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `int-pq ${suffix}`, slug: `int-pq-${suffix}` })
    otherOrgId = await createTestOrg({
      admin,
      name: `int-pq-b ${suffix}`,
      slug: `int-pq-b-${suffix}`,
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
      email: instructorEmail,
      password,
      role: 'instructor',
    })
    refs = await seedReferenceData({
      admin,
      subjectCode: `PQ_${suffix}`,
      subjectName: `Popup Subject ${suffix}`,
      topicCode: `PQ_${suffix}_T1`,
      topicName: `Popup Topic ${suffix}`,
    })
    refsOff = await seedReferenceData({
      admin,
      subjectCode: `PQO_${suffix}`,
      subjectName: `Popup Off Subject ${suffix}`,
      topicCode: `PQO_${suffix}_T1`,
      topicName: `Popup Off Topic ${suffix}`,
    })
    const cfg = await admin.from('exam_configs').insert({
      organization_id: orgId,
      subject_id: refs.subjectId,
      enabled: true,
      total_questions: 10,
      time_limit_seconds: 1800,
      pass_mark: 75,
    })
    if (cfg.error) throw new Error(`exam_configs: ${cfg.error.message}`)

    mainId = await seedSitting({})
    await seedSitting({ hour: 14 })
    await seedSitting({ day: 4 })
    closedId = await seedSitting({ day: 0, state: 'closed' })
    endedId = await seedSitting({ day: -2 })

    for (let start = 0; start < BULK; start += 25) {
      const ids = await Promise.all(
        Array.from({ length: Math.min(25, BULK - start) }, (_, k) =>
          student(`Pq Bulk ${String(start + k).padStart(2, '0')}`),
        ),
      )
      bulk.push(...ids)
    }
    insideId = await student('Pq Inside')
    removedId = await student('Pq Removed')
    deadId = await student('Pq Dead', { dead: true })
    atplId = await student('Pq Atpl Only', { courses: [ATPL_A] })
    await candidate(mainId, insideId)
    await candidate(mainId, removedId, true)

    groupName = `Pq Group ${suffix}`
    const g = await admin
      .from('student_groups')
      .insert({ organization_id: orgId, name: groupName, created_by: adminId })
      .select('id')
      .single()
    if (g.error) throw new Error(`group: ${g.error.message}`)
    groupId = g.data.id
    const gDel = await admin
      .from('student_groups')
      .insert({
        organization_id: orgId,
        name: `Pq Deleted ${suffix}`,
        created_by: adminId,
        deleted_at: new Date().toISOString(),
        deleted_by: adminId,
      })
      .select('id')
      .single()
    if (gDel.error) throw new Error(`group: ${gDel.error.message}`)
    deletedGroupId = gDel.data.id
    const gOther = await admin
      .from('student_groups')
      .insert({
        organization_id: otherOrgId,
        name: `Pq Foreign ${suffix}`,
        created_by: otherAdminId,
      })
      .select('id')
      .single()
    if (gOther.error) throw new Error(`group: ${gOther.error.message}`)
    otherOrgGroupId = gOther.data.id
    groupActive.push(await student('Pq Group Ann'), await student('Pq Group Bea'))
    groupDead = await student('Pq Group Dead', { dead: true })
    const memberRows = [...groupActive, groupDead, insideId].map((user_id) => ({
      organization_id: orgId,
      group_id: groupId,
      user_id,
    }))
    const removedMember = await student('Pq Group Gone')
    const m = await admin.from('student_group_members').insert([
      ...memberRows,
      {
        organization_id: orgId,
        group_id: groupId,
        user_id: removedMember,
        deleted_at: new Date().toISOString(),
      },
    ])
    if (m.error) throw new Error(`members: ${m.error.message}`)
  }, 240_000)

  afterAll(async () => {
    try {
      await admin.from('student_group_members').delete().eq('organization_id', orgId)
      await admin.from('student_groups').delete().in('organization_id', [orgId, otherOrgId])
      await cleanupTestData({
        admin,
        orgId,
        userIds: [adminId, instructorId, ...extraUserIds],
      })
      await cleanupTestData({ admin, orgId: otherOrgId, userIds: [otherAdminId] })
      await cleanupReferenceData({ admin, refs: [refs, refsOff] })
    } catch (e) {
      throw new Error(`afterAll: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, 240_000)

  describe('listPeople', () => {
    it('hides people already in the sitting and lists a removed candidate again', async () => {
      await signInAs(adminEmail, password)
      const r = await listPeople({ sittingId: mainId, q: 'pq ', page: 1 })
      const rows = r && 'rows' in r ? r.rows : []
      expect(rows.map((x) => x.userId)).not.toContain(insideId)
      const removed = await listPeople({ sittingId: mainId, q: 'pq removed', page: 1 })
      expect(removed && 'rows' in removed ? removed.rows.map((x) => x.userId) : []).toEqual([
        removedId,
      ])
    })

    it('filters by name and by email, case-insensitively', async () => {
      await signInAs(adminEmail, password)
      const byName = await listPeople({ sittingId: mainId, q: 'PQ ATPL', page: 1 })
      expect(byName && 'rows' in byName ? byName.rows.map((x) => x.userId) : []).toEqual([atplId])
      const byEmail = await listPeople({ sittingId: mainId, q: `INT-PQ-1-${suffix}`, page: 1 })
      expect(byEmail && 'rows' in byEmail ? byEmail.total : -1).toBe(1)
    })

    it('filters by group and by course, with group and course names in the row', async () => {
      await signInAs(adminEmail, password)
      const g = await listPeople({ sittingId: mainId, group: groupId, status: 'inactive', page: 1 })
      expect(g && 'rows' in g ? g.rows.map((x) => x.name) : []).toEqual(['Pq Group Dead'])
      const active = await listPeople({ sittingId: mainId, group: groupId, page: 1 })
      expect(active && 'rows' in active ? active.rows.map((x) => x.name) : []).toEqual([
        'Pq Group Ann',
        'Pq Group Bea',
      ])
      expect(active && 'rows' in active ? active.rows[0]?.groups : '').toBe(groupName)
      const c = await listPeople({ sittingId: mainId, course: ATPL_A, page: 1 })
      expect(c && 'rows' in c ? c.rows.map((x) => x.userId) : []).toEqual([atplId])
      expect(c && 'rows' in c ? c.rows[0]?.courses : '').toBe('ATPL(A)')
      expect(VFR_RT).not.toBe(PPL_A)
    })

    it('defaults to active people; inactive lists only deactivated people', async () => {
      await signInAs(adminEmail, password)
      const def = await listPeople({ sittingId: mainId, q: 'pq dead', page: 1 })
      expect(def && 'rows' in def ? def.total : -1).toBe(0)
      const inactive = await listPeople({
        sittingId: mainId,
        q: 'pq dead',
        status: 'inactive',
        page: 1,
      })
      expect(inactive && 'rows' in inactive ? inactive.rows[0] : null).toMatchObject({
        userId: deadId,
        deactivated: true,
      })
    })

    it('pages 50 at a time with a total that excludes people in the sitting', async () => {
      await signInAs(adminEmail, password)
      const p1 = await listPeople({ sittingId: mainId, q: 'pq bulk', page: 1 })
      const p2 = await listPeople({ sittingId: mainId, q: 'pq bulk', page: 2 })
      if (!p1 || !('rows' in p1) || !p2 || !('rows' in p2)) throw new Error('expected pages')
      expect(p1.total).toBe(BULK)
      expect(p1.rows).toHaveLength(50)
      expect(p2.rows).toHaveLength(BULK - 50)
      expect(new Set([...p1.rows, ...p2.rows].map((x) => x.userId)).size).toBe(BULK)
    })

    it('returns ended for a closed sitting and for a sitting whose day has ended', async () => {
      await signInAs(adminEmail, password)
      expect(await listPeople({ sittingId: closedId, page: 1 })).toEqual(ENDED)
      expect(await listPeople({ sittingId: endedId, page: 1 })).toEqual(ENDED)
    })

    it('returns null for a sitting of another organization and refuses a non-admin', async () => {
      await signInAs(otherAdminEmail, password)
      expect(await listPeople({ sittingId: mainId, page: 1 })).toBeNull()
      await signInAs(instructorEmail, password)
      await expect(listPeople({ sittingId: mainId, page: 1 })).rejects.toThrow(/NEXT_REDIRECT/)
    })
  })

  describe('getSubjectEligibility', () => {
    let sid: string
    let e1: string
    let e2: string
    let e3: string
    let e4: string
    let e5: string

    beforeAll(async () => {
      sid = await seedSitting({ day: 5 })
      e1 = await student('Pq Elig One')
      e2 = await student('Pq Elig Here')
      e3 = await student('Pq Elig Passed')
      e4 = await student('Pq Elig Unenrolled', { courses: [] })
      e5 = await student('Pq Elig Dead')
      for (const u of [e1, e2, e3, e4, e5]) await candidate(sid, u)
      await admin.from('users').update({ deleted_at: new Date().toISOString() }).eq('id', e5)
      await entry(sid, e2, refs.subjectId)
      await session(e3, refs.subjectId, { ended: true, passed: true })
    }, 60_000)

    it('counts every pair state over all candidates when no ids are given', async () => {
      await signInAs(adminEmail, password)
      const r = await getSubjectEligibility(sid)
      if (!r || 'ended' in r) throw new Error('expected rows')
      const row = r.find((x) => x.subjectId === refs.subjectId)
      expect(row).toMatchObject({
        people: 5,
        eligible: 1,
        enteredHere: 1,
        passed: 1,
        notEnrolled: 1,
        deactivated: 1,
        state: null,
      })
      expect(r.map((x) => x.subjectId)).not.toContain(refsOff.subjectId)
    })

    it('drops non-candidates, fills single-person detail only for one id, and rejects when none is left', async () => {
      await signInAs(adminEmail, password)
      const stranger = bulk[0] as string
      const two = await getSubjectEligibility(sid, [e1, stranger])
      if (!two || 'ended' in two) throw new Error('expected rows')
      expect(two.find((x) => x.subjectId === refs.subjectId)).toMatchObject({
        people: 1,
        state: 'eligible',
      })
      const passed = await getSubjectEligibility(sid, [e3])
      if (!passed || 'ended' in passed) throw new Error('expected rows')
      expect(passed.find((x) => x.subjectId === refs.subjectId)).toMatchObject({
        state: 'passed',
        passedScore: 90,
        attemptCount: 1,
      })
      const log = quiet()
      await expect(getSubjectEligibility(sid, [stranger])).rejects.toThrow('Failed to load exams')
      expect(log).toHaveBeenCalled()
    })

    it('returns ended for a closed sitting, null for another organization', async () => {
      await signInAs(adminEmail, password)
      expect(await getSubjectEligibility(closedId)).toEqual(ENDED)
      await signInAs(otherAdminEmail, password)
      expect(await getSubjectEligibility(sid)).toBeNull()
    })
  })

  describe('getIssuePreview', () => {
    let psched: string
    let popen: string
    const statusOf = new Map<string, string>()
    const students: Record<string, string> = {}

    async function seedStatus(
      sittingId: string,
      label: string,
      build: (u: string, entryId: string) => Promise<void>,
    ) {
      const u = await student(`Pq Parity ${label}`)
      students[label] = u
      await candidate(sittingId, u)
      const entryId = await entry(sittingId, u, refs.subjectId)
      await build(u, entryId)
    }

    beforeAll(async () => {
      psched = await seedSitting({ day: 6 })
      popen = await seedSitting({ day: 0, hour: 0, state: 'open' })
      const sid = refs.subjectId
      await seedStatus(psched, 'no_code', async () => {})
      await seedStatus(psched, 'waiting', async (u, e) => code(e, u, sid))
      await seedStatus(psched, 'expired', async (u, e) => code(e, u, sid, { expired: true }))
      await seedStatus(psched, 'voided', async (u, e) => code(e, u, sid, { voided: true }))
      await seedStatus(psched, 'voided_attempt', async (u, e) => {
        const s = await session(u, sid, { ended: true, passed: false })
        await code(e, u, sid, { voided: true, consumed: { sessionId: s } })
      })
      await seedStatus(psched, 'running', async (u, e) => {
        const s = await session(u, sid, { ended: false, passed: false })
        await code(e, u, sid, { consumed: { sessionId: s } })
      })
      await seedStatus(psched, 'finished', async (u, e) => {
        const s = await session(u, sid, { ended: true, passed: false })
        await code(e, u, sid, { consumed: { sessionId: s } })
      })
      await seedStatus(psched, 'discarded', async (u, e) => {
        const s = await session(u, sid, { ended: false, passed: false })
        await code(e, u, sid, { consumed: { sessionId: s } })
        await admin
          .from('quiz_sessions')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', s)
      })
      await seedStatus(popen, 'ready', async (u, e) => code(e, u, sid))
      // roster statuses are the UI's "needs a code" source
      for (const s of [psched, popen]) {
        await signInAs(adminEmail, password)
        const r = await getRoster({ sittingId: s, page: 1 })
        for (const row of r?.rows ?? []) {
          for (const e of row.entries) statusOf.set(row.userId, e.status)
        }
      }
    }, 120_000)

    it('counts issue as exactly the entries the roster shows as needing a code (AC 50 parity)', async () => {
      await signInAs(adminEmail, password)
      for (const [label, userId] of Object.entries(students)) {
        const sittingId = label === 'ready' ? popen : psched
        const p = await getIssuePreview(sittingId, [userId])
        if (!p || 'ended' in p) throw new Error('expected a preview')
        const roster = statusOf.get(userId) ?? ''
        expect(roster, label).toBe(label)
        const issues = (p.counts.issue ?? 0) + (p.counts.reissue_after_expiry ?? 0)
        expect(issues > 0, label).toBe(NEEDS_CODE_STATUSES.has(roster))
        expect(p.studentsToIssue, label).toBe(issues > 0 ? 1 : 0)
      }
    })

    it('skips deactivated, passed, not enrolled and disabled-exam entries the roster still calls needs-code', async () => {
      const dead = await student('Pq Parity Dead')
      const passed = await student('Pq Parity Passed')
      const unenrolled = await student('Pq Parity Unenrolled', { courses: [] })
      const off = await student('Pq Parity Off')
      for (const u of [dead, passed, unenrolled, off]) await candidate(psched, u)
      await entry(psched, dead, refs.subjectId)
      await entry(psched, passed, refs.subjectId)
      await entry(psched, unenrolled, refs.subjectId)
      await entry(psched, off, refsOff.subjectId)
      await session(passed, refs.subjectId, { ended: true, passed: true })
      await admin.from('users').update({ deleted_at: new Date().toISOString() }).eq('id', dead)
      await signInAs(adminEmail, password)
      const r = await getRoster({ sittingId: psched, q: 'Pq Parity ', page: 1 })
      const roster = new Map((r?.rows ?? []).map((x) => [x.userId, x.entries[0]?.status]))
      for (const u of [dead, passed, unenrolled, off]) {
        expect(NEEDS_CODE_STATUSES.has(roster.get(u) ?? ''), u).toBe(true)
        const p = await getIssuePreview(psched, [u])
        if (!p || 'ended' in p) throw new Error('expected a preview')
        expect((p.counts.issue ?? 0) + (p.counts.reissue_after_expiry ?? 0), u).toBe(0)
      }
      const all = await getIssuePreview(psched, [dead, passed, unenrolled, off])
      if (!all || 'ended' in all) throw new Error('expected a preview')
      expect(all.counts).toMatchObject({
        deactivated: 1,
        passed: 1,
        no_longer_enrolled: 1,
        exam_disabled: 1,
      })
      const names = all.details.map((d) => d.student).sort()
      expect(names).toEqual([
        'Pq Parity Dead',
        'Pq Parity Off',
        'Pq Parity Passed',
        'Pq Parity Unenrolled',
      ])
      expect(all.details.length).toBeLessThanOrEqual(200)
    })

    it('narrows to the given ids, and covers the whole sitting without ids', async () => {
      await signInAs(adminEmail, password)
      const whole = await getIssuePreview(psched)
      const one = await getIssuePreview(psched, [students.no_code as string])
      if (!whole || 'ended' in whole || !one || 'ended' in one) throw new Error('expected previews')
      expect(one.counts).toEqual({ issue: 1 })
      expect(whole.counts.issue ?? 0).toBeGreaterThan(1)
      expect(whole.counts.already_issued).toBe(1)
    })

    it('returns ended for a closed sitting, null for another organization', async () => {
      await signInAs(adminEmail, password)
      expect(await getIssuePreview(closedId)).toEqual(ENDED)
      await signInAs(otherAdminEmail, password)
      expect(await getIssuePreview(psched)).toBeNull()
    })
  })

  describe('getGroupAddCounts', () => {
    it('counts active and deactivated new people, excluding people in the sitting and removed members', async () => {
      await signInAs(adminEmail, password)
      expect(await getGroupAddCounts(mainId, groupId)).toEqual({ activeNew: 2, deactivatedNew: 1 })
    })

    it('returns null for a soft-deleted group, a group of another organization and a foreign sitting', async () => {
      await signInAs(adminEmail, password)
      expect(await getGroupAddCounts(mainId, deletedGroupId)).toBeNull()
      expect(await getGroupAddCounts(mainId, otherOrgGroupId)).toBeNull()
      await signInAs(otherAdminEmail, password)
      expect(await getGroupAddCounts(mainId, groupId)).toBeNull()
    })

    it('returns ended for a closed sitting', async () => {
      await signInAs(adminEmail, password)
      expect(await getGroupAddCounts(closedId, groupId)).toEqual(ENDED)
    })
  })

  describe('getSameDayPeople', () => {
    let sid: string
    let sameDayUser: string
    let otherDayUser: string
    let closedUser: string

    beforeAll(async () => {
      sid = await seedSitting({ day: 7, hour: 9 })
      const sameLater = await seedSitting({ day: 7, hour: 15 })
      const otherDay = await seedSitting({ day: 8 })
      const closedSameDay = await seedSitting({ day: 7, hour: 11, state: 'closed' })
      sameDayUser = await student('Pq Same Day')
      otherDayUser = await student('Pq Other Day')
      closedUser = await student('Pq Closed Day')
      for (const u of [sameDayUser, otherDayUser, closedUser]) await candidate(sid, u)
      await entry(sameLater, sameDayUser, refs.subjectId)
      await entry(otherDay, otherDayUser, refs.subjectId)
      await entry(closedSameDay, closedUser, refs.subjectId)
    }, 60_000)

    it('lists people with an entry in another open sitting on the same UTC day, null ids = all candidates', async () => {
      await signInAs(adminEmail, password)
      const r = await getSameDayPeople(sid)
      if (!r || 'ended' in r) throw new Error('expected rows')
      expect(r.map((x) => x.userId)).toEqual([sameDayUser])
      expect(r[0]).toMatchObject({ name: 'Pq Same Day' })
      expect(new Date(r[0]?.scheduledAt ?? '').getUTCHours()).toBe(15)
    })

    it('honours explicit ids and ends for a closed sitting', async () => {
      await signInAs(adminEmail, password)
      const none = await getSameDayPeople(sid, [otherDayUser])
      expect(none).toEqual([])
      expect(await getSameDayPeople(closedId)).toEqual(ENDED)
      await signInAs(otherAdminEmail, password)
      expect(await getSameDayPeople(sid)).toBeNull()
    })
  })

  describe('listCourseOptions and listGroupOptions', () => {
    it('lists the courses in sort order for an admin of any organization', async () => {
      await signInAs(adminEmail, password)
      const a = await listCourseOptions()
      expect(a.map((c) => c.id).filter((id) => [PPL_A, VFR_RT, ATPL_A].includes(id))).toEqual([
        PPL_A,
        VFR_RT,
        ATPL_A,
      ])
      await signInAs(otherAdminEmail, password)
      expect(await listCourseOptions()).toEqual(a)
    })

    it('refuses a non-admin', async () => {
      await signInAs(instructorEmail, password)
      await expect(listCourseOptions()).rejects.toThrow(/NEXT_REDIRECT/)
    })

    it('lists only the organization own live groups', async () => {
      await signInAs(adminEmail, password)
      const ids = (await listGroupOptions()).map((g) => g.id)
      expect(ids).toContain(groupId)
      expect(ids).not.toContain(deletedGroupId)
      expect(ids).not.toContain(otherOrgGroupId)
    })
  })

  describe('candidateIds and resolveSelection', () => {
    it('returns live candidates only, optionally narrowed to the given ids', async () => {
      await signInAs(adminEmail, password)
      const { supabase, organizationId } = await requireAdmin()
      expect(await candidateIds(supabase, organizationId, { sittingId: mainId })).toEqual([
        insideId,
      ])
      expect(
        await candidateIds(supabase, organizationId, {
          sittingId: mainId,
          ids: [removedId, bulk[0] as string],
        }),
      ).toEqual([])
      expect(
        await candidateIds(supabase, organizationId, {
          sittingId: mainId,
          ids: [insideId, removedId],
        }),
      ).toEqual([insideId])
    })

    it('applies the explicit organization predicate: another organization id reads nothing', async () => {
      await signInAs(adminEmail, password)
      const { supabase } = await requireAdmin()
      expect(await candidateIds(supabase, otherOrgId, { sittingId: mainId })).toEqual([])
    })

    it('resolves a selection without widening it', async () => {
      await signInAs(adminEmail, password)
      const none = { present: false, all: false, ids: [], truncated: false }
      expect(await resolveSelection(mainId, 'issue', none)).toEqual({ kind: 'whole' })
      expect(await resolveSelection(mainId, 'exams', none)).toEqual({ kind: 'empty' })
      expect(await resolveSelection(mainId, 'exams', { ...none, all: true })).toEqual({
        kind: 'all',
      })
      expect(
        await resolveSelection(mainId, 'exams', {
          present: true,
          all: false,
          ids: [insideId],
          truncated: false,
        }),
      ).toEqual({ kind: 'ids', ids: [insideId], truncated: false })
      expect(
        await resolveSelection(mainId, 'issue', {
          present: true,
          all: false,
          ids: [removedId],
          truncated: false,
        }),
      ).toEqual({ kind: 'empty' })
    })
  })
})
