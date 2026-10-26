import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { DEVICE } from './finish-fixture'
import { fixtureSuffix } from './fixture-suffix'
import { requireRpcResult, requireRpcRows } from './guards'
import { seedQuestions, seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'
import { createPart3Org, type Part3Org } from './vfr-rt-part3-org'

/** Enrolment guard on every quiz_sessions start path (#1637, AC4, AC4a, AC5, AC11, AC15). */
describe('RPC: start paths enforce course enrolment', () => {
  const admin = getAdminClient()
  const suffix = fixtureSuffix()
  const pw = 'test-pass-123'

  let orgId: string
  let adminId: string
  let ppl: string
  let vfr: string
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  let questionIds: string[]
  let rt: Part3Org
  let refsNoCfg: Awaited<ReturnType<typeof seedReferenceData>>
  let noCfgOrgId: string
  const noCfgUserIds: string[] = []
  const noCfgClients: Record<string, SupabaseClient> = {}
  const userIds: string[] = []
  const codeIds: string[] = []
  const ids: Record<string, string> = {}
  const clients: Record<string, SupabaseClient> = {}

  async function setEnrolments(userId: string, org: string, courseIds: string[]) {
    const { error: delErr } = await admin
      .from('course_enrolments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('deleted_at', null)
    if (delErr) throw new Error(`setEnrolments clear: ${delErr.message}`)
    if (courseIds.length === 0) return
    const { error } = await admin
      .from('course_enrolments')
      .insert(courseIds.map((c) => ({ organization_id: org, user_id: userId, course_id: c })))
    if (error) throw new Error(`setEnrolments insert: ${error.message}`)
  }

  async function mk(tag: string, role: 'admin' | 'student', courses: string[]) {
    const email = `${tag}-${suffix}@test.local`
    const id = await createTestUser({ admin, orgId, email, password: pw, role })
    userIds.push(id)
    await setEnrolments(id, orgId, courses)
    ids[tag] = id
    clients[tag] = await getAuthenticatedClient({ email, password: pw })
  }

  async function seedCode(studentId: string): Promise<{ id: string; code: string }> {
    const code = `EG${suffix}${codeIds.length}`.slice(0, 30)
    const { data, error } = await admin
      .from('internal_exam_codes')
      .insert({
        code,
        subject_id: refs.subjectId,
        student_id: studentId,
        issued_by: adminId,
        organization_id: orgId,
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`seedCode: ${error?.message}`)
    codeIds.push(data.id as string)
    return { id: data.id as string, code }
  }

  async function sessionsOf(studentId: string) {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('id, mode')
      .eq('student_id', studentId)
      .is('deleted_at', null)
    if (error) throw new Error(`sessionsOf: ${error.message}`)
    return requireRpcRows<{ id: string; mode: string }>(data, 'sessionsOf')
  }

  const practiceArgs = () => ({
    p_subject_id: refs.subjectId,
    p_topic_ids: null,
    p_subtopic_ids: null,
    p_count: 2,
    p_filters: [],
    p_calc_mode: 'all',
    p_has_image: 'all',
  })

  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `Enrol Guard ${suffix}`, slug: `enrol-g-${suffix}` })
    const { data: courses } = await admin.from('courses').select('id, code')
    const byCode = Object.fromEntries(
      (courses ?? []).map((c) => [c.code as string, c.id as string]),
    )
    ppl = byCode.PPL_A as string
    vfr = byCode.VFR_RT as string

    await mk('eg-admin', 'admin', [])
    adminId = ids['eg-admin'] as string
    await mk('eg-ppl', 'student', [ppl])
    await mk('eg-rt', 'student', [vfr])

    refs = await seedReferenceData({
      admin,
      subjectCode: `EG${suffix}`,
      subjectName: `Enrol Guard ${suffix}`,
      topicCode: `EG${suffix}-01`,
      topicName: `Enrol Guard Topic ${suffix}`,
    })
    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: adminId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 5,
    })
    questionIds = seeded.questionIds

    const { data: cfg, error: cfgErr } = await admin
      .from('exam_configs')
      .insert({
        organization_id: orgId,
        subject_id: refs.subjectId,
        enabled: true,
        total_questions: 1,
        time_limit_seconds: 600,
        pass_mark: 75,
      })
      .select('id')
      .single()
    if (cfgErr || !cfg) throw new Error(`seed exam_config: ${cfgErr?.message}`)
    const { error: distErr } = await admin.from('exam_config_distributions').insert({
      exam_config_id: cfg.id,
      topic_id: refs.topicId,
      subtopic_id: null,
      question_count: 1,
    })
    if (distErr) throw new Error(`seed distribution: ${distErr.message}`)

    refsNoCfg = await seedReferenceData({
      admin,
      subjectCode: `EGN${suffix}`,
      subjectName: `Enrol Guard NoCfg ${suffix}`,
      topicCode: `EGN${suffix}-01`,
      topicName: `Enrol Guard NoCfg Topic ${suffix}`,
    })

    noCfgOrgId = await createTestOrg({
      admin,
      name: `Enrol Guard NoCfg ${suffix}`,
      slug: `enrol-gn-${suffix}`,
    })
    for (const [tag, course] of [
      ['egn-ppl', ppl],
      ['egn-rt', vfr],
    ] as const) {
      const email = `${tag}-${suffix}@test.local`
      const id = await createTestUser({
        admin,
        orgId: noCfgOrgId,
        email,
        password: pw,
        role: 'student',
      })
      noCfgUserIds.push(id)
      await setEnrolments(id, noCfgOrgId, [course as string])
      noCfgClients[tag] = await getAuthenticatedClient({ email, password: pw })
    }

    rt = await createPart3Org(`eg${suffix.slice(-4)}`)
    await setEnrolments(rt.studentId, rt.orgId, [vfr])
  })

  afterEach(async () => {
    for (const id of [...userIds, ...noCfgUserIds, rt.studentId]) {
      const { error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('student_id', id)
        .is('ended_at', null)
        .is('deleted_at', null)
      if (error) throw new Error(`afterEach: ${error.message}`)
    }
  })

  afterAll(async () => {
    if (codeIds.length > 0) {
      await admin.from('internal_exam_codes').delete().in('id', codeIds)
    }
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupTestData({ admin, orgId: noCfgOrgId, userIds: noCfgUserIds })
    await cleanupReferenceData({ admin, refs: [refs, refsNoCfg] })
    await rt?.cleanup()
  })

  it('AC4a: start_practice_quiz for a non-enrolled subject returns an empty draw and creates no session', async () => {
    const { data: ok } = await (clients['eg-ppl'] as SupabaseClient).rpc(
      'start_practice_quiz',
      practiceArgs(),
    )
    expect(
      requireRpcResult<{ session_id: string | null }>(ok, 'enrolled').session_id,
    ).not.toBeNull()
    await afterEachClear()

    const { data, error } = await (clients['eg-rt'] as SupabaseClient).rpc(
      'start_practice_quiz',
      practiceArgs(),
    )
    expect(error).toBeNull()
    expect(requireRpcResult(data, 'start_practice_quiz')).toEqual({
      session_id: null,
      question_ids: [],
    })
    expect(await sessionsOf(ids['eg-rt'] as string)).toEqual([])
  })

  async function afterEachClear() {
    await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('student_id', ids['eg-ppl'] as string)
      .is('deleted_at', null)
  }

  it('AC4: start_quiz_session with supplied ids raises not_enrolled for a non-enrolled student', async () => {
    const { data, error } = await (clients['eg-rt'] as SupabaseClient).rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: refs.subjectId,
      p_topic_id: refs.topicId,
      p_question_ids: questionIds.slice(0, 2),
    })
    expect(error?.message ?? '').toMatch(/not_enrolled/)
    expect(data).toBeNull()
    expect(await sessionsOf(ids['eg-rt'] as string)).toEqual([])
  })

  it('AC4: start_quiz_session with no subject raises not_enrolled for ids outside the enrolled courses', async () => {
    const { data, error } = await (clients['eg-rt'] as SupabaseClient).rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: null,
      p_topic_id: null,
      p_question_ids: questionIds.slice(0, 2),
    })
    expect(error?.message ?? '').toMatch(/not_enrolled/)
    expect(data).toBeNull()
    expect(await sessionsOf(ids['eg-rt'] as string)).toEqual([])
  })

  it('AC4: start_discovery raises not_enrolled for a non-enrolled student', async () => {
    const { error } = await (clients['eg-rt'] as SupabaseClient).rpc('start_discovery', {
      ...practiceArgs(),
      p_count: 500,
    })
    expect(error?.message ?? '').toMatch(/not_enrolled/)
    expect(await sessionsOf(ids['eg-rt'] as string)).toEqual([])
  })

  it('AC4: start_exam_session raises not_enrolled for a non-enrolled student', async () => {
    const { error } = await (clients['eg-rt'] as SupabaseClient).rpc('start_exam_session', {
      p_subject_id: refs.subjectId,
    })
    expect(error?.message ?? '').toMatch(/not_enrolled/)
    expect(await sessionsOf(ids['eg-rt'] as string)).toEqual([])
  })

  it('AC4: start_internal_exam_session raises not_enrolled and leaves the code unconsumed', async () => {
    const { id, code } = await seedCode(ids['eg-rt'] as string)
    const { error } = await (clients['eg-rt'] as SupabaseClient).rpc(
      'start_internal_exam_session',
      { p_code: code },
    )
    expect(error?.message ?? '').toMatch(/not_enrolled/)
    expect(await sessionsOf(ids['eg-rt'] as string)).toEqual([])
    const { data } = await admin
      .from('internal_exam_codes')
      .select('consumed_at, consumed_session_id')
      .eq('id', id)
      .single()
    expect(data?.consumed_at).toBeNull()
    expect(data?.consumed_session_id).toBeNull()
  })

  it('AC4: start_vfr_rt_exam_session raises not_enrolled for a student not enrolled in VFR_RT', async () => {
    await setEnrolments(rt.studentId, rt.orgId, [ppl])
    try {
      const { error } = await rt.studentClient.rpc('start_vfr_rt_exam_session', {
        p_subject_id: rt.rtSubjectId,
      })
      expect(error?.message ?? '').toMatch(/not_enrolled/)
      expect(await sessionsOf(rt.studentId)).toEqual([])
    } finally {
      await setEnrolments(rt.studentId, rt.orgId, [vfr])
    }
  })

  it('AC5: an enrolled student starts quick_quiz, discovery, exam and internal exam', async () => {
    const c = clients['eg-ppl'] as SupabaseClient
    const sid = ids['eg-ppl'] as string
    const clear = async () => afterEachClear()

    const q = await c.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: refs.subjectId,
      p_topic_id: refs.topicId,
      p_question_ids: questionIds.slice(0, 2),
    })
    expect(q.error).toBeNull()
    await clear()

    const d = await c.rpc('start_discovery', { ...practiceArgs(), p_count: 500 })
    expect(d.error).toBeNull()
    await clear()

    const e = await c.rpc('start_exam_session', { p_subject_id: refs.subjectId })
    expect(e.error).toBeNull()
    await clear()

    const { code } = await seedCode(sid)
    const i = await c.rpc('start_internal_exam_session', { p_code: code })
    expect(i.error).toBeNull()
    expect(requireRpcRows(i.data, 'internal').length).toBeGreaterThan(0)
  })

  it('AC5: an enrolled student starts the VFR RT exam', async () => {
    const { data, error } = await rt.studentClient.rpc('start_vfr_rt_exam_session', {
      p_subject_id: rt.rtSubjectId,
    })
    expect(error).toBeNull()
    expect(requireRpcResult<{ session_id: string }>(data, 'vfr').session_id).toBeTruthy()
  })

  it('AC11: a service-role insert into quiz_sessions for a non-enrolled student is not blocked', async () => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: ids['eg-rt'],
        mode: 'quick_quiz',
        subject_id: refs.subjectId,
        config: { question_ids: questionIds.slice(0, 2) },
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    expect(data?.id).toBeTruthy()
  })

  it('AC15: after unenrolment get_quiz_questions returns no rows for an open session but finish still succeeds', async () => {
    const c = clients['eg-ppl'] as SupabaseClient
    const sid = ids['eg-ppl'] as string
    const picked = questionIds.slice(0, 2)
    const started = await c.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: refs.subjectId,
      p_topic_id: refs.topicId,
      p_question_ids: picked,
    })
    expect(started.error).toBeNull()
    const sessionId = started.data as string

    const before = await c.rpc('get_quiz_questions', { p_question_ids: picked })
    expect(requireRpcRows(before.data, 'before').length).toBe(picked.length)

    await setEnrolments(sid, orgId, [])
    try {
      const after = await c.rpc('get_quiz_questions', { p_question_ids: picked })
      expect(after.error).toBeNull()
      expect(requireRpcRows(after.data, 'after')).toEqual([])

      const fin = await c.rpc('finish_quiz_session', {
        p_session_id: sessionId,
        p_device_id: DEVICE,
      })
      expect(fin.error).toBeNull()
    } finally {
      await setEnrolments(sid, orgId, [ppl])
    }
  })

  it('AC6: get_quiz_questions drops ids from a non-enrolled subject and keeps enrolled ones', async () => {
    const c = clients['eg-rt'] as SupabaseClient
    const none = await c.rpc('get_quiz_questions', { p_question_ids: questionIds.slice(0, 2) })
    expect(none.error).toBeNull()
    expect(requireRpcRows(none.data, 'rt').length).toBe(0)

    const enrolled = await (clients['eg-ppl'] as SupabaseClient).rpc('get_quiz_questions', {
      p_question_ids: questionIds.slice(0, 2),
    })
    expect(requireRpcRows(enrolled.data, 'ppl').length).toBe(2)
  })

  async function startAndSave(): Promise<string> {
    const c = clients['eg-ppl'] as SupabaseClient
    const started = await c.rpc('start_practice_quiz', practiceArgs())
    expect(started.error).toBeNull()
    const sessionId = requireRpcResult<{ session_id: string }>(started.data, 'start').session_id
    expect(sessionId).toBeTruthy()
    const saved = await c.rpc('save_quiz_for_later', {
      p_session_id: sessionId,
      p_device_id: DEVICE,
    })
    expect(saved.error).toBeNull()
    return sessionId
  }

  async function rowOf(sessionId: string) {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('deleted_at, saved_at')
      .eq('id', sessionId)
      .single()
    if (error || !data) throw new Error(`rowOf: ${error?.message}`)
    return data
  }

  it('AC-R1: resume_saved_quiz raises not_enrolled after the course enrolment is soft-deleted and the row stays saved', async () => {
    const sid = ids['eg-ppl'] as string
    const sessionId = await startAndSave()
    expect((await rowOf(sessionId)).deleted_at).not.toBeNull()
    await setEnrolments(sid, orgId, [])
    try {
      const { error } = await (clients['eg-ppl'] as SupabaseClient).rpc('resume_saved_quiz', {
        p_session_id: sessionId,
        p_device_id: DEVICE,
      })
      expect(error?.message ?? '').toMatch(/not_enrolled/)
      expect((await rowOf(sessionId)).deleted_at).not.toBeNull()
    } finally {
      await setEnrolments(sid, orgId, [ppl])
    }
  })

  it('AC-R2: an enrolled student resumes a saved quiz and the row is live', async () => {
    const sessionId = await startAndSave()
    const { error } = await (clients['eg-ppl'] as SupabaseClient).rpc('resume_saved_quiz', {
      p_session_id: sessionId,
      p_device_id: DEVICE,
    })
    expect(error).toBeNull()
    const row = await rowOf(sessionId)
    expect(row.deleted_at).toBeNull()
    expect(row.saved_at).toBeNull()
  })

  it('AC-R4: an unenrolled student can still soft-delete a live session by saving it', async () => {
    const sid = ids['eg-ppl'] as string
    const started = await (clients['eg-ppl'] as SupabaseClient).rpc(
      'start_practice_quiz',
      practiceArgs(),
    )
    expect(started.error).toBeNull()
    const sessionId = requireRpcResult<{ session_id: string }>(started.data, 'start').session_id
    expect((await rowOf(sessionId)).deleted_at).toBeNull()
    await setEnrolments(sid, orgId, [])
    try {
      const { error } = await (clients['eg-ppl'] as SupabaseClient).rpc('save_quiz_for_later', {
        p_session_id: sessionId,
        p_device_id: DEVICE,
      })
      expect(error).toBeNull()
      expect((await rowOf(sessionId)).deleted_at).not.toBeNull()
    } finally {
      await setEnrolments(sid, orgId, [ppl])
    }
  })

  const emptyDrawArgs = (subjectId: string | null) => ({
    ...practiceArgs(),
    p_subject_id: subjectId,
    p_count: 500,
  })

  it('AC-P1: start_exam_session raises not_enrolled for a non-enrolled student on a subject without an exam config', async () => {
    const { data, error } = await (clients['eg-rt'] as SupabaseClient).rpc('start_exam_session', {
      p_subject_id: refsNoCfg.subjectId,
    })
    expect(data).toBeNull()
    expect(error?.message ?? '').toMatch(/not_enrolled/)
    expect(await sessionsOf(ids['eg-rt'] as string)).toEqual([])
  })

  it('AC-P2: start_discovery raises not_enrolled for a non-enrolled student on an empty draw', async () => {
    const { data, error } = await (clients['eg-rt'] as SupabaseClient).rpc(
      'start_discovery',
      emptyDrawArgs(refsNoCfg.subjectId),
    )
    expect(error?.message ?? '').toMatch(/not_enrolled/)
    expect(data).toBeNull()
    expect(await sessionsOf(ids['eg-rt'] as string)).toEqual([])
  })

  it('AC-P2: start_discovery with a NULL subject returns an empty result without error', async () => {
    const { data, error } = await (clients['eg-rt'] as SupabaseClient).rpc(
      'start_discovery',
      emptyDrawArgs(null),
    )
    expect(error).toBeNull()
    expect(
      requireRpcResult<{ session_id: string | null }>(data, 'null subject').session_id,
    ).toBeNull()
  })

  it('AC-P3: start_vfr_rt_exam_session raises not_enrolled for a non-enrolled student in an org without an RT exam config', async () => {
    const { data, error } = await (noCfgClients['egn-ppl'] as SupabaseClient).rpc(
      'start_vfr_rt_exam_session',
      { p_subject_id: rt.rtSubjectId },
    )
    expect(data).toBeNull()
    expect(error?.message ?? '').toMatch(/not_enrolled/)
  })

  it('AC-P4: start_internal_exam_session raises not_enrolled while another session is active and leaves the code unconsumed', async () => {
    const studentId = ids['eg-rt'] as string
    const { id, code } = await seedCode(studentId)
    const { error: insErr } = await admin.from('quiz_sessions').insert({
      organization_id: orgId,
      student_id: studentId,
      mode: 'quick_quiz',
      subject_id: refs.subjectId,
      config: { question_ids: questionIds.slice(0, 2) },
    })
    expect(insErr).toBeNull()
    const { error } = await (clients['eg-rt'] as SupabaseClient).rpc(
      'start_internal_exam_session',
      { p_code: code },
    )
    expect(error?.message ?? '').toMatch(/not_enrolled/)
    const { data } = await admin
      .from('internal_exam_codes')
      .select('consumed_at, consumed_session_id')
      .eq('id', id)
      .single()
    expect(data?.consumed_at).toBeNull()
    expect(data?.consumed_session_id).toBeNull()
  })

  it('AC-P5: an enrolled student keeps the missing-config error from start_exam_session', async () => {
    const { error } = await (clients['eg-ppl'] as SupabaseClient).rpc('start_exam_session', {
      p_subject_id: refsNoCfg.subjectId,
    })
    expect(error?.message ?? '').toMatch(/no exam configuration found for this subject/)
  })

  it('AC-P5: an enrolled student keeps the empty-draw result from start_discovery', async () => {
    const { data, error } = await (clients['eg-ppl'] as SupabaseClient).rpc(
      'start_discovery',
      emptyDrawArgs(refsNoCfg.subjectId),
    )
    expect(error).toBeNull()
    expect(
      requireRpcResult<{ session_id: string | null }>(data, 'empty draw').session_id,
    ).toBeNull()
  })

  it('AC-P5: an enrolled student keeps exam_config_required from start_vfr_rt_exam_session', async () => {
    const { error } = await (noCfgClients['egn-rt'] as SupabaseClient).rpc(
      'start_vfr_rt_exam_session',
      { p_subject_id: rt.rtSubjectId },
    )
    expect(error?.message ?? '').toMatch(/exam_config_required/)
  })

  it('AC-P5: an enrolled student keeps the active-session error from start_internal_exam_session', async () => {
    const studentId = ids['eg-ppl'] as string
    const { code } = await seedCode(studentId)
    const { error: insErr } = await admin.from('quiz_sessions').insert({
      organization_id: orgId,
      student_id: studentId,
      mode: 'quick_quiz',
      subject_id: refs.subjectId,
      config: { question_ids: questionIds.slice(0, 2) },
    })
    expect(insErr).toBeNull()
    const { error } = await (clients['eg-ppl'] as SupabaseClient).rpc(
      'start_internal_exam_session',
      { p_code: code },
    )
    expect(error?.message ?? '').toMatch(/another_session_active|active_session_exists/)
  })
})
