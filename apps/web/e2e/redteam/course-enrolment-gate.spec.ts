/**
 * Red Team Spec — course enrolment gate (#1637, migs 20261028000100–20261028000300).
 * A student enrolled in VFR_RT only (PPL_A enrolment soft-deleted) attacks PPL subject 050:
 *   KI: direct PostgREST reads of easa_subjects / easa_topics / easa_subtopics / questions and a
 *       direct `_filtered_question_pool` call (SECURITY INVOKER) return 0 rows.
 *   KJ: `get_quiz_questions` (SECURITY DEFINER) with PPL question ids returns 0 rows.
 *   KK: `start_quiz_session('smart_review', NULL subject, PPL ids)` and `start_discovery` (returns
 *       correct_option_id) raise `not_enrolled`; no session row is written.
 *   KL: `resume_saved_quiz` on a saved PPL session raises `not_enrolled`; the row stays deleted.
 * CONTROL: a student enrolled in PPL_A + VFR_RT performs each call successfully.
 *
 * Status: Expected to PASS.
 */

import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { getEgmontOrgId, upsertUser } from './helpers/seed-core'
import { cleanupVfrRtPool, seedVfrRtPool } from './helpers/seed-vfr-rt-pool'

const E2E_REDTEAM_ENROL_MARKER = '[E2E_REDTEAM_ENROL]'
const RT_ONLY_EMAIL = 'redteam-enrol-rt-only@lmsplus.local'
const RT_ONLY_PASSWORD = 'redteam-enrol-rt-only-2026!'
const FULL_EMAIL = 'redteam-enrol-full@lmsplus.local'
const FULL_PASSWORD = 'redteam-enrol-full-2026!'
const PPL_COURSE_ID = 'c0a5e000-0000-4000-8000-000000000001'
const VFR_RT_COURSE_ID = 'c0a5e000-0000-4000-8000-000000000002'

