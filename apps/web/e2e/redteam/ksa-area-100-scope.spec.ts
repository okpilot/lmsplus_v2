/**
 * Red Team Spec — Area 100 KSA under ATPL_A (#1639, mig 20261028001200) + sub-topic exam rows.
 *   KS: a PPL_A + VFR_RT student reads 0 rows of subject 100 (easa_subjects / easa_topics /
 *       easa_subtopics / questions / exam_configs), get_quiz_questions returns 0 rows and
 *       start_exam_session raises not_enrolled.
 *   KT: upsert_exam_config accepts a subject-100 config whose rows name a subject-050 topic or a
 *       sub-topic of another 100 topic; start_exam_session draws no question outside the
 *       (subject, topic, sub-topic) of each row and writes no session.
 * CONTROL: an ATPL_A student reads 1 subject / 4 topics / 18 sub-topics / 22 questions, and a
 *   2-per-sub-topic config draws exactly 2 seeded questions from each 100-04 sub-topic.
 *
 * Status: Expected to PASS.
 */

import { expect, test } from '@playwright/test'
import { enrolStudent } from '@repo/db/enrol-students'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { upsertUser } from './helpers/seed-core'

const E2E_REDTEAM_KSA_MARKER = '[E2E_REDTEAM_KSA]'
const ORG_SLUG = 'redteam-ksa-org'
const ADMIN_EMAIL = 'redteam-ksa-admin@lmsplus.local'
const ADMIN_PASSWORD = 'redteam-ksa-admin-2026!'
const PPL_EMAIL = 'redteam-ksa-ppl@lmsplus.local'
const PPL_PASSWORD = 'redteam-ksa-ppl-2026!'
const ATPL_EMAIL = 'redteam-ksa-atpl@lmsplus.local'
const ATPL_PASSWORD = 'redteam-ksa-atpl-2026!'
const ATPL_COURSE_ID = 'c0a5e000-0000-4000-8000-000000000003'
const PER_SUBTOPIC = 2

type Ref = { id: string; code: string }

