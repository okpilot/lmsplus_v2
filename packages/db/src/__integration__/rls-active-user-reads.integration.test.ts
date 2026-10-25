import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fixtureSuffix } from './fixture-suffix'
import { insertSession, type ProgressFixture, setupProgressFixture } from './quiz-progress-fixture'
import { createTestUser, getAuthenticatedClient } from './setup'

/**
 * #1607 / #1258: a deactivated user (users.deleted_at set) whose JWT is still
 * unexpired must read no student-owned rows. Each deactivated-arm negative is
 * paired with an active control on the same client.
 */
const PASSWORD = 'test-pass-123'
const DEVICE = '11111111-1111-4111-8111-111111111111'

const OWNED_TABLES = [
  'quiz_sessions',
  'student_responses',
  'quiz_session_answers',
  'quiz_session_progress',
  'quiz_drafts',
  'flagged_questions',
  'fsrs_cards',
  'user_consents',
  'audit_events',
] as const

describe('RLS: student-owned reads require an active user', () => {
  let f: ProgressFixture
  let instructorId: string
  let instructor: SupabaseClient
  let sessionId: string
  const suffix = fixtureSuffix()

  async function setDeactivated(userId: string, deactivated: boolean) {
    const { error } = await f.admin
      .from('users')
      .update({ deleted_at: deactivated ? new Date().toISOString() : null })
      .eq('id', userId)
    expect(error).toBeNull()
  }

  async function seedOk(label: string, step: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await step
    expect(error?.message, `seed ${label}`).toBeUndefined()
  }

  beforeAll(async () => {
    f = await setupProgressFixture('actread')
    instructorId = await createTestUser({
      admin: f.admin,
      orgId: f.orgId,
      email: `instructor-actread-${suffix}@test.local`,
      password: PASSWORD,
      role: 'instructor',
    })
    instructor = await getAuthenticatedClient({
      email: `instructor-actread-${suffix}@test.local`,
      password: PASSWORD,
    })

    // Finished session with a score (feeds streak/profile stats), plus one row per owned table.
    sessionId = await insertSession({ f, mode: 'mock_exam', questionIds: f.mcIds.slice(0, 2) })
    await seedOk(
      'session finish',
      f.admin
        .from('quiz_sessions')
        .update({ ended_at: new Date().toISOString(), score_percentage: 100, correct_count: 1 })
        .eq('id', sessionId),
    )
    const q = f.mcIds[0]!
    await seedOk(
      'student_responses',
      f.admin.from('student_responses').insert({
        organization_id: f.orgId,
        student_id: f.studentId,
        question_id: q,
        session_id: sessionId,
        selected_option_id: 'a',
        is_correct: true,
        response_time_ms: 1000,
      }),
    )
    await seedOk(
      'quiz_session_answers',
      f.admin.from('quiz_session_answers').insert({
        session_id: sessionId,
        question_id: q,
        selected_option_id: 'a',
        is_correct: true,
        response_time_ms: 1000,
      }),
    )
    await seedOk(
      'quiz_session_progress',
      f.admin
        .from('quiz_session_progress')
        .insert({ session_id: sessionId, question_id: q, student_id: f.studentId }),
    )
    await seedOk(
      'quiz_drafts',
      f.admin
        .from('quiz_drafts')
        .insert({ student_id: f.studentId, organization_id: f.orgId, question_ids: [q] }),
    )
    await seedOk(
      'flagged_questions',
      f.admin.from('flagged_questions').insert({ student_id: f.studentId, question_id: q }),
    )
    await seedOk(
      'fsrs_cards',
      f.admin.from('fsrs_cards').insert({ student_id: f.studentId, question_id: q }),
    )
    await seedOk(
      'user_consents',
      f.admin.from('user_consents').insert({
        user_id: f.studentId,
        document_type: 'terms_of_service',
        document_version: 'v1',
        accepted: true,
      }),
    )
    await seedOk(
      'audit_events',
      f.admin.from('audit_events').insert({
        organization_id: f.orgId,
        actor_id: f.studentId,
        actor_role: 'student',
        event_type: 'login',
        resource_type: 'user',
      }),
    )
  })

  afterAll(async () => {
    const steps: Array<[string, PromiseLike<{ error: { message: string } | null }>]> = [
      ['restore student', f.admin.from('users').update({ deleted_at: null }).eq('id', f.studentId)],
      [
        'restore instructor',
        f.admin.from('users').update({ deleted_at: null }).eq('id', instructorId),
      ],
      ['progress', f.admin.from('quiz_session_progress').delete().eq('student_id', f.studentId)],
      ['drafts', f.admin.from('quiz_drafts').delete().eq('student_id', f.studentId)],
      ['flags', f.admin.from('flagged_questions').delete().eq('student_id', f.studentId)],
      ['consents', f.admin.from('user_consents').delete().eq('user_id', f.studentId)],
    ]
    const errors: string[] = []
    for (const [label, step] of steps) {
      const { error } = await step
      if (error) errors.push(`${label}: ${error.message}`)
    }
    await f.admin.from('users').delete().eq('id', instructorId)
    await f.admin.auth.admin.deleteUser(instructorId)
    await f.teardown()
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  // AC4 (also AC2: helper true while active, false after deactivation)
  describe('AC4: student-owned tables', () => {
    it.each(OWNED_TABLES)(
      '%s: own row visible while active, hidden once deactivated',
      async (table) => {
        await setDeactivated(f.studentId, false)
        const active = await f.student.from(table).select('*')
        expect(active.error).toBeNull()
        expect(active.data?.length ?? 0, `${table} active control`).toBeGreaterThanOrEqual(1)

        await setDeactivated(f.studentId, true)
        const gone = await f.student.from(table).select('*')
        expect(gone.error).toBeNull()
        expect(gone.data, `${table} deactivated`).toEqual([])
      },
    )
  })

  // AC5
  describe('AC5: #1258 RPCs', () => {
    it('get_student_streak: data while active, zero after deactivation', async () => {
      await setDeactivated(f.studentId, false)
      const active = await f.student.rpc('get_student_streak')
      expect(active.error).toBeNull()
      const row = (active.data as Array<{ current_streak: number; best_streak: number }>)[0]
      expect(row?.best_streak).toBeGreaterThanOrEqual(1)

      await setDeactivated(f.studentId, true)
      const gone = await f.student.rpc('get_student_streak')
      expect(gone.error).toBeNull()
      expect(gone.data).toEqual([{ current_streak: 0, best_streak: 0 }])
    })

    it('get_student_mastery_stats: correct counts while active, none after deactivation', async () => {
      await setDeactivated(f.studentId, false)
      const active = await f.student.rpc('get_student_mastery_stats')
      expect(active.error).toBeNull()
      const rows = active.data as Array<{ correct: number | string }>
      expect(rows.some((r) => Number(r.correct) >= 1)).toBe(true)

      await setDeactivated(f.studentId, true)
      const gone = await f.student.rpc('get_student_mastery_stats')
      expect(gone.error).toBeNull()
      expect(
        (gone.data as Array<{ correct: number | string }>).filter((r) => Number(r.correct) > 0),
      ).toEqual([])
    })

    it('get_student_last_practiced: rows while active, empty after deactivation', async () => {
      await setDeactivated(f.studentId, false)
      const active = await f.student.rpc('get_student_last_practiced')
      expect(active.error).toBeNull()
      expect((active.data as unknown[]).length).toBeGreaterThanOrEqual(1)

      await setDeactivated(f.studentId, true)
      const gone = await f.student.rpc('get_student_last_practiced')
      expect(gone.error).toBeNull()
      expect(gone.data).toEqual([])
    })

    it('get_student_profile_stats: sessions counted while active, zero after deactivation', async () => {
      await setDeactivated(f.studentId, false)
      const active = await f.student.rpc('get_student_profile_stats')
      expect(active.error).toBeNull()
      const row = (active.data as Array<{ total_sessions: number | string }>)[0]
      expect(Number(row?.total_sessions)).toBeGreaterThanOrEqual(1)

      await setDeactivated(f.studentId, true)
      const gone = await f.student.rpc('get_student_profile_stats')
      expect(gone.error).toBeNull()
      const goneRow = (gone.data as Array<{ total_sessions: number | string }>)[0]
      expect(Number(goneRow?.total_sessions ?? 0)).toBe(0)
    })

    // Regression pin: already true via questions.tenant_isolation; passes before execute.
    it('question-bank RPCs return nothing for a deactivated caller (regression pin)', async () => {
      await setDeactivated(f.studentId, false)
      const counts = await f.student.rpc('get_question_counts', { p_status: 'active' })
      expect(counts.error).toBeNull()
      expect((counts.data as unknown[]).length).toBeGreaterThanOrEqual(1)

      await setDeactivated(f.studentId, true)
      const gone = await f.student.rpc('get_question_counts', { p_status: 'active' })
      expect(gone.error).toBeNull()
      expect(gone.data).toEqual([])

      const filtered = await f.student.rpc('get_filtered_question_counts', {
        p_subject_id: null,
        p_topic_ids: null,
        p_subtopic_ids: null,
        p_filters: [],
        p_calc_mode: 'all',
      })
      expect(filtered.error).toBeNull()
      expect(filtered.data).toEqual([])

      const random = await f.student.rpc('get_random_question_ids', {
        p_subject_id: null,
        p_topic_ids: null,
        p_subtopic_ids: null,
        p_count: 5,
        p_filters: [],
        p_calc_mode: 'all',
      })
      expect(random.error).toBeNull()
      expect(random.data).toEqual([])
    })
  })

  // AC6: regression pin; passes before execute.
  it('AC6: deactivated caller is refused by claim/save_answer/save_position (regression pin)', async () => {
    await setDeactivated(f.studentId, false)
    const { data: sid, error: startErr } = await f.student.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: null,
      p_topic_id: null,
      p_question_ids: f.mcIds.slice(0, 3),
    })
    expect(startErr).toBeNull()
    await setDeactivated(f.studentId, true)

    const answer = await f.student.rpc('save_quiz_answer', {
      p_session_id: sid,
      p_question_id: f.mcIds[1],
      p_answer: { selected_option_id: 'a' },
      p_time_spent_ms: 1000,
      p_device_id: DEVICE,
    })
    expect(answer.error?.message, 'save_quiz_answer').toContain('user_not_found_or_inactive')
    const position = await f.student.rpc('save_quiz_position', {
      p_session_id: sid,
      p_current_index: 1,
      p_pinned_question_ids: [],
      p_device_id: DEVICE,
    })
    expect(position.error?.message, 'save_quiz_position').toContain('user_not_found_or_inactive')
    const claim = await f.student.rpc('claim_quiz_session', {
      p_session_id: sid,
      p_device_id: DEVICE,
    })
    expect(claim.error?.message, 'claim_quiz_session').toContain('user_not_found_or_inactive')
  })

  // AC7
  describe('AC7: instructor reads', () => {
    it('active instructor reads org student sessions and responses; deactivated reads none', async () => {
      await setDeactivated(instructorId, false)
      const sessions = await instructor.from('quiz_sessions').select('id').eq('id', sessionId)
      expect(sessions.error).toBeNull()
      expect(sessions.data).toHaveLength(1)
      const responses = await instructor
        .from('student_responses')
        .select('id')
        .eq('student_id', f.studentId)
      expect(responses.error).toBeNull()
      expect(responses.data?.length).toBeGreaterThanOrEqual(1)

      await setDeactivated(instructorId, true)
      const goneSessions = await instructor.from('quiz_sessions').select('id')
      expect(goneSessions.error).toBeNull()
      expect(goneSessions.data).toEqual([])
      const goneResponses = await instructor.from('student_responses').select('id')
      expect(goneResponses.error).toBeNull()
      expect(goneResponses.data).toEqual([])
    })
  })

  // AC8
  it('AC8: active student reads own session through SECURITY DEFINER get_quiz_progress', async () => {
    await setDeactivated(f.studentId, false)
    const { data, error } = await f.student.rpc('get_quiz_progress', { p_session_id: sessionId })
    expect(error).toBeNull()
    expect(data).not.toBeNull()
  })
})
