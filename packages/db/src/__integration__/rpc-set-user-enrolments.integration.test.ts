import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { seedQuestions, seedReferenceData } from './seed'
import {
  createTestOrg,
  createTestUser,
  getAdminClient,
  getAnonClient,
  getAuthenticatedClient,
} from './setup'

/** set_user_enrolments(p_user_id, p_course_ids): courses PR1 (AC3, AC4, AC5, AC8). */
describe('RPC: set_user_enrolments', () => {
  const admin = getAdminClient()
  const suffix = fixtureSuffix()
  const pw = 'test-pass-123'

  let orgId: string
  let otherOrgId: string
  let adminId: string
  let studentId: string
  let student2Id: string
  let otherOrgStudentId: string
  let instructorId: string
  let admin2Id: string
  let roleChangeId: string
  let deletedUserId: string
  let adminClient: SupabaseClient
  let studentClient: SupabaseClient
  let ppl: string
  let vfr: string
  let atpl: string
  const userIds: string[] = []
  const otherUserIds: string[] = []

  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `Enrol ${suffix}`, slug: `enrol-${suffix}` })
    otherOrgId = await createTestOrg({
      admin,
      name: `Enrol Other ${suffix}`,
      slug: `enrol-other-${suffix}`,
    })
    const mk = async (
      o: string,
      tag: string,
      role: 'admin' | 'instructor' | 'student',
      into: string[],
    ) => {
      const id = await createTestUser({
        admin,
        orgId: o,
        email: `${tag}-${suffix}@test.local`,
        password: pw,
        role,
        courses: [],
      })
      into.push(id)
      return id
    }
    adminId = await mk(orgId, 'enrol-admin', 'admin', userIds)
    studentId = await mk(orgId, 'enrol-s1', 'student', userIds)
    student2Id = await mk(orgId, 'enrol-s2', 'student', userIds)
    instructorId = await mk(orgId, 'enrol-i1', 'instructor', userIds)
    admin2Id = await mk(orgId, 'enrol-admin2', 'admin', userIds)
    roleChangeId = await mk(orgId, 'enrol-rc', 'student', userIds)
    deletedUserId = await mk(orgId, 'enrol-del', 'instructor', userIds)
    otherOrgStudentId = await mk(otherOrgId, 'enrol-os', 'student', otherUserIds)
    adminClient = await getAuthenticatedClient({
      email: `enrol-admin-${suffix}@test.local`,
      password: pw,
    })
    studentClient = await getAuthenticatedClient({
      email: `enrol-s1-${suffix}@test.local`,
      password: pw,
    })

    const { data } = await admin.from('courses').select('id, code')
    const m = Object.fromEntries((data ?? []).map((c) => [c.code as string, c.id as string]))
    ppl = m.PPL_A as string
    vfr = m.VFR_RT as string
    atpl = m.ATPL_A as string
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupTestData({ admin, orgId: otherOrgId, userIds: otherUserIds })
  })

  async function active(student: string): Promise<string[]> {
    const { data } = await admin
      .from('course_enrolments')
      .select('course_id')
      .eq('user_id', student)
      .is('deleted_at', null)
    return (data ?? []).map((r) => r.course_id as string).sort()
  }

  async function audits(student: string) {
    const { data } = await admin
      .from('audit_events')
      .select('actor_id, actor_role, organization_id, resource_type, resource_id, metadata')
      .eq('event_type', 'user.enrolments_changed')
      .eq('resource_id', student)
    return data ?? []
  }

  it('AC3: adds enrolments and writes one user.enrolments_changed audit row', async () => {
    const { error } = await adminClient.rpc('set_user_enrolments', {
      p_user_id: studentId,
      p_course_ids: [ppl, vfr],
    })
    expect(error).toBeNull()
    expect(await active(studentId)).toEqual([ppl, vfr].sort())

    const rows = await audits(studentId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      actor_id: adminId,
      actor_role: 'admin',
      organization_id: orgId,
      resource_type: 'user',
    })
    const meta = rows[0]?.metadata as { added: string[]; removed: string[] }
    expect([...meta.added].sort()).toEqual([ppl, vfr].sort())
    expect(meta.removed).toEqual([])
  })

  it('AC3: removes enrolments not in the set by soft delete with deleted_by', async () => {
    const { error } = await adminClient.rpc('set_user_enrolments', {
      p_user_id: studentId,
      p_course_ids: [ppl, atpl],
    })
    expect(error).toBeNull()
    expect(await active(studentId)).toEqual([ppl, atpl].sort())

    const { data: removed } = await admin
      .from('course_enrolments')
      .select('deleted_at, deleted_by')
      .eq('user_id', studentId)
      .eq('course_id', vfr)
    expect(removed).toHaveLength(1)
    expect(removed?.[0]?.deleted_at).not.toBeNull()
    expect(removed?.[0]?.deleted_by).toBe(adminId)
  })

  it('AC3: an unchanged set writes no audit row', async () => {
    const before = (await audits(studentId)).length
    const { error } = await adminClient.rpc('set_user_enrolments', {
      p_user_id: studentId,
      p_course_ids: [atpl, ppl, ppl],
    })
    expect(error).toBeNull()
    expect((await audits(studentId)).length).toBe(before)
    expect(await active(studentId)).toEqual([ppl, atpl].sort())
  })

  it('AC3: an empty array removes every enrolment', async () => {
    const { error } = await adminClient.rpc('set_user_enrolments', {
      p_user_id: student2Id,
      p_course_ids: [ppl],
    })
    expect(error).toBeNull()
    const { error: e2 } = await adminClient.rpc('set_user_enrolments', {
      p_user_id: student2Id,
      p_course_ids: [],
    })
    expect(e2).toBeNull()
    expect(await active(student2Id)).toEqual([])
  })

  it('AC4: rejects a non-admin caller with not_admin', async () => {
    const { error } = await studentClient.rpc('set_user_enrolments', {
      p_user_id: studentId,
      p_course_ids: [ppl],
    })
    expect(error?.message).toContain('not_admin')
  })

  it('AC4: rejects a user from another organization with user_not_found', async () => {
    const { error } = await adminClient.rpc('set_user_enrolments', {
      p_user_id: otherOrgStudentId,
      p_course_ids: [ppl],
    })
    expect(error?.message).toContain('user_not_found')
  })

  it('AC4: rejects a soft-deleted user with user_not_found', async () => {
    const { error: delErr } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deletedUserId)
    expect(delErr).toBeNull()
    const { error } = await adminClient.rpc('set_user_enrolments', {
      p_user_id: deletedUserId,
      p_course_ids: [ppl],
    })
    expect(error?.message).toContain('user_not_found')
  })

  it('AC4: rejects an unknown user id with user_not_found', async () => {
    const { error } = await adminClient.rpc('set_user_enrolments', {
      p_user_id: '00000000-0000-4000-8000-000000000000',
      p_course_ids: [ppl],
    })
    expect(error?.message).toContain('user_not_found')
  })

  it('AC3: an admin can enrol an instructor, with row and audit', async () => {
    const { error } = await adminClient.rpc('set_user_enrolments', {
      p_user_id: instructorId,
      p_course_ids: [atpl],
    })
    expect(error).toBeNull()
    expect(await active(instructorId)).toEqual([atpl])
    const rows = await audits(instructorId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ actor_id: adminId, organization_id: orgId })
  })

  it('AC3: an admin can enrol another admin', async () => {
    const { error } = await adminClient.rpc('set_user_enrolments', {
      p_user_id: admin2Id,
      p_course_ids: [ppl],
    })
    expect(error).toBeNull()
    expect(await active(admin2Id)).toEqual([ppl])
  })

  it('AC5: changing the user role keeps enrolments active', async () => {
    const { error } = await adminClient.rpc('set_user_enrolments', {
      p_user_id: roleChangeId,
      p_course_ids: [ppl, vfr],
    })
    expect(error).toBeNull()
    const { error: upErr } = await admin
      .from('users')
      .update({ role: 'instructor' })
      .eq('id', roleChangeId)
    expect(upErr).toBeNull()
    expect(await active(roleChangeId)).toEqual([ppl, vfr].sort())
  })

  it('AC4: rejects an unknown course with course_not_found and changes nothing', async () => {
    const before = await active(studentId)
    const { error } = await adminClient.rpc('set_user_enrolments', {
      p_user_id: studentId,
      p_course_ids: [ppl, '00000000-0000-4000-8000-000000000000'],
    })
    expect(error?.message).toContain('course_not_found')
    expect(await active(studentId)).toEqual(before)
  })

  it('AC4: rejects a NULL array with invalid_input', async () => {
    const { error } = await adminClient.rpc('set_user_enrolments', {
      p_user_id: studentId,
      p_course_ids: null,
    })
    expect(error?.message).toContain('invalid_input')
  })

  it('AC5: re-adding a removed course creates a new active row and keeps history', async () => {
    const set = (ids: string[]) =>
      adminClient.rpc('set_user_enrolments', { p_user_id: student2Id, p_course_ids: ids })
    expect((await set([vfr])).error).toBeNull()
    expect((await set([])).error).toBeNull()
    expect((await set([vfr])).error).toBeNull()

    const { data } = await admin
      .from('course_enrolments')
      .select('id, deleted_at')
      .eq('user_id', student2Id)
      .eq('course_id', vfr)
    expect(data).toHaveLength(2)
    expect((data ?? []).filter((r) => r.deleted_at === null)).toHaveLength(1)
  })

  it('AC8: anon cannot execute the RPC', async () => {
    const { error } = await getAnonClient().rpc('set_user_enrolments', {
      p_user_id: studentId,
      p_course_ids: [ppl],
    })
    expect(error?.code).toBe('42501')
  })
})

