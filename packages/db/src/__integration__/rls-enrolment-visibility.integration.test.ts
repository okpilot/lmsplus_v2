import { execFileSync } from 'node:child_process'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { seedQuestions, seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'
import { ensureBank, getRtRefs, insertMcQuestion } from './vfr-rt-helpers'

/** Enrolment-scoped visibility of easa_* and questions (#1637, AC1-AC3, AC7-AC9). */

function psql(sql: string): { out: string; err: string } {
  try {
    const out = execFileSync(
      'psql',
      ['-h', 'localhost', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-tA', '-q'],
      {
        input: sql,
        encoding: 'utf8',
        env: { ...process.env, PGPASSWORD: 'postgres' },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )
    return { out: out.trim().split('\n').pop() ?? '', err: '' }
  } catch (e) {
    const stderr = (e as { stderr?: Buffer | string }).stderr
    return { out: '', err: String(stderr ?? e) }
  }
}

function asUser(userId: string, query: string): string {
  return `BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"${userId}","role":"authenticated"}', true) \\g /dev/null
${query};
COMMIT;`
}

describe('RLS: enrolment-scoped easa_* and questions visibility', () => {
  const admin = getAdminClient()
  const suffix = fixtureSuffix()
  const pw = 'test-pass-123'

  let orgId: string
  let rtSubjectId: string
  let rtP3TopicId: string
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  let pplQuestionIds: string[]
  let rtQuestionId: string
  let ppl: string
  let vfr: string
  const userIds: string[] = []
  const ids: Record<string, string> = {}
  const clients: Record<string, SupabaseClient> = {}

  async function setEnrolments(userId: string, courseIds: string[]) {
    const { error: delErr } = await admin
      .from('course_enrolments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('deleted_at', null)
    if (delErr) throw new Error(`setEnrolments clear: ${delErr.message}`)
    if (courseIds.length === 0) return
    const { error } = await admin
      .from('course_enrolments')
      .insert(courseIds.map((c) => ({ organization_id: orgId, user_id: userId, course_id: c })))
    if (error) throw new Error(`setEnrolments insert: ${error.message}`)
  }

  async function mk(tag: string, role: 'admin' | 'instructor' | 'student', courses: string[]) {
    const email = `${tag}-${suffix}@test.local`
    const id = await createTestUser({ admin, orgId, email, password: pw, role })
    userIds.push(id)
    await setEnrolments(id, courses)
    ids[tag] = id
    clients[tag] = await getAuthenticatedClient({ email, password: pw })
  }

  beforeAll(async () => {
    orgId = await createTestOrg({ admin, name: `Enrol Vis ${suffix}`, slug: `enrol-vis-${suffix}` })
    const { data: courses } = await admin.from('courses').select('id, code')
    const byCode = Object.fromEntries(
      (courses ?? []).map((c) => [c.code as string, c.id as string]),
    )
    ppl = byCode.PPL_A as string
    vfr = byCode.VFR_RT as string

    await mk('ev-admin', 'admin', [])
    await mk('ev-instr', 'instructor', [])
    await mk('ev-ppl', 'student', [ppl])
    await mk('ev-none', 'student', [])
    await mk('ev-deact', 'student', [ppl])

    refs = await seedReferenceData({
      admin,
      subjectCode: `EV${suffix}`,
      subjectName: `Enrol Vis ${suffix}`,
      topicCode: `EV${suffix}-01`,
      topicName: `Enrol Vis Topic ${suffix}`,
      subtopicCode: `EV${suffix}-01.01`,
      subtopicName: `Enrol Vis Subtopic ${suffix}`,
    })
    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: ids['ev-admin'] as string,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      subtopicId: refs.subtopicId,
      count: 3,
    })
    pplQuestionIds = seeded.questionIds

    const rt = await getRtRefs()
    rtSubjectId = rt.rtSubjectId
    rtP3TopicId = rt.p3TopicId
    const bankId = await ensureBank(orgId, ids['ev-admin'] as string)
    rtQuestionId = await insertMcQuestion({
      orgId,
      bankId,
      adminId: ids['ev-admin'] as string,
      rtSubjectId,
      p3TopicId: rtP3TopicId,
      idx: 900,
    })
  })

  afterAll(async () => {
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupReferenceData({ admin, refs: [refs] })
  })

  async function ids_(client: SupabaseClient, table: string, col: string, eq?: [string, string]) {
    let q = client.from(table).select(col)
    if (eq) q = q.eq(eq[0], eq[1])
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    return (data ?? []) as unknown as Array<Record<string, string>>
  }

  it('AC1: a PPL-only student sees no RT subject, topic, subtopic or question', async () => {
    const c = clients['ev-ppl'] as SupabaseClient
    // Non-vacuity: the RT rows exist for the service role.
    const { count } = await admin
      .from('easa_subtopics')
      .select('id', { count: 'exact', head: true })
      .eq('topic_id', rtP3TopicId)
    expect(count).toBeGreaterThan(0)

    expect((await ids_(c, 'easa_subjects', 'id')).map((r) => r.id)).not.toContain(rtSubjectId)
    expect(await ids_(c, 'easa_topics', 'id', ['subject_id', rtSubjectId])).toEqual([])
    expect(await ids_(c, 'easa_subtopics', 'id', ['topic_id', rtP3TopicId])).toEqual([])
    expect(await ids_(c, 'questions', 'id', ['subject_id', rtSubjectId])).toEqual([])
  })

  it('AC1: a PPL-only student still sees the PPL subject, topic, subtopic and questions', async () => {
    const c = clients['ev-ppl'] as SupabaseClient
    expect((await ids_(c, 'easa_subjects', 'id')).map((r) => r.id)).toContain(refs.subjectId)
    expect((await ids_(c, 'easa_topics', 'id', ['subject_id', refs.subjectId])).length).toBe(1)
    expect((await ids_(c, 'easa_subtopics', 'id', ['topic_id', refs.topicId])).length).toBe(1)
    const qs = await ids_(c, 'questions', 'id', ['subject_id', refs.subjectId])
    expect(qs.map((r) => r.id).sort()).toEqual([...pplQuestionIds].sort())
  })

  it('AC2: a student with no enrolments sees 0 rows in all four tables', async () => {
    const c = clients['ev-none'] as SupabaseClient
    expect(await ids_(c, 'easa_subjects', 'id')).toEqual([])
    expect(await ids_(c, 'easa_topics', 'id')).toEqual([])
    expect(await ids_(c, 'easa_subtopics', 'id')).toEqual([])
    expect(await ids_(c, 'questions', 'id')).toEqual([])
  })

  it.each(['ev-admin', 'ev-instr'])(
    'AC3: %s with no enrolments sees every subject, topic, subtopic and the org questions',
    async (tag) => {
      const c = clients[tag] as SupabaseClient
      const subjects = (await ids_(c, 'easa_subjects', 'id')).map((r) => r.id)
      expect(subjects).toContain(refs.subjectId)
      expect(subjects).toContain(rtSubjectId)
      expect(
        (await ids_(c, 'easa_topics', 'id', ['subject_id', rtSubjectId])).length,
      ).toBeGreaterThan(0)
      expect(
        (await ids_(c, 'easa_subtopics', 'id', ['topic_id', rtP3TopicId])).length,
      ).toBeGreaterThan(0)
      expect(
        (await ids_(c, 'questions', 'id', ['subject_id', rtSubjectId])).map((r) => r.id),
      ).toEqual([rtQuestionId])
      expect((await ids_(c, 'questions', 'id', ['subject_id', refs.subjectId])).length).toBe(
        pplQuestionIds.length,
      )
    },
  )

  it('AC7: accessible_subject_ids() is empty for a deactivated student with a live token', async () => {
    const id = ids['ev-deact'] as string
    const probe = asUser(id, 'SELECT count(*) FROM private.accessible_subject_ids()')
    const active = psql(probe)
    expect(active.err).toBe('')
    expect(Number(active.out)).toBeGreaterThan(0)

    const { error } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    expect(error).toBeNull()

    const deactivated = psql(probe)
    expect(deactivated.err).toBe('')
    expect(deactivated.out).toBe('0')
  })

  it('AC8: an admin cannot UPDATE easa_subjects.course_id (42501)', async () => {
    const c = clients['ev-admin'] as SupabaseClient
    const { error } = await c
      .from('easa_subjects')
      .update({ course_id: vfr })
      .eq('id', refs.subjectId)
    expect(error?.code).toBe('42501')
    const { data } = await admin
      .from('easa_subjects')
      .select('course_id')
      .eq('id', refs.subjectId)
      .single()
    expect(data?.course_id).toBe(ppl)
  })

  it('AC8: an admin cannot INSERT easa_subjects with course_id (42501)', async () => {
    const c = clients['ev-admin'] as SupabaseClient
    const code = `EVC${suffix}`
    const { error } = await c
      .from('easa_subjects')
      .insert({ code, name: 'x', short: 'x', sort_order: 99, course_id: vfr })
    expect(error?.code).toBe('42501')
    await admin.from('easa_subjects').delete().eq('code', code)
  })

  it('AC8: an admin can still UPDATE name/code/short/sort_order and INSERT without course_id', async () => {
    const c = clients['ev-admin'] as SupabaseClient
    const upd = await c
      .from('easa_subjects')
      .update({ name: `Renamed ${suffix}`, short: 'EVR', sort_order: 7 })
      .eq('id', refs.subjectId)
      .select('id')
    expect(upd.error).toBeNull()
    expect(upd.data?.length).toBe(1)

    const code = `EVI${suffix}`
    const ins = await c
      .from('easa_subjects')
      .insert({ code, name: 'ins', short: 'ins', sort_order: 98 })
      .select('id, course_id')
      .single()
    expect(ins.error).toBeNull()
    expect(ins.data?.course_id).toBe(ppl)
    await admin.from('easa_subjects').delete().eq('code', code)
  })

  it('AC9: anon cannot EXECUTE private.accessible_subject_ids(), authenticated can', () => {
    const r =
      psql(`SELECT has_function_privilege('anon', 'private.accessible_subject_ids()', 'EXECUTE')::int
  || '|' || has_function_privilege('authenticated', 'private.accessible_subject_ids()', 'EXECUTE')::int`)
    expect(r.err).toBe('')
    expect(r.out).toBe('0|1')
  })
})
