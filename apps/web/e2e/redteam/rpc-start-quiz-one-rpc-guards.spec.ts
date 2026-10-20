/**
 * Red Team Spec: one-RPC quiz start guards (#1548, mig 20261020000100) — Vectors JE, JF, JG, JH, JI.
 *
 *   JE  start_discovery 'flagged' filter + flagged_ids are scoped to the caller: a same-org
 *       student's flag neither draws the question nor appears in flagged_ids. Control: the
 *       caller's own flag draws it and lists it.
 *   JF  start_discovery / start_practice_quiz from an anon client are rejected at the privilege
 *       layer and create no session. Control: the authenticated caller starts a session.
 *   JG  a soft-deleted student holding a live JWT: start_discovery raises
 *       user_not_found_or_inactive (no key returned); start_practice_quiz raises on both the
 *       non-empty and the empty draw. Control: the same client reads the key while active.
 *   JH  start_practice_quiz while a mock exam is live raises another_session_active and creates
 *       no quick_quiz row. Control: with no exam live a quick_quiz session is created.
 *   JI  start_discovery while a quick_quiz is live raises another_session_active and returns no
 *       key. Control: with no practice session live the key is returned.
 *
 * Hermetic (code-style.md §7): questions are setupEoFixtures rows (E2E_REDTEAM_EO_MARKER),
 * soft-deleted in afterAll; sessions and fixture flags are soft-deleted in afterEach through a
 * per-step error accumulator.
 */

import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { clearOpenSessions } from './helpers/clear-open-sessions'
import {
  cleanupEoFixtures,
  EG_MC_ACTIVE_KEY,
  type EoFixtures,
  ensureEoSoftDelStudent,
  setupEoFixtures,
} from './helpers/get-study-questions-eo-setup'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  E2E_REDTEAM_EO_SOFTDEL_STUDENT_EMAIL,
  E2E_REDTEAM_EO_SOFTDEL_STUDENT_PASSWORD,
} from './helpers/seed-markers'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed-users'

const TAG = 'rpc-start-quiz-one-rpc-guards'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

type DiscoveryPayload = {
  session_id: string | null
  questions: { id: string; correct_option_id: string | null }[]
  flagged_ids: string[]
}
type PracticePayload = { session_id: string | null; question_ids: string[] }

function asDiscovery(data: unknown): DiscoveryPayload {
  expect(data).not.toBeNull()
  const p = data as { questions?: unknown; flagged_ids?: unknown }
  expect(Array.isArray(p.questions)).toBe(true)
  expect(Array.isArray(p.flagged_ids)).toBe(true)
  return data as DiscoveryPayload
}

function asPractice(data: unknown): PracticePayload {
  expect(data).not.toBeNull()
  expect(Array.isArray((data as { question_ids?: unknown }).question_ids)).toBe(true)
  return data as PracticePayload
}