test.describe('Red Team: Area 100 KSA scope (KS, KT)', () => {
  test.setTimeout(120_000)

  let admin: ReturnType<typeof getAdminClient>
  let orgId: string
  let adminClient: SupabaseClient
  let ppl: SupabaseClient
  let atpl: SupabaseClient
  let atplId: string
  let pplId: string
  let subjectId: string
  let topics: Ref[] = []
  let mmTopic: Ref
  let mmSubtopics: Ref[] = []
  let otherSubtopic: Ref
  let allSubtopicIds: string[] = []
  let foreignTopicId: string
  const ksaQuestionIds = new Map<string, string[]>()
  let foreignQuestionIds: string[] = []

  const insertMc = async (
    bankId: string,
    subject: string,
    topic: string,
    subtopic: string | null,
    label: string,
  ): Promise<string[]> => {
    const rows = Array.from({ length: PER_SUBTOPIC }, (_, i) => ({
      organization_id: orgId,
      bank_id: bankId,
      subject_id: subject,
      topic_id: topic,
      subtopic_id: subtopic,
      question_text: `${E2E_REDTEAM_KSA_MARKER} ${label} ${i}?`,
      explanation_text: `${label} ${i}`,
      question_type: 'multiple_choice',
      options: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: `Option ${id} ${i}` })),
      correct_option_id: 'b',
      difficulty: 'medium',
      status: 'active',
      created_by: atplId,
    }))
    const { data, error } = await admin.from('questions').insert(rows).select('id')
    if (error || !data) throw new Error(`seed ${label}: ${error?.message}`)
    return data.map((r) => r.id as string)
  }

  const saveConfig = async (
    total: number,
    rows: { topic_id: string; subtopic_id: string | null; question_count: number }[],
  ) => {
    const { data, error } = await adminClient.rpc('upsert_exam_config', {
      p_subject_id: subjectId,
      p_enabled: true,
      p_total_questions: total,
      p_time_limit_seconds: 3600,
      p_pass_mark: 75,
      p_distributions: rows,
    })
    return { data, error }
  }

  const liveSessionCount = async (studentId: string): Promise<number> => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('id')
      .eq('student_id', studentId)
      .eq('subject_id', subjectId)
      .is('deleted_at', null)
    if (error) throw new Error(`sessions: ${error.message}`)
    return (data ?? []).length
  }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const { data: org, error: orgErr } = await admin
      .from('organizations')
      .upsert(
        { name: 'Red Team KSA Org', slug: ORG_SLUG, deleted_at: null },
        { onConflict: 'slug' },
      )
      .select('id')
      .single()
    if (orgErr || !org) throw new Error(`org: ${orgErr?.message}`)
    orgId = org.id as string

    const adminId = await upsertUser(admin, ADMIN_EMAIL, ADMIN_PASSWORD, orgId, 'admin')
    pplId = await upsertUser(admin, PPL_EMAIL, PPL_PASSWORD, orgId)
    atplId = await upsertUser(admin, ATPL_EMAIL, ATPL_PASSWORD, orgId)
    await enrolStudent(admin, { userId: atplId, orgId, courseIds: [ATPL_COURSE_ID] })
    const { data: pplAtpl, error: pplAtplErr } = await admin
      .from('course_enrolments')
      .select('id')
      .eq('user_id', pplId)
      .eq('course_id', ATPL_COURSE_ID)
      .is('deleted_at', null)
    if (pplAtplErr) throw new Error(`ppl enrolments: ${pplAtplErr.message}`)
    expect(pplAtpl ?? []).toHaveLength(0)

    const { data: subject, error: subjErr } = await admin
      .from('easa_subjects')
      .select('id, course_id')
      .eq('code', '100')
      .single()
    if (subjErr || !subject) throw new Error(`subject 100: ${subjErr?.message}`)
    expect(subject.course_id).toBe(ATPL_COURSE_ID)
    subjectId = subject.id as string

    const { data: t, error: tErr } = await admin
      .from('easa_topics')
      .select('id, code')
      .eq('subject_id', subjectId)
    if (tErr) throw new Error(`topics: ${tErr.message}`)
    topics = (t ?? []) as Ref[]
    expect(topics).toHaveLength(4)
    const mm = topics.find((x) => x.code === '100-04')
    const comms = topics.find((x) => x.code === '100-02')
    if (!mm || !comms) throw new Error('topics 100-02 / 100-04 not seeded')
    mmTopic = mm

    const { data: st, error: stErr } = await admin
      .from('easa_subtopics')
      .select('id, code, topic_id')
      .in(
        'topic_id',
        topics.map((x) => x.id),
      )
    if (stErr) throw new Error(`subtopics: ${stErr.message}`)
    const subs = (st ?? []) as (Ref & { topic_id: string })[]
    allSubtopicIds = subs.map((s) => s.id)
    expect(allSubtopicIds).toHaveLength(18)
    mmSubtopics = subs
      .filter((s) => s.topic_id === mm.id)
      .sort((a, b) => a.code.localeCompare(b.code))
    expect(mmSubtopics).toHaveLength(11)
    const other = subs.find((s) => s.code === '100-02-01')
    if (!other) throw new Error('subtopic 100-02-01 not seeded')
    otherSubtopic = other

    const { data: fs, error: fsErr } = await admin
      .from('easa_subjects')
      .select('id')
      .eq('code', '050')
      .single()
    if (fsErr || !fs) throw new Error(`050 subject: ${fsErr?.message}`)
    const { data: foreign, error: fErr } = await admin
      .from('easa_topics')
      .select('id')
      .eq('subject_id', fs.id)
      .order('code')
      .limit(1)
      .single()
    if (fErr || !foreign) throw new Error(`050 topic: ${fErr?.message}`)
    foreignTopicId = foreign.id as string

    const { data: bank, error: bankErr } = await admin
      .from('question_banks')
      .insert({
        organization_id: orgId,
        name: `${E2E_REDTEAM_KSA_MARKER} bank`,
        created_by: adminId,
      })
      .select('id')
      .single()
    if (bankErr || !bank) throw new Error(`bank: ${bankErr?.message}`)
    for (const s of mmSubtopics) {
      ksaQuestionIds.set(s.id, await insertMc(bank.id as string, subjectId, mm.id, s.id, s.code))
    }
    foreignQuestionIds = await insertMc(
      bank.id as string,
      fs.id as string,
      foreignTopicId,
      null,
      '050',
    )

    adminClient = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    ppl = await createAuthenticatedClient(PPL_EMAIL, PPL_PASSWORD)
    atpl = await createAuthenticatedClient(ATPL_EMAIL, ATPL_PASSWORD)
  })

  test.afterEach(async () => {
    const errors: string[] = []
    for (const email of [PPL_EMAIL, ATPL_EMAIL]) {
      try {
        await cleanupStudentActiveSessions(email)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    try {
      const { error } = await admin
        .from('exam_configs')
        .update({ deleted_at: new Date().toISOString() })
        .eq('organization_id', orgId)
        .eq('subject_id', subjectId)
        .is('deleted_at', null)
      if (error) throw new Error(`exam_configs: ${error.message}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  test.afterAll(async () => {
    if (!admin || !orgId) return
    const now = new Date().toISOString()
    const errors: string[] = []
    try {
      const { error } = await admin
        .from('questions')
        .update({ deleted_at: now })
        .eq('organization_id', orgId)
        .like('question_text', `${E2E_REDTEAM_KSA_MARKER}%`)
        .is('deleted_at', null)
      if (error) throw new Error(`questions: ${error.message}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      const { error } = await admin
        .from('question_banks')
        .update({ deleted_at: now })
        .eq('organization_id', orgId)
        .like('name', `${E2E_REDTEAM_KSA_MARKER}%`)
        .is('deleted_at', null)
      if (error) throw new Error(`question_banks: ${error.message}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  const allKsaIds = () => [...ksaQuestionIds.values()].flat()

  test('KS: a PPL_A + VFR_RT student reads nothing of subject 100; ATPL_A student reads it all', async () => {
    const saved = await saveConfig(
      PER_SUBTOPIC * mmSubtopics.length,
      mmSubtopics.map((s) => ({
        topic_id: mmTopic.id,
        subtopic_id: s.id,
        question_count: PER_SUBTOPIC,
      })),
    )
    expect(saved.error).toBeNull()

    const probe = async (c: SupabaseClient) => {
      const subj = await c.from('easa_subjects').select('id').eq('code', '100')
      const top = await c.from('easa_topics').select('id').eq('subject_id', subjectId)
      const sub = await c.from('easa_subtopics').select('id').in('id', allSubtopicIds)
      const q = await c.from('questions').select('id').in('id', allKsaIds())
      const cfg = await c.from('exam_configs').select('id').eq('subject_id', subjectId)
      const gq = await c.rpc('get_quiz_questions', { p_question_ids: allKsaIds() })
      for (const r of [subj, top, sub, q, cfg, gq]) expect(r.error).toBeNull()
      return [subj, top, sub, q, cfg, gq].map((r) => (r.data as unknown[] | null)?.length ?? 0)
    }

    expect(await probe(atpl)).toEqual([1, 4, 18, 22, 1, 22])
    expect(await probe(ppl)).toEqual([0, 0, 0, 0, 0, 0])

    const denied = await ppl.rpc('start_exam_session', { p_subject_id: subjectId })
    expect(denied.data).toBeNull()
    expect(denied.error?.message).toContain('not_enrolled')
    expect(await liveSessionCount(pplId)).toBe(0)
  })

  test('KT: rows naming a foreign topic or another topic sub-topic draw nothing outside their scope', async () => {
    const cases = [
      { label: '050 topic', row: { topic_id: foreignTopicId, subtopic_id: null } },
      {
        label: '100-02-01 under 100-04',
        row: { topic_id: mmTopic.id, subtopic_id: otherSubtopic.id },
      },
    ]
    for (const c of cases) {
      const saved = await saveConfig(PER_SUBTOPIC, [{ ...c.row, question_count: PER_SUBTOPIC }])
      expect(saved.error, c.label).toBeNull()
      const start = await atpl.rpc('start_exam_session', { p_subject_id: subjectId })
      expect(start.data, c.label).toBeNull()
      expect(start.error?.message, c.label).toContain('not enough active questions')
      expect(await liveSessionCount(atplId), c.label).toBe(0)
    }

    // CONTROL: a 2-per-sub-topic config draws exactly 2 seeded questions per 100-04 sub-topic.
    const total = PER_SUBTOPIC * mmSubtopics.length
    const saved = await saveConfig(
      total,
      mmSubtopics.map((s) => ({
        topic_id: mmTopic.id,
        subtopic_id: s.id,
        question_count: PER_SUBTOPIC,
      })),
    )
    expect(saved.error).toBeNull()
    const start = await atpl.rpc('start_exam_session', { p_subject_id: subjectId })
    expect(start.error).toBeNull()
    const drawn = (start.data as { question_ids: string[] }).question_ids
    expect(drawn).toHaveLength(total)
    expect(drawn.some((id) => foreignQuestionIds.includes(id))).toBe(false)
    for (const s of mmSubtopics) {
      const own = ksaQuestionIds.get(s.id) ?? []
      expect(
        drawn.filter((id) => own.includes(id)),
        s.code,
      ).toHaveLength(PER_SUBTOPIC)
    }
    expect(await liveSessionCount(atplId)).toBe(1)
  })
})
