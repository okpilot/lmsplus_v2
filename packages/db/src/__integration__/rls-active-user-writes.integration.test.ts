import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupReferenceData, cleanupTestData } from './cleanup'
import { fixtureSuffix } from './fixture-suffix'
import { seedQuestions, seedReferenceData } from './seed'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

/**
 * A student whose users row is soft-deleted but whose JWT is still unexpired
 * must not be able to write through RLS. Each deactivated-arm negative is
 * paired with a control arm (same client, user restored) on a separate row.
 */
describe('RLS: student writes require an active user', () => {
  const admin = getAdminClient()
  const suffix = fixtureSuffix()

  let orgId: string
  let studentId: string
  let student: SupabaseClient
  let sessionId: string
  let q0: string
  let q1: string
  let q2: string
  let q3: string
  let refs: Awaited<ReturnType<typeof seedReferenceData>>
  const userIds: string[] = []

  async function setDeactivated(deactivated: boolean) {
    const { error } = await admin
      .from('users')
      .update({ deleted_at: deactivated ? new Date().toISOString() : null })
      .eq('id', studentId)
    expect(error).toBeNull()
  }

  async function seedComment(body: string): Promise<string> {
    const { data, error } = await admin
      .from('question_comments')
      .insert({ question_id: q0, user_id: studentId, body })
      .select('id')
      .single()
    expect(error).toBeNull()
    const id = (data as { id: string }).id
    return id
  }

  async function seedDraft(): Promise<string> {
    const { data, error } = await admin
      .from('quiz_drafts')
      .insert({ student_id: studentId, organization_id: orgId, question_ids: [q0] })
      .select('id')
      .single()
    expect(error).toBeNull()
    return (data as { id: string }).id
  }

  async function seedFlag(questionId: string) {
    const { error } = await admin
      .from('flagged_questions')
      .insert({ student_id: studentId, question_id: questionId })
    expect(error).toBeNull()
  }

  async function flagDeletedAt(questionId: string): Promise<string | null | undefined> {
    const { data, error } = await admin
      .from('flagged_questions')
      .select('deleted_at')
      .eq('student_id', studentId)
      .eq('question_id', questionId)
      .maybeSingle()
    expect(error).toBeNull()
    return (data as { deleted_at: string | null } | null)?.deleted_at
  }

  beforeAll(async () => {
    orgId = await createTestOrg({
      admin,
      name: `Test Org ActiveW ${suffix}`,
      slug: `test-activew-${suffix}`,
    })
    const adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-activew-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-activew-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)

    refs = await seedReferenceData({
      admin,
      subjectCode: `W${suffix}`,
      subjectName: `ActiveW Subject ${suffix}`,
      topicCode: `W${suffix}-01`,
      topicName: `ActiveW Topic ${suffix}`,
    })
    const seeded = await seedQuestions({
      admin,
      orgId,
      createdBy: adminUserId,
      subjectId: refs.subjectId,
      topicId: refs.topicId,
      count: 4,
    })
    ;[q0, q1, q2, q3] = seeded.questionIds as [string, string, string, string]

    // Sign in BEFORE deactivation: the token stays valid, which is the window under test.
    student = await getAuthenticatedClient({
      email: `student-activew-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    const { data, error } = await student.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: null,
      p_topic_id: null,
      p_question_ids: [q0, q1],
    })
    expect(error).toBeNull()
    sessionId = data as string
  })

  afterAll(async () => {
    const errors: string[] = []
    const run = async (
      label: string,
      step: () => PromiseLike<{ error: { message: string } | null }>,
    ) => {
      try {
        const { error } = await step()
        if (error) throw new Error(error.message)
      } catch (e) {
        errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    await run('users restore', () =>
      admin.from('users').update({ deleted_at: null }).eq('id', studentId),
    )
    await run('flagged_questions', () =>
      admin.from('flagged_questions').delete().eq('student_id', studentId),
    )
    await run('question_comments', () =>
      admin.from('question_comments').delete().eq('user_id', studentId),
    )
    await run('quiz_drafts', () => admin.from('quiz_drafts').delete().eq('student_id', studentId))
    if (errors.length === 0) {
      try {
        await cleanupTestData({ admin, orgId, userIds })
        await cleanupReferenceData({ admin, refs: [refs] })
      } catch (e) {
        errors.push(`cleanup: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  describe('deactivated student with a live token', () => {
    it('cannot flag a question', async () => {
      await setDeactivated(true)
      const { error } = await student
        .from('flagged_questions')
        .insert({ student_id: studentId, question_id: q2 })
      expect(error?.code).toBe('42501')
      expect(await flagDeletedAt(q2)).toBeUndefined()
    })

    it('cannot unflag a question', async () => {
      await setDeactivated(false)
      await seedFlag(q0)
      expect(await flagDeletedAt(q0)).toBeNull()
      await setDeactivated(true)

      const { data, error } = await student
        .from('flagged_questions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('student_id', studentId)
        .eq('question_id', q0)
        .select('question_id')
      expect(error).toBeNull()
      expect(data).toHaveLength(0)
      expect(await flagDeletedAt(q0)).toBeNull()
    })

    it('cannot post a comment', async () => {
      await setDeactivated(true)
      const { error } = await student
        .from('question_comments')
        .insert({ question_id: q0, user_id: studentId, body: `denied ${suffix}` })
      expect(error?.code).toBe('42501')
      const { data, error: readErr } = await admin
        .from('question_comments')
        .select('id')
        .eq('user_id', studentId)
        .eq('body', `denied ${suffix}`)
      expect(readErr).toBeNull()
      expect(data).toHaveLength(0)
    })

    it('cannot delete its own quiz draft', async () => {
      const id = await seedDraft()
      await setDeactivated(true)

      const { data, error } = await student.from('quiz_drafts').delete().eq('id', id).select('id')
      expect(error).toBeNull()
      expect(data).toHaveLength(0)
      const { data: after, error: readErr } = await admin
        .from('quiz_drafts')
        .select('id')
        .eq('id', id)
      expect(readErr).toBeNull()
      expect(after).toHaveLength(1)
    })

    it('cannot discard its own live session', async () => {
      const { data: before, error: beforeErr } = await admin
        .from('quiz_sessions')
        .select('id, deleted_at, ended_at')
        .eq('id', sessionId)
        .single()
      expect(beforeErr).toBeNull()
      expect(before).toMatchObject({ id: sessionId, deleted_at: null, ended_at: null })
      await setDeactivated(true)

      const { data, error } = await student
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', sessionId)
        .select('id')
      expect(error).toBeNull()
      expect(data).toHaveLength(0)
      const { data: after, error: readErr } = await admin
        .from('quiz_sessions')
        .select('deleted_at')
        .eq('id', sessionId)
        .single()
      expect(readErr).toBeNull()
      expect((after as { deleted_at: string | null }).deleted_at).toBeNull()
    })
  })

  describe('active student, same client (control)', () => {
    it('can flag and unflag a question', async () => {
      await setDeactivated(false)
      const { error: insErr } = await student
        .from('flagged_questions')
        .insert({ student_id: studentId, question_id: q3 })
      expect(insErr).toBeNull()
      expect(await flagDeletedAt(q3)).toBeNull()

      await seedFlag(q1)
      const { data, error } = await student
        .from('flagged_questions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('student_id', studentId)
        .eq('question_id', q1)
        .select('question_id')
      expect(error).toBeNull()
      expect(data).toHaveLength(1)
    })

    it('can post and delete its own comment', async () => {
      await setDeactivated(false)
      const { data: posted, error: postErr } = await student
        .from('question_comments')
        .insert({ question_id: q0, user_id: studentId, body: `ok ${suffix}` })
        .select('id')
      expect(postErr).toBeNull()
      expect(posted).toHaveLength(1)

      const id = await seedComment(`own-active ${suffix}`)
      const { data, error } = await student
        .from('question_comments')
        .delete()
        .eq('id', id)
        .select('id')
      expect(error).toBeNull()
      expect(data).toHaveLength(1)
    })

    it('can delete its own quiz draft', async () => {
      await setDeactivated(false)
      const id = await seedDraft()
      const { data, error } = await student.from('quiz_drafts').delete().eq('id', id).select('id')
      expect(error).toBeNull()
      expect(data).toHaveLength(1)
    })

    // Single-active-session invariant: one live session per student, so the
    // control arm reuses the row the deactivated arm proved unchanged.
    it('can discard its own live session', async () => {
      await setDeactivated(false)
      const { data, error } = await student
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', sessionId)
        .select('id')
      expect(error).toBeNull()
      expect(data).toHaveLength(1)
    })
  })

  describe('fsrs_cards', () => {
    it('refuses student writes at the privilege layer and still serves own reads', async () => {
      await setDeactivated(false)
      const { error: seedErr } = await admin
        .from('fsrs_cards')
        .insert({ student_id: studentId, question_id: q0 })
      expect(seedErr).toBeNull()

      const { data: rows, error: readErr } = await student
        .from('fsrs_cards')
        .select('question_id')
        .eq('student_id', studentId)
      expect(readErr).toBeNull()
      expect(rows).toHaveLength(1)

      const { error: insErr } = await student
        .from('fsrs_cards')
        .insert({ student_id: studentId, question_id: q1 })
      const { error: updErr } = await student
        .from('fsrs_cards')
        .update({ reps: 99 })
        .eq('student_id', studentId)
      const { error: delErr } = await student
        .from('fsrs_cards')
        .delete()
        .eq('student_id', studentId)
      for (const err of [insErr, updErr, delErr]) {
        expect(err?.code).toBe('42501')
        expect(err?.message).toContain('permission denied for table')
      }

      const { data: after, error: afterErr } = await admin
        .from('fsrs_cards')
        .select('question_id, reps')
        .eq('student_id', studentId)
      expect(afterErr).toBeNull()
      expect(after).toEqual([{ question_id: q0, reps: 0 }])
    })
  })
})
