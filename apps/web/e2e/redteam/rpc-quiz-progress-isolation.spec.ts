/**
 * Red Team Spec: cross-device resume progress RPCs (#1026 PR 1) — Vectors GG/GH/GI/GJ
 *
 * Surface: quiz_session_progress (RLS SELECT-own, no write grant), quiz_sessions.active_device_id /
 * current_index / pinned_question_ids (no UPDATE column grant), save_quiz_answer, save_quiz_position,
 * claim_quiz_session, get_quiz_progress, and the progress write inside check_quiz_answer.
 *
 * GG (idor): attacker drives every progress RPC against the victim's session.
 * GH (rls-bypass): direct DML on quiz_session_progress / quiz_sessions resume columns, and direct
 *     EXECUTE of the REVOKEd helpers.
 * GI (auth-bypass): a second device of the same student grades + saves after a takeover.
 * GJ (answer-oracle): the progress path on a mock_exam session never carries correctness or a key.
 *
 * Status: Expected to PASS. Each test carries a control arm proving the guarded effect occurs for
 * the legitimate caller.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { clearOpenSessions } from './helpers/clear-open-sessions'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_QP_MARKER } from './helpers/seed-markers'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed-users'

type Client = Awaited<ReturnType<typeof createAuthenticatedClient>>

const DEVICE_A = '00000000-0000-4000-8000-00000000000a'
const DEVICE_B = '00000000-0000-4000-8000-00000000000b'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

test.describe('Red Team: quiz progress RPCs (Vectors GG/GH/GI/GJ)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attacker: Client
  let victim: Client
  let orgId: string
  let attackerUserId: string
  let victimUserId: string
  let q1: string
  let q2: string

  const clearActive = (studentId: string) => clearOpenSessions(admin, studentId, 'quiz-progress')

  const seedSession = async (studentId: string, mode: 'quick_quiz' | 'mock_exam') => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode,
        total_questions: 2,
        time_limit_seconds: mode === 'mock_exam' ? 3600 : null,
        config: { question_ids: [q1, q2], e2e_marker: E2E_REDTEAM_QP_MARKER },
      })
      .select('id')
      .single()
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`seedSession(${mode}): ${error?.message ?? 'bad shape'}`)
    return data.id
  }

  const readProgress = async (sessionId: string) => {
    const { data, error } = await admin
      .from('quiz_session_progress')
      .select('question_id, answer, student_id')
      .eq('session_id', sessionId)
      .order('question_id')
    if (error) throw new Error(`readProgress: ${error.message}`)
    return data ?? []
  }

  const readSession = async (sessionId: string) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('active_device_id, current_index, pinned_question_ids')
      .eq('id', sessionId)
      .single()
    if (error || !data) throw new Error(`readSession: ${error?.message}`)
    return data
  }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    attackerUserId = seed.attackerUserId
    victimUserId = seed.victimUserId
    attacker = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    victim = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
    const { data, error } = await admin
      .from('questions')
      .select('id')
      .eq('organization_id', orgId)
      .eq('question_type', 'multiple_choice')
      .eq('status', 'active')
      .is('deleted_at', null)
      .not('correct_option_id', 'is', null)
      .order('id')
      .limit(2)
    if (error) throw new Error(`beforeAll questions: ${error.message}`)
    if (!Array.isArray(data) || data.length < 2) throw new Error('need 2 active MC questions')
    q1 = data[0]?.id as string
    q2 = data[1]?.id as string
  })

  test.beforeEach(async () => {
    await clearActive(victimUserId)
    await clearActive(attackerUserId)
  })

  test.afterEach(async () => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('config->>e2e_marker', E2E_REDTEAM_QP_MARKER)
      .is('deleted_at', null)
      .select('id')
    if (error) throw new Error(`afterEach: ${error.message}`)
    if ((data?.length ?? 0) > 0) console.info(`[quiz-progress] soft-deleted ${data?.length}`)
  })

  test('GG: attacker cannot read or write progress on the victim session', async () => {
    const sessionId = await seedSession(victimUserId, 'quick_quiz')

    // Control: the owner's writes land.
    const own = await victim.rpc('save_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: q1,
      p_answer: { selected_option_id: 'a' },
      p_time_spent_ms: 1000,
      p_device_id: DEVICE_A,
    })
    expect(own.error).toBeNull()
    const ownPos = await victim.rpc('save_quiz_position', {
      p_session_id: sessionId,
      p_current_index: 1,
      p_pinned_question_ids: [q1],
      p_device_id: DEVICE_A,
    })
    expect(ownPos.error).toBeNull()
    const ownRead = await victim.rpc('get_quiz_progress', { p_session_id: sessionId })
    expect(ownRead.error).toBeNull()
    expect(isRecord(ownRead.data) && Array.isArray(ownRead.data.answers)).toBe(true)
    expect((ownRead.data as { answers: unknown[] }).answers).toHaveLength(1)

    const before = await readProgress(sessionId)
    expect(before).toEqual([
      { question_id: q1, answer: { selected_option_id: 'a' }, student_id: victimUserId },
    ])
    const sessionBefore = await readSession(sessionId)
    expect(sessionBefore.current_index).toBe(1)

    const probes = [
      attacker.rpc('save_quiz_answer', {
        p_session_id: sessionId,
        p_question_id: q1,
        p_answer: { selected_option_id: 'b' },
        p_time_spent_ms: 1,
        p_device_id: null,
      }),
      attacker.rpc('save_quiz_position', {
        p_session_id: sessionId,
        p_current_index: 0,
        p_pinned_question_ids: [],
        p_device_id: null,
      }),
      attacker.rpc('claim_quiz_session', { p_session_id: sessionId, p_device_id: DEVICE_B }),
      attacker.rpc('get_quiz_progress', { p_session_id: sessionId }),
    ]
    for (const r of await Promise.all(probes)) {
      expect(r.data).toBeNull()
      expect(r.error?.message).toBe('session_not_found')
    }
    const check = await attacker.rpc('check_quiz_answer', {
      p_question_id: q1,
      p_selected_option_id: 'b',
      p_session_id: sessionId,
    })
    expect(check.data).toBeNull()
    expect(check.error?.message).toMatch(/session not found or not owned/)

    expect(await readProgress(sessionId)).toEqual(before)
    expect(await readSession(sessionId)).toEqual(sessionBefore)
  })

  test('GH: direct DML on progress and resume columns, and helper EXECUTE, are refused', async () => {
    const sessionId = await seedSession(victimUserId, 'quick_quiz')
    const own = await victim.rpc('save_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: q1,
      p_answer: { selected_option_id: 'c' },
      p_time_spent_ms: 10,
      p_device_id: null,
    })
    expect(own.error).toBeNull()
    const before = await readProgress(sessionId)
    expect(before).toHaveLength(1)

    // RLS SELECT: owner sees the row, attacker sees none.
    const ownSel = await victim
      .from('quiz_session_progress')
      .select('question_id')
      .eq('session_id', sessionId)
    expect(ownSel.error).toBeNull()
    expect(ownSel.data).toHaveLength(1)
    const atkSel = await attacker
      .from('quiz_session_progress')
      .select('question_id')
      .eq('session_id', sessionId)
    expect(atkSel.error).toBeNull()
    expect(atkSel.data).toEqual([])

    // Privilege layer: no write grant on quiz_session_progress, even for the owner.
    const ins = await victim.from('quiz_session_progress').insert({
      session_id: sessionId,
      question_id: q2,
      student_id: victimUserId,
      answer: { selected_option_id: 'a' },
    })
    expect(ins.error?.code).toBe('42501')
    const upd = await victim
      .from('quiz_session_progress')
      .update({ answer: { selected_option_id: 'd' } })
      .eq('session_id', sessionId)
    expect(upd.error?.code).toBe('42501')
    const del = await victim.from('quiz_session_progress').delete().eq('session_id', sessionId)
    expect(del.error?.code).toBe('42501')

    // Resume columns on quiz_sessions: no UPDATE column grant.
    for (const patch of [
      { active_device_id: DEVICE_B },
      { current_index: 1 },
      { pinned_question_ids: [q2] },
    ]) {
      const r = await victim.from('quiz_sessions').update(patch).eq('id', sessionId)
      expect(r.error?.code).toBe('42501')
    }

    // REVOKEd helpers: unreachable from authenticated.
    const helperCalls = [
      victim.rpc('_save_progress_row', {
        p_session_id: sessionId,
        p_question_id: q2,
        p_student_id: victimUserId,
        p_answer: { selected_option_id: 'a' },
        p_time_spent_ms: 0,
        p_device_id: null,
      }),
      victim.rpc('_lock_session_for_progress', {
        p_session_id: sessionId,
        p_device_id: null,
        p_check_device: false,
      }),
      victim.rpc('_validate_progress_answer', {
        p_answer: { selected_option_id: 'a' },
        p_question_type: 'multiple_choice',
      }),
    ]
    for (const r of await Promise.all(helperCalls)) {
      expect(r.data).toBeNull()
      expect(r.error).not.toBeNull()
      expect(['42501', 'PGRST202']).toContain(r.error?.code)
    }

    expect(await readProgress(sessionId)).toEqual(before)
    expect(await readSession(sessionId)).toEqual({
      active_device_id: null,
      current_index: 0,
      pinned_question_ids: [],
    })
  })

  test('GI: a taken-over device cannot grade-and-save through check_quiz_answer', async () => {
    const sessionId = await seedSession(victimUserId, 'quick_quiz')
    const claim = await victim.rpc('claim_quiz_session', {
      p_session_id: sessionId,
      p_device_id: DEVICE_A,
    })
    expect(claim.error).toBeNull()
    expect((await readSession(sessionId)).active_device_id).toBe(DEVICE_A)

    // Control: the claiming device gets the graded payload and the save lands.
    const ok = await victim.rpc('check_quiz_answer', {
      p_question_id: q1,
      p_selected_option_id: 'a',
      p_session_id: sessionId,
      p_device_id: DEVICE_A,
      p_time_spent_ms: 500,
    })
    expect(ok.error).toBeNull()
    expect(isRecord(ok.data) && typeof ok.data.correct_option_id === 'string').toBe(true)
    const before = await readProgress(sessionId)
    expect(before).toEqual([
      { question_id: q1, answer: { selected_option_id: 'a' }, student_id: victimUserId },
    ])

    for (const device of [DEVICE_B, null]) {
      const r = await victim.rpc('check_quiz_answer', {
        p_question_id: q1,
        p_selected_option_id: 'b',
        p_session_id: sessionId,
        p_device_id: device,
        p_time_spent_ms: 500,
      })
      expect(r.data).toBeNull()
      expect(r.error?.message).toBe('session_taken_over')
      const s = await victim.rpc('save_quiz_answer', {
        p_session_id: sessionId,
        p_question_id: q1,
        p_answer: { selected_option_id: 'b' },
        p_time_spent_ms: 1,
        p_device_id: device,
      })
      expect(s.error?.message).toBe('session_taken_over')
    }
    expect(await readProgress(sessionId)).toEqual(before)
  })

  test('GJ: exam-mode progress stores the answer without correctness or key', async () => {
    const sessionId = await seedSession(victimUserId, 'mock_exam')

    const save = await victim.rpc('save_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: q1,
      p_answer: { selected_option_id: 'b' },
      p_time_spent_ms: 1200,
      p_device_id: null,
    })
    expect(save.error).toBeNull()
    expect(save.data).toBeNull()

    const read = await victim.rpc('get_quiz_progress', { p_session_id: sessionId })
    expect(read.error).toBeNull()
    expect(isRecord(read.data)).toBe(true)
    const payload = read.data as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual(
      [
        'active_device_id',
        'answers',
        'current_index',
        'mode',
        'pinned_question_ids',
        'status',
      ].sort(),
    )
    expect(payload.status).toBe('open')
    expect(payload.mode).toBe('mock_exam')
    const answers = payload.answers as Array<Record<string, unknown>>
    expect(answers).toHaveLength(1)
    expect(Object.keys(answers[0] ?? {}).sort()).toEqual(
      ['answer', 'answered_at', 'question_id', 'time_spent_ms'].sort(),
    )
    expect(answers[0]?.answer).toEqual({ selected_option_id: 'b' })

    const oracle = await victim.rpc('check_quiz_answer', {
      p_question_id: q1,
      p_selected_option_id: 'a',
      p_session_id: sessionId,
    })
    expect(oracle.data).toBeNull()
    expect(oracle.error?.message).toBe('unsupported_session_mode')
    expect(await readProgress(sessionId)).toEqual([
      { question_id: q1, answer: { selected_option_id: 'b' }, student_id: victimUserId },
    ])
  })
})