test.describe('Red Team: one-RPC quiz start guards (#1548)', () => {
  let fx: EoFixtures
  let subjectId: string
  let attackerUserId: string
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  const flags: { studentId: string; questionId: string }[] = []

  test.beforeAll(async () => {
    fx = await setupEoFixtures()
    const { data: q, error } = await fx.admin
      .from('questions')
      .select('subject_id')
      .eq('id', fx.egMcActiveId)
      .single()
    if (error || !q) throw new Error(`subject lookup: ${error?.message}`)
    subjectId = q.subject_id as string
    attackerUserId = (await seedRedTeamUsers()).attackerUserId
    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    await clearOpenSessions(fx.admin, fx.victimUserId, TAG)
    await clearOpenSessions(fx.admin, attackerUserId, TAG)
  })

  test.afterAll(async () => {
    await cleanupEoFixtures(fx.admin, fx.createdQuestionIds)
  })

  test.afterEach(async () => {
    const errors: string[] = []
    for (const id of [fx.victimUserId, attackerUserId]) {
      try {
        await clearOpenSessions(fx.admin, id, TAG)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    try {
      for (const f of flags) {
        const { data, error } = await fx.admin
          .from('flagged_questions')
          .update({ deleted_at: new Date().toISOString() })
          .eq('student_id', f.studentId)
          .eq('question_id', f.questionId)
          .is('deleted_at', null)
          .select('question_id')
        if (error) throw new Error(`flag cleanup: ${error.message}`)
        if ((data?.length ?? 0) > 0) console.info(`[${TAG}] unflagged ${data?.length}`)
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      flags.length = 0
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  async function flag(studentId: string, questionId: string): Promise<void> {
    const { error } = await fx.admin
      .from('flagged_questions')
      .upsert(
        { student_id: studentId, question_id: questionId, deleted_at: null },
        { onConflict: 'student_id,question_id' },
      )
    if (error) throw new Error(`flag seed: ${error.message}`)
    flags.push({ studentId, questionId })
  }

  function discoveryArgs(filters: string[] | null) {
    return {
      p_subject_id: subjectId,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_count: 500,
      p_filters: filters,
    }
  }

  async function openSessions(studentId: string): Promise<{ id: string; mode: string }[]> {
    const { data, error } = await fx.admin
      .from('quiz_sessions')
      .select('id, mode')
      .eq('student_id', studentId)
      .is('ended_at', null)
      .is('deleted_at', null)
    if (error) throw new Error(`session lookup: ${error.message}`)
    return (data ?? []) as { id: string; mode: string }[]
  }

  async function insertLiveSession(studentId: string, mode: string): Promise<void> {
    const { error } = await fx.admin
      .from('quiz_sessions')
      .insert({ organization_id: fx.orgId, student_id: studentId, mode })
    if (error) throw new Error(`insert ${mode}: ${error.message}`)
  }

  test('JE: a same-org student flag is neither drawn nor listed for the caller', async () => {
    await flag(attackerUserId, fx.egMcActiveId)
    const { data: seeded, error: seedErr } = await fx.admin
      .from('active_flagged_questions')
      .select('student_id')
      .eq('question_id', fx.egMcActiveId)
    expect(seedErr).toBeNull()
    const flaggers = (seeded ?? []).map((r) => r.student_id as string)
    expect(flaggers).toContain(attackerUserId)
    expect(flaggers).not.toContain(fx.victimUserId)

    const own = await attackerClient.rpc('start_discovery', discoveryArgs(['flagged']))
    expect(own.error).toBeNull()
    expect(asDiscovery(own.data).flagged_ids).toContain(fx.egMcActiveId)

    const res = await fx.studentClient.rpc('start_discovery', discoveryArgs(['flagged']))
    expect(res.error).toBeNull()
    const payload = asDiscovery(res.data)
    expect(payload.questions.map((q) => q.id)).not.toContain(fx.egMcActiveId)
    expect(payload.flagged_ids).not.toContain(fx.egMcActiveId)
    await clearOpenSessions(fx.admin, fx.victimUserId, `${TAG} JE`)

    const unfiltered = await fx.studentClient.rpc('start_discovery', discoveryArgs(null))
    expect(unfiltered.error).toBeNull()
    const all = asDiscovery(unfiltered.data)
    expect(all.questions.map((q) => q.id)).toContain(fx.egMcActiveId)
    expect(all.flagged_ids).not.toContain(fx.egMcActiveId)
    await clearOpenSessions(fx.admin, fx.victimUserId, `${TAG} JE`)

    await flag(fx.victimUserId, fx.egMcActiveId)
    const control = await fx.studentClient.rpc('start_discovery', discoveryArgs(['flagged']))
    expect(control.error).toBeNull()
    const cp = asDiscovery(control.data)
    expect(cp.questions.map((q) => q.id)).toContain(fx.egMcActiveId)
    expect(cp.flagged_ids).toContain(fx.egMcActiveId)
  })

  test('JF: anonymous callers cannot start a discovery or practice session', async () => {
    const control = await fx.studentClient.rpc('start_discovery', discoveryArgs(null))
    expect(control.error).toBeNull()
    expect(typeof asDiscovery(control.data).session_id).toBe('string')
    await clearOpenSessions(fx.admin, fx.victimUserId, `${TAG} JF`)

    expect(ANON_KEY).not.toBe('')
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const disc = await anon.rpc('start_discovery', discoveryArgs(null))
    expect(disc.data).toBeNull()
    expect(disc.error?.code).toBe('42501')
    expect(disc.error?.message ?? '').toMatch(/permission denied for function/i)
    const prac = await anon.rpc('start_practice_quiz', discoveryArgs(['all']))
    expect(prac.data).toBeNull()
    expect(prac.error?.code).toBe('42501')
    expect(prac.error?.message ?? '').toMatch(/permission denied for function/i)
    expect(await openSessions(fx.victimUserId)).toHaveLength(0)
  })

  test.describe('JG: a soft-deleted student holding a live JWT cannot start', () => {
    let sdId = ''
    let sdClient: Awaited<ReturnType<typeof createAuthenticatedClient>>

    test.beforeAll(async () => {
      sdId = await ensureEoSoftDelStudent(fx.admin, fx.orgId)
      await clearOpenSessions(fx.admin, sdId, TAG)
      sdClient = await createAuthenticatedClient(
        E2E_REDTEAM_EO_SOFTDEL_STUDENT_EMAIL,
        E2E_REDTEAM_EO_SOFTDEL_STUDENT_PASSWORD,
      )
    })

    test.afterAll(async () => {
      if (!sdId) return
      const errors: string[] = []
      try {
        await clearOpenSessions(fx.admin, sdId, TAG)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
      try {
        const { data, error } = await fx.admin
          .from('users')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', sdId)
          .is('deleted_at', null)
          .select('id')
        if (error) throw new Error(`soft-delete student: ${error.message}`)
        if ((data?.length ?? 0) > 0) console.info(`[${TAG}] soft-deleted ${data?.length} student`)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
      if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
    })

    test('discovery and practice starts are refused once the account is soft-deleted', async () => {
      const before = await sdClient.rpc('start_discovery', discoveryArgs(null))
      expect(before.error).toBeNull()
      const keyRow = asDiscovery(before.data).questions.find((q) => q.id === fx.egMcActiveId)
      expect(keyRow?.correct_option_id).toBe(EG_MC_ACTIVE_KEY)
      await clearOpenSessions(fx.admin, sdId, `${TAG} JG`)

      const { data: del, error: delErr } = await fx.admin
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', sdId)
        .is('deleted_at', null)
        .select('id')
      expect(delErr).toBeNull()
      expect(del).toHaveLength(1)

      const disc = await sdClient.rpc('start_discovery', discoveryArgs(null))
      expect(disc.data).toBeNull()
      expect(disc.error?.message ?? '').toMatch(/user_not_found_or_inactive/)

      const prac = await sdClient.rpc('start_practice_quiz', discoveryArgs(['all']))
      expect(prac.data).toBeNull()
      expect(prac.error?.message ?? '').toMatch(/user not found or inactive/i)

      const empty = await sdClient.rpc('start_practice_quiz', {
        ...discoveryArgs(['all']),
        p_count: 0,
      })
      expect(empty.data).toBeNull()
      expect(empty.error?.message ?? '').toMatch(/user not found or inactive/i)

      expect(await openSessions(sdId)).toHaveLength(0)
    })
  })

  test('JH: start_practice_quiz is refused while a mock exam is live', async () => {
    const control = await fx.studentClient.rpc('start_practice_quiz', discoveryArgs(['all']))
    expect(control.error).toBeNull()
    expect(typeof asPractice(control.data).session_id).toBe('string')
    expect((await openSessions(fx.victimUserId)).map((s) => s.mode)).toEqual(['quick_quiz'])
    await clearOpenSessions(fx.admin, fx.victimUserId, `${TAG} JH`)

    await insertLiveSession(fx.victimUserId, 'mock_exam')
    expect((await openSessions(fx.victimUserId)).map((s) => s.mode)).toEqual(['mock_exam'])

    const res = await fx.studentClient.rpc('start_practice_quiz', discoveryArgs(['all']))
    expect(res.data).toBeNull()
    expect(res.error?.message ?? '').toMatch(/another_session_active/)
    expect((await openSessions(fx.victimUserId)).map((s) => s.mode)).toEqual(['mock_exam'])
  })

  test('JI: start_discovery returns no key while a quick quiz is live', async () => {
    const control = await fx.studentClient.rpc('start_discovery', discoveryArgs(null))
    expect(control.error).toBeNull()
    expect(
      asDiscovery(control.data).questions.find((q) => q.id === fx.egMcActiveId)?.correct_option_id,
    ).toBe(EG_MC_ACTIVE_KEY)
    await clearOpenSessions(fx.admin, fx.victimUserId, `${TAG} JI`)

    await insertLiveSession(fx.victimUserId, 'quick_quiz')
    expect((await openSessions(fx.victimUserId)).map((s) => s.mode)).toEqual(['quick_quiz'])

    const res = await fx.studentClient.rpc('start_discovery', discoveryArgs(null))
    expect(res.data).toBeNull()
    expect(res.error?.message ?? '').toMatch(/another_session_active/)
    expect((await openSessions(fx.victimUserId)).map((s) => s.mode)).toEqual(['quick_quiz'])
  })
})
