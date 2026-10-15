/**
 * Red Team Spec — Vector IE: an ACTIVE student soft-deletes their own in-progress
 * internal_exam / vfr_rt_exam session straight at PostgREST
 * (`PATCH /quiz_sessions?id=eq.<id> {deleted_at}`), skipping discardQuiz's
 * NON_DISCARDABLE_MODES check (`_discard-guard.ts`, Vector EF covers only the Server Action).
 * Fix: students_update_sessions USING excludes mode internal_exam / vfr_rt_exam
 * (mig 20261015000100). The column grant includes deleted_at (mig 20260605000001) and
 * trg_quiz_sessions_immutable_columns does not cover it, so the policy is the guard.
 * CONTROL: the same direct PATCH on a discardable quick_quiz session soft-deletes it.
 */

import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_CODE_PREFIX, E2E_REDTEAM_IE_MARKER } from './helpers/seed-markers'
import { ensureExamConfig, pickSubjectWithQuestions } from './helpers/seed-quiz'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed-users'

test.describe('Red Team: student direct soft-delete of an in-progress exam session (IE)', () => {
  test.setTimeout(90_000)

  let admin: ReturnType<typeof getAdminClient>
  let client: SupabaseClient
  let orgId: string
  let studentId: string
  let subjectId: string
  const sessionIds = new Set<string>()
  const codeIds = new Set<string>()

  const directDiscard = (id: string) =>
    client
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .select('id')

  const deletedAt = async (id: string) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('deleted_at, ended_at')
      .eq('id', id)
      .single()
    if (error) throw new Error(`read session: ${error.message}`)
    return data
  }

  const adminInsertSession = async (mode: 'vfr_rt_exam' | 'quick_quiz') => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode,
        subject_id: subjectId,
        total_questions: 0,
        config: { question_ids: [], e2e_marker: E2E_REDTEAM_IE_MARKER },
      })
      .select('id')
      .single()
    if (error || typeof data?.id !== 'string') throw new Error(`seed ${mode}: ${error?.message}`)
    sessionIds.add(data.id)
    return data.id
  }

  const startInternalExam = async () => {
    const code = `${E2E_REDTEAM_CODE_PREFIX}${crypto
      .randomUUID()
      .replace(/-/g, '')
      .toUpperCase()
      .replace(/[^A-Z2-9]/g, 'A')
      .slice(0, 6)}`
    const { data: row, error: codeErr } = await admin
      .from('internal_exam_codes')
      .insert({
        code,
        subject_id: subjectId,
        student_id: studentId,
        issued_by: studentId,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        organization_id: orgId,
      })
      .select('id')
      .single()
    if (codeErr || typeof row?.id !== 'string') throw new Error(`seed code: ${codeErr?.message}`)
    codeIds.add(row.id)
    const { data, error } = await client.rpc('start_internal_exam_session', { p_code: code })
    if (error) throw new Error(`start_internal_exam_session: ${error.message}`)
    const id = Array.isArray(data) ? (data[0] as { session_id?: unknown })?.session_id : undefined
    if (typeof id !== 'string') throw new Error('start_internal_exam_session: no session_id')
    sessionIds.add(id)
    return id
  }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    studentId = seed.attackerUserId
    const picked = await pickSubjectWithQuestions(admin, { orgId })
    subjectId = picked.subjectId
    await ensureExamConfig(orgId, subjectId, picked.topicId)
    client = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
  })

  test.beforeEach(async () => {
    await cleanupStudentActiveSessions(ATTACKER_EMAIL)
  })

  test.afterEach(async () => {
    const errors: string[] = []
    try {
      if (sessionIds.size > 0) {
        const { data, error } = await admin
          .from('quiz_sessions')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', [...sessionIds])
          .is('deleted_at', null)
          .select('id')
        if (error) throw new Error(`sessions: ${error.message}`)
        if ((data?.length ?? 0) > 0) console.info(`[IE] soft-deleted ${data?.length} session(s)`)
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      sessionIds.clear()
    }
    try {
      if (codeIds.size > 0) {
        const { data, error } = await admin
          .from('internal_exam_codes')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', [...codeIds])
          .is('deleted_at', null)
          .select('id')
        if (error) throw new Error(`codes: ${error.message}`)
        if ((data?.length ?? 0) > 0) console.info(`[IE] soft-deleted ${data?.length} code(s)`)
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      codeIds.clear()
    }
    try {
      await cleanupStudentActiveSessions(ATTACKER_EMAIL)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  test('IE: a student cannot soft-delete their in-progress internal exam via PostgREST', async () => {
    const id = await startInternalExam()
    expect(await deletedAt(id)).toEqual({ deleted_at: null, ended_at: null })
    const hit = await directDiscard(id)
    expect(hit.error !== null || (hit.data ?? []).length === 0).toBe(true)
    expect((await deletedAt(id))?.deleted_at).toBeNull()
  })

  test('IE: a student cannot soft-delete their in-progress vfr_rt_exam via PostgREST', async () => {
    const id = await adminInsertSession('vfr_rt_exam')
    expect(await deletedAt(id)).toEqual({ deleted_at: null, ended_at: null })
    const hit = await directDiscard(id)
    expect(hit.error !== null || (hit.data ?? []).length === 0).toBe(true)
    expect((await deletedAt(id))?.deleted_at).toBeNull()
  })

  test('IE CONTROL: the same direct PATCH soft-deletes a discardable quick_quiz', async () => {
    const id = await adminInsertSession('quick_quiz')
    expect(await deletedAt(id)).toEqual({ deleted_at: null, ended_at: null })
    const own = await directDiscard(id)
    expect(own.error).toBeNull()
    expect(own.data ?? []).toHaveLength(1)
    expect((await deletedAt(id))?.deleted_at).not.toBeNull()
  })
})