test.describe('Red Team: course enrolment gate (KI-KL)', () => {
  test.setTimeout(120_000)

  let admin: ReturnType<typeof getAdminClient>
  let orgId: string
  let rtOnlyId: string
  let fullId: string
  let rtOnly: SupabaseClient
  let full: SupabaseClient
  let pplSubjectId: string
  let rtSubjectId: string
  let pplTopicIds: string[] = []
  let pplQuestionIds: string[] = []
  let rtQuestionIds: string[] = []
  let pool: Awaited<ReturnType<typeof seedVfrRtPool>> | undefined
  const seededSessionIds = new Set<string>()

  const liveEnrolments = async (userId: string): Promise<string[]> => {
    const { data, error } = await admin
      .from('course_enrolments')
      .select('course_id')
      .eq('user_id', userId)
      .is('deleted_at', null)
    if (error) throw new Error(`enrolments: ${error.message}`)
    return (data ?? []).map((r) => r.course_id as string).sort()
  }

  const liveSessions = async (userId: string): Promise<number> => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('id')
      .eq('student_id', userId)
      .is('deleted_at', null)
    if (error) throw new Error(`live sessions: ${error.message}`)
    return (data ?? []).length
  }

  const seedSavedSession = async (studentId: string): Promise<string> => {
    const now = new Date().toISOString()
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode: 'quick_quiz',
        subject_id: pplSubjectId,
        total_questions: pplQuestionIds.length,
        config: { question_ids: pplQuestionIds, e2e_marker: E2E_REDTEAM_ENROL_MARKER },
        deleted_at: now,
        saved_at: now,
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`seed saved session: ${error?.message}`)
    seededSessionIds.add(data.id)
    return data.id
  }

  test.beforeAll(async () => {
    admin = getAdminClient()
    orgId = await getEgmontOrgId(admin)
    rtOnlyId = await upsertUser(admin, RT_ONLY_EMAIL, RT_ONLY_PASSWORD, orgId)
    fullId = await upsertUser(admin, FULL_EMAIL, FULL_PASSWORD, orgId)
    // seed-e2e.ts seeds no RT question; the RT control arm needs RT multiple_choice rows.
    pool = await seedVfrRtPool({ admin, orgId, adminUserId: fullId })

    const { error: unenrolErr } = await admin
      .from('course_enrolments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', rtOnlyId)
      .eq('course_id', PPL_COURSE_ID)
      .is('deleted_at', null)
    if (unenrolErr) throw new Error(`unenrol PPL: ${unenrolErr.message}`)
    expect(await liveEnrolments(rtOnlyId)).toEqual([VFR_RT_COURSE_ID])
    expect(await liveEnrolments(fullId)).toEqual([PPL_COURSE_ID, VFR_RT_COURSE_ID].sort())

    const { data: subjects, error: subjErr } = await admin
      .from('easa_subjects')
      .select('id, code, course_id')
      .in('code', ['050', 'RT'])
    if (subjErr) throw new Error(`subjects: ${subjErr.message}`)
    const ppl = subjects?.find((s) => s.code === '050')
    const rt = subjects?.find((s) => s.code === 'RT')
    if (!ppl || !rt) throw new Error('subjects 050 / RT not seeded')
    expect(ppl.course_id).toBe(PPL_COURSE_ID)
    expect(rt.course_id).toBe(VFR_RT_COURSE_ID)
    pplSubjectId = ppl.id
    rtSubjectId = rt.id

    const { data: topics, error: topicErr } = await admin
      .from('easa_topics')
      .select('id')
      .eq('subject_id', pplSubjectId)
    if (topicErr) throw new Error(`topics: ${topicErr.message}`)
    pplTopicIds = (topics ?? []).map((t) => t.id as string)
    expect(pplTopicIds.length).toBeGreaterThan(0)

    const pick = async (subjectId: string) => {
      const { data, error } = await admin
        .from('questions')
        .select('id')
        .eq('organization_id', orgId)
        .eq('subject_id', subjectId)
        .eq('status', 'active')
        .eq('question_type', 'multiple_choice')
        .is('deleted_at', null)
        .order('id')
        .limit(3)
      if (error) throw new Error(`questions: ${error.message}`)
      return (data ?? []).map((q) => q.id as string)
    }
    pplQuestionIds = await pick(pplSubjectId)
    rtQuestionIds = await pick(rtSubjectId)
    expect(pplQuestionIds).toHaveLength(3)
    expect(rtQuestionIds.length).toBeGreaterThan(0)

    rtOnly = await createAuthenticatedClient(RT_ONLY_EMAIL, RT_ONLY_PASSWORD)
    full = await createAuthenticatedClient(FULL_EMAIL, FULL_PASSWORD)
  })

  test.afterAll(async () => {
    if (admin && orgId) await cleanupVfrRtPool({ admin, orgId, pool })
  })

  test.afterEach(async () => {
    const errors: string[] = []
    for (const email of [RT_ONLY_EMAIL, FULL_EMAIL]) {
      try {
        await cleanupStudentActiveSessions(email)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    try {
      if (seededSessionIds.size > 0) {
        const { error } = await admin
          .from('quiz_sessions')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', [...seededSessionIds])
          .is('deleted_at', null)
        if (error) throw new Error(`soft-delete seeded sessions: ${error.message}`)
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      seededSessionIds.clear()
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  const reads = async (client: SupabaseClient) => {
    const [s, t, st, q, pool] = await Promise.all([
      client.from('easa_subjects').select('id').eq('id', pplSubjectId),
      client.from('easa_topics').select('id').eq('subject_id', pplSubjectId),
      client.from('easa_subtopics').select('id').in('topic_id', pplTopicIds),
      client.from('questions').select('id').eq('subject_id', pplSubjectId),
      client.rpc('_filtered_question_pool', {
        p_subject_id: pplSubjectId,
        p_topic_ids: pplTopicIds,
        p_subtopic_ids: [],
        p_filters: [],
      }),
    ])
    for (const r of [s, t, st, q, pool]) expect(r.error).toBeNull()
    const n = (d: unknown) => (Array.isArray(d) ? d.length : -1)
    return {
      subjects: n(s.data),
      topics: n(t.data),
      subtopics: n(st.data),
      questions: n(q.data),
      pool: n(pool.data),
    }
  }

  test('KI: non-enrolled student reads no PPL subject, topic, subtopic, question or pool id', async () => {
    const own = await rtOnly.from('easa_subjects').select('id').eq('id', rtSubjectId)
    expect(own.error).toBeNull()
    expect(own.data).toHaveLength(1)

    const control = await reads(full)
    expect(control.subjects).toBe(1)
    expect(control.topics).toBeGreaterThan(0)
    expect(control.subtopics).toBeGreaterThan(0)
    expect(control.questions).toBeGreaterThan(0)
    expect(control.pool).toBeGreaterThan(0)

    expect(await reads(rtOnly)).toEqual({
      subjects: 0,
      topics: 0,
      subtopics: 0,
      questions: 0,
      pool: 0,
    })
  })

  test('KJ: get_quiz_questions returns no PPL question to a non-enrolled student', async () => {
    const control = await full.rpc('get_quiz_questions', { p_question_ids: pplQuestionIds })
    expect(control.error).toBeNull()
    expect((control.data ?? []).map((r: { id: string }) => r.id).sort()).toEqual(
      [...pplQuestionIds].sort(),
    )

    const ownCourse = await rtOnly.rpc('get_quiz_questions', { p_question_ids: rtQuestionIds })
    expect(ownCourse.error).toBeNull()
    expect(ownCourse.data ?? []).toHaveLength(rtQuestionIds.length)

    const attack = await rtOnly.rpc('get_quiz_questions', {
      p_question_ids: [...pplQuestionIds, ...rtQuestionIds],
    })
    expect(attack.error).toBeNull()
    expect((attack.data ?? []).map((r: { id: string }) => r.id).sort()).toEqual(
      [...rtQuestionIds].sort(),
    )
  })

  test('KK: start_quiz_session smart_review with PPL ids and a NULL subject raises not_enrolled', async () => {
    const args = {
      p_mode: 'smart_review',
      p_subject_id: null,
      p_topic_id: null,
      p_question_ids: pplQuestionIds,
    }
    const control = await full.rpc('start_quiz_session', args)
    expect(control.error).toBeNull()
    expect(typeof control.data).toBe('string')
    expect(await liveSessions(fullId)).toBe(1)

    expect(await liveSessions(rtOnlyId)).toBe(0)
    const attack = await rtOnly.rpc('start_quiz_session', args)
    expect(attack.data).toBeNull()
    expect(attack.error?.message).toBe('not_enrolled')
    expect(await liveSessions(rtOnlyId)).toBe(0)
  })

  test('KK: start_discovery on a PPL subject raises not_enrolled and returns no answer key', async () => {
    const args = {
      p_subject_id: pplSubjectId,
      p_topic_ids: pplTopicIds,
      p_subtopic_ids: [],
      p_count: 3,
      p_filters: [],
    }
    const control = await full.rpc('start_discovery', args)
    expect(control.error).toBeNull()
    const payload = control.data as { session_id: string | null; questions: unknown[] }
    expect(typeof payload.session_id).toBe('string')
    expect(payload.questions.length).toBeGreaterThan(0)
    expect(payload.questions[0]).toHaveProperty('correct_option_id')

    expect(await liveSessions(rtOnlyId)).toBe(0)
    const attack = await rtOnly.rpc('start_discovery', args)
    expect(attack.data).toBeNull()
    expect(attack.error?.message).toBe('not_enrolled')
    expect(await liveSessions(rtOnlyId)).toBe(0)
  })

  test('KL: resume_saved_quiz on a saved PPL session raises not_enrolled and leaves it deleted', async () => {
    const controlId = await seedSavedSession(fullId)
    const control = await full.rpc('resume_saved_quiz', {
      p_session_id: controlId,
      p_device_id: randomUUID(),
    })
    expect(control.error).toBeNull()
    const revived = await admin.from('quiz_sessions').select('deleted_at').eq('id', controlId)
    expect(revived.error).toBeNull()
    expect(revived.data).toEqual([{ deleted_at: null }])

    const victimId = await seedSavedSession(rtOnlyId)
    const attack = await rtOnly.rpc('resume_saved_quiz', {
      p_session_id: victimId,
      p_device_id: randomUUID(),
    })
    expect(attack.error?.message).toBe('not_enrolled')
    const after = await admin
      .from('quiz_sessions')
      .select('deleted_at, saved_at')
      .eq('id', victimId)
    expect(after.error).toBeNull()
    expect(after.data).toHaveLength(1)
    expect(after.data?.[0]?.deleted_at).not.toBeNull()
    expect(after.data?.[0]?.saved_at).not.toBeNull()
  })
})