/** Unenrolment ends the removed course's open sessions and clears its saved quizzes (#1637 addendum). */
describe('RPC: set_user_enrolments ends sessions in removed courses', () => {
  const admin = getAdminClient()
  const suffix = fixtureSuffix()
  const pw = 'test-pass-123'
  const DEVICE = '11111111-1111-4111-8111-111111111111'

  type Refs = Awaited<ReturnType<typeof seedReferenceData>>
  type Mode = 'quick_quiz' | 'mock_exam' | 'internal_exam'
  type State = {
    deleted_at: string | null
    saved_at: string | null
    ended_at: string | null
    active_device_id: string | null
  }

  let orgId: string
  let adminId: string
  let adminClient: SupabaseClient
  let ppl: string
  let vfr: string
  let atpl: string
  let pplRefs: Refs
  let vfrRefs: Refs
  let atplRefs: Refs
  let pplQ: string
  let vfrQ: string
  let atplQ: string
  const userIds: string[] = []
  let seq = 0

  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `EnrolS ${suffix}`, slug: `enrols-${suffix}` })
    adminId = await createTestUser({
      admin,
      orgId,
      email: `enrols-admin-${suffix}@test.local`,
      password: pw,
      role: 'admin',
      courses: [],
    })
    userIds.push(adminId)
    adminClient = await getAuthenticatedClient({
      email: `enrols-admin-${suffix}@test.local`,
      password: pw,
    })
    const { data } = await admin.from('courses').select('id, code')
    const m = Object.fromEntries((data ?? []).map((c) => [c.code as string, c.id as string]))
    ppl = m.PPL_A as string
    vfr = m.VFR_RT as string
    atpl = m.ATPL_A as string

    const subject = async (tag: string, courseId: string) => {
      const refs = await seedReferenceData({
        admin,
        subjectCode: `${tag}${suffix}`,
        subjectName: `Unenrol ${tag} ${suffix}`,
        topicCode: `${tag}${suffix}-01`,
        topicName: `Unenrol topic ${tag} ${suffix}`,
      })
      const { error } = await admin
        .from('easa_subjects')
        .update({ course_id: courseId })
        .eq('id', refs.subjectId)
      expect(error).toBeNull()
      const q = await seedQuestions({
        admin,
        orgId,
        createdBy: adminId,
        subjectId: refs.subjectId,
        topicId: refs.topicId,
        count: 1,
      })
      return { refs, questionId: q.questionIds[0] as string }
    }
    const p = await subject('UP', ppl)
    const v = await subject('UV', vfr)
    const a = await subject('UA', atpl)
    pplRefs = p.refs
    vfrRefs = v.refs
    atplRefs = a.refs
    pplQ = p.questionId
    vfrQ = v.questionId
    atplQ = a.questionId
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupReferenceData({ admin, refs: [pplRefs, vfrRefs, atplRefs] })
  })

  async function newUser(role: 'student' | 'instructor', courseIds: string[]): Promise<string> {
    const id = await createTestUser({
      admin,
      orgId,
      email: `enrols-u${seq++}-${suffix}@test.local`,
      password: pw,
      role,
      courses: [],
    })
    userIds.push(id)
    const { error } = await adminClient.rpc('set_user_enrolments', {
      p_user_id: id,
      p_course_ids: courseIds,
    })
    expect(error).toBeNull()
    return id
  }

  async function insertSession(opts: {
    student: string
    mode?: Mode
    subjectId?: string | null
    questionIds: string[]
    saved?: boolean
    ended?: boolean
  }): Promise<string> {
    const now = new Date().toISOString()
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: opts.student,
        mode: opts.mode ?? 'quick_quiz',
        subject_id: opts.subjectId ?? null,
        config: { question_ids: opts.questionIds, pass_mark: 75 },
        total_questions: opts.questionIds.length,
        started_at: now,
        ended_at: opts.ended ? now : null,
        deleted_at: opts.saved ? now : null,
        saved_at: opts.saved ? now : null,
        active_device_id: opts.saved || opts.ended ? null : DEVICE,
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    return (data as { id: string }).id
  }

  async function state(id: string): Promise<State> {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('deleted_at, saved_at, ended_at, active_device_id')
      .eq('id', id)
      .single()
    expect(error).toBeNull()
    return data as State
  }

  const setCourses = (user: string, ids: string[]) =>
    adminClient.rpc('set_user_enrolments', { p_user_id: user, p_course_ids: ids })

  async function audits(user: string) {
    const { data } = await admin
      .from('audit_events')
      .select('metadata')
      .eq('event_type', 'user.enrolments_changed')
      .eq('resource_id', user)
    return (data ?? []) as Array<{ metadata: { sessions_ended?: string[] } }>
  }

  async function expectDiscarded(id: string) {
    const s = await state(id)
    expect(s.deleted_at).not.toBeNull()
    expect(s.active_device_id).toBeNull()
    expect(s.ended_at).toBeNull()
  }

  it('AC-U1: ends the open quiz in the removed course and leaves the other course untouched', async () => {
    const u = await newUser('student', [ppl, vfr])
    const rt = await insertSession({
      student: u,
      subjectId: vfrRefs.subjectId,
      questionIds: [vfrQ],
      saved: true,
    })
    const open = await insertSession({
      student: u,
      subjectId: pplRefs.subjectId,
      questionIds: [pplQ],
    })
    expect((await setCourses(u, [vfr])).error).toBeNull()
    await expectDiscarded(open)
    const rtState = await state(rt)
    expect(rtState.deleted_at).not.toBeNull()
    expect(rtState.saved_at).not.toBeNull()
  })

  it('AC-U2: clears saved_at of a saved quiz in the removed course and keeps it soft-deleted', async () => {
    const u = await newUser('student', [ppl, vfr])
    const saved = await insertSession({
      student: u,
      subjectId: pplRefs.subjectId,
      questionIds: [pplQ],
      saved: true,
    })
    expect((await setCourses(u, [vfr])).error).toBeNull()
    const s = await state(saved)
    expect(s.saved_at).toBeNull()
    expect(s.deleted_at).not.toBeNull()
  })

  it('AC-U3: removing a course from an instructor ends nothing', async () => {
    const u = await newUser('instructor', [ppl, vfr])
    const open = await insertSession({
      student: u,
      subjectId: pplRefs.subjectId,
      questionIds: [pplQ],
    })
    const saved = await insertSession({
      student: u,
      subjectId: pplRefs.subjectId,
      questionIds: [pplQ],
      saved: true,
    })
    expect((await setCourses(u, [vfr])).error).toBeNull()
    expect((await state(open)).deleted_at).toBeNull()
    expect((await state(saved)).saved_at).not.toBeNull()
    const events = await audits(u)
    expect(events.at(-1)?.metadata.sessions_ended).toEqual([])
  })

  it('AC-U4: audit metadata lists the ended session ids and a no-op call writes no event', async () => {
    const u = await newUser('student', [ppl, vfr])
    const open = await insertSession({
      student: u,
      subjectId: pplRefs.subjectId,
      questionIds: [pplQ],
    })
    expect((await setCourses(u, [vfr])).error).toBeNull()
    const events = await audits(u)
    expect(events.at(-1)?.metadata.sessions_ended).toEqual([open])
    const before = events.length
    expect((await setCourses(u, [vfr])).error).toBeNull()
    expect((await audits(u)).length).toBe(before)
  })

  it('AC-U6: discards a session with NULL subject_id matched only by question_ids in the removed course', async () => {
    const u = await newUser('student', [ppl, vfr])
    const open = await insertSession({ student: u, subjectId: null, questionIds: [pplQ] })
    expect((await setCourses(u, [vfr])).error).toBeNull()
    await expectDiscarded(open)
  })

  it('AC-U6: discards a session spanning a removed and a kept course', async () => {
    const u = await newUser('student', [ppl, vfr])
    const open = await insertSession({ student: u, subjectId: null, questionIds: [vfrQ, pplQ] })
    expect((await setCourses(u, [vfr])).error).toBeNull()
    await expectDiscarded(open)
  })

  it('AC-U6: keeps a session wholly inside a kept course', async () => {
    const u = await newUser('student', [ppl, vfr])
    const open = await insertSession({
      student: u,
      subjectId: vfrRefs.subjectId,
      questionIds: [vfrQ],
    })
    expect((await setCourses(u, [vfr])).error).toBeNull()
    expect((await state(open)).deleted_at).toBeNull()
  })

  it('AC-U7: ends nothing when the course stays in the new set', async () => {
    const u = await newUser('student', [ppl, vfr])
    const open = await insertSession({
      student: u,
      subjectId: pplRefs.subjectId,
      questionIds: [pplQ],
    })
    expect((await setCourses(u, [ppl, atpl])).error).toBeNull()
    expect((await state(open)).deleted_at).toBeNull()
    expect(atplQ).toBeTruthy()
  })

  it.each(['mock_exam', 'internal_exam'] as const)(
    'AC-U8: discards an open %s session in the removed course',
    async (mode) => {
      const u = await newUser('student', [ppl, vfr])
      const open = await insertSession({
        student: u,
        mode,
        subjectId: pplRefs.subjectId,
        questionIds: [pplQ],
      })
      expect((await setCourses(u, [vfr])).error).toBeNull()
      await expectDiscarded(open)
    },
  )

  it('AC-U9: leaves another student session and saved quiz in the same course untouched', async () => {
    const a = await newUser('student', [ppl, vfr])
    const b = await newUser('student', [ppl, vfr])
    const aOpen = await insertSession({
      student: a,
      subjectId: pplRefs.subjectId,
      questionIds: [pplQ],
    })
    const bOpen = await insertSession({
      student: b,
      subjectId: pplRefs.subjectId,
      questionIds: [pplQ],
    })
    const bSaved = await insertSession({
      student: b,
      subjectId: pplRefs.subjectId,
      questionIds: [pplQ],
      saved: true,
    })
    expect((await setCourses(a, [vfr])).error).toBeNull()
    await expectDiscarded(aOpen)
    expect((await state(bOpen)).deleted_at).toBeNull()
    expect((await state(bSaved)).saved_at).not.toBeNull()
  })

  it('AC-U10: sessions_ended lists saved-quiz ids when only saved quizzes are cleared', async () => {
    const u = await newUser('student', [ppl, vfr])
    const s1 = await insertSession({
      student: u,
      subjectId: pplRefs.subjectId,
      questionIds: [pplQ],
      saved: true,
    })
    const s2 = await insertSession({
      student: u,
      subjectId: null,
      questionIds: [pplQ],
      saved: true,
    })
    expect((await setCourses(u, [vfr])).error).toBeNull()
    const ended = (await audits(u)).at(-1)?.metadata.sessions_ended ?? []
    expect([...ended].sort()).toEqual([s1, s2].sort())
  })
})
