/**
 * Red Team Spec: progress RPCs with optional args OMITTED from the request body (#1609) —
 * Vectors JY/JZ
 *
 * Surface: typed `supabase.rpc` drops `undefined` args from the JSON body (no explicit null), so
 * check_quiz_answer / check_non_mc_answer (p_device_id, p_time_spent_ms) and save_quiz_position
 * (p_question_id, p_time_spent_ms) resolve through the SQL DEFAULT.
 *
 * JY (auth-bypass): after a claim by DEVICE_A, both check RPCs with the p_device_id key absent or
 *     `undefined` raise session_taken_over, grade nothing and save nothing.
 *     CONTROL: the same calls with DEVICE_A grade and save.
 * JZ (auth-bypass): save_quiz_position with p_device_id absent fails to resolve (PGRST202, no SQL
 *     DEFAULT); with a foreign device and the leaving keys absent raises session_taken_over.
 *     Position is untouched either way.
 *     CONTROL: the same call with DEVICE_A moves the position and writes no progress row.
 *
 * Status: Expected to PASS.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { clearOpenSessions } from './helpers/clear-open-sessions'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_JY_MARKER } from './helpers/seed-markers'
import { seedRedTeamUsers, VICTIM_EMAIL, VICTIM_PASSWORD } from './helpers/seed-users'

type Client = Awaited<ReturnType<typeof createAuthenticatedClient>>

const DEVICE_A = '00000000-0000-4000-8000-0000000000d1'
const DEVICE_B = '00000000-0000-4000-8000-0000000000d2'
const TAKEN_OVER = 'session_taken_over'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

test.describe('Red Team: progress RPCs with omitted device key (Vectors JY/JZ)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let victim: Client
  let orgId: string
  let victimUserId: string
  let mcId: string
  let saId: string
  let saCanonical: string
  const createdQuestionIds = new Set<string>()

  const seedClaimedSession = async (): Promise<string> => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: victimUserId,
        mode: 'quick_quiz',
        total_questions: 2,
        config: { question_ids: [mcId, saId], e2e_marker: E2E_REDTEAM_JY_MARKER },
      })
      .select('id')
      .single()
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`seedClaimedSession: ${error?.message ?? 'bad shape'}`)
    const claim = await victim.rpc('claim_quiz_session', {
      p_session_id: data.id,
      p_device_id: DEVICE_A,
    })
    if (claim.error) throw new Error(`claim: ${claim.error.message}`)
    return data.id
  }

  const readProgress = async (sessionId: string) => {
    const { data, error } = await admin
      .from('quiz_session_progress')
      .select('question_id, answer')
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
    victimUserId = seed.victimUserId
    victim = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
    const { data, error } = await admin
      .from('questions')
      .select('id, bank_id, subject_id, topic_id, created_by')
      .eq('organization_id', orgId)
      .eq('question_type', 'multiple_choice')
      .eq('status', 'active')
      .is('deleted_at', null)
      .not('correct_option_id', 'is', null)
      .order('id')
      .limit(1)
      .single()
    if (error || !isRecord(data)) throw new Error(`beforeAll mc: ${error?.message ?? 'none'}`)
    const { id, bank_id, subject_id, topic_id, created_by } = data
    if (
      typeof id !== 'string' ||
      typeof bank_id !== 'string' ||
      typeof subject_id !== 'string' ||
      typeof topic_id !== 'string' ||
      typeof created_by !== 'string'
    )
      throw new Error('mc scaffolding columns missing')
    mcId = id
    const sa = await admin
      .from('questions')
      .insert({
        organization_id: orgId,
        bank_id,
        subject_id,
        topic_id,
        created_by,
        question_text: `${E2E_REDTEAM_JY_MARKER} short answer`,
        question_number: `${E2E_REDTEAM_JY_MARKER}-SA-${Date.now()}`,
        explanation_text: `${E2E_REDTEAM_JY_MARKER} explanation`,
        difficulty: 'easy',
        status: 'active',
        question_type: 'short_answer',
        options: [],
        correct_option_id: null,
        canonical_answer: 'QNH',
        accepted_synonyms: [],
        dialog_template: null,
        blanks_config: [],
      })
      .select('id, canonical_answer')
      .single()
    if (sa.error || !isRecord(sa.data) || typeof sa.data.id !== 'string')
      throw new Error(`insert short_answer: ${sa.error?.message ?? 'bad shape'}`)
    if (typeof sa.data.canonical_answer !== 'string') throw new Error('canonical missing')
    createdQuestionIds.add(sa.data.id)
    saId = sa.data.id
    saCanonical = sa.data.canonical_answer
  })

  test.afterAll(async () => {
    if (createdQuestionIds.size === 0) return
    try {
      const { data, error } = await admin
        .from('questions')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', [...createdQuestionIds])
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`afterAll soft-delete questions: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.info(`[JY] soft-deleted ${data?.length} questions`)
    } finally {
      createdQuestionIds.clear()
    }
  })

  test.beforeEach(async () => {
    await clearOpenSessions(admin, victimUserId, 'JY')
  })

  test.afterEach(async () => {
    const errors: string[] = []
    try {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('config->>e2e_marker', E2E_REDTEAM_JY_MARKER)
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`soft-delete marker rows: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.info(`[JY] soft-deleted ${data?.length}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      await clearOpenSessions(admin, victimUserId, 'JY')
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  test('JY: check RPCs without the device key are refused after a claim', async () => {
    const sessionId = await seedClaimedSession()
    expect((await readSession(sessionId)).active_device_id).toBe(DEVICE_A)

    const omitted = [
      victim.rpc('check_quiz_answer', {
        p_question_id: mcId,
        p_selected_option_id: 'a',
        p_session_id: sessionId,
      }),
      victim.rpc('check_quiz_answer', {
        p_question_id: mcId,
        p_selected_option_id: 'a',
        p_session_id: sessionId,
        p_device_id: undefined,
        p_time_spent_ms: undefined,
      }),
      victim.rpc('check_non_mc_answer', {
        p_question_id: saId,
        p_session_id: sessionId,
        p_response_text: saCanonical,
      }),
      victim.rpc('check_non_mc_answer', {
        p_question_id: saId,
        p_session_id: sessionId,
        p_response_text: saCanonical,
        p_device_id: undefined,
        p_time_spent_ms: undefined,
      }),
    ]
    for (const r of await Promise.all(omitted)) {
      expect(r.data).toBeNull()
      expect(r.error?.message).toBe(TAKEN_OVER)
    }
    expect(await readProgress(sessionId)).toEqual([])

    // CONTROL: the claiming device grades and saves.
    const mc = await victim.rpc('check_quiz_answer', {
      p_question_id: mcId,
      p_selected_option_id: 'a',
      p_session_id: sessionId,
      p_device_id: DEVICE_A,
    })
    expect(mc.error).toBeNull()
    expect(isRecord(mc.data) && typeof mc.data.correct_option_id === 'string').toBe(true)
    const sa = await victim.rpc('check_non_mc_answer', {
      p_question_id: saId,
      p_session_id: sessionId,
      p_response_text: saCanonical,
      p_device_id: DEVICE_A,
    })
    expect(sa.error).toBeNull()
    expect(isRecord(sa.data) && sa.data.is_correct === true).toBe(true)
    const rows = await readProgress(sessionId)
    expect(rows.map((r) => r.question_id).sort()).toEqual([mcId, saId].sort())
  })

  test('JZ: save_quiz_position with omitted device or leaving keys moves nothing after a claim', async () => {
    const sessionId = await seedClaimedSession()
    const before = await readSession(sessionId)
    expect(before).toEqual({
      active_device_id: DEVICE_A,
      current_index: 0,
      pinned_question_ids: [],
    })

    // p_device_id has no SQL DEFAULT: an omitted key resolves no function.
    const noDevice = await victim.rpc('save_quiz_position', {
      p_session_id: sessionId,
      p_current_index: 1,
      p_pinned_question_ids: [mcId],
      p_device_id: undefined,
    })
    expect(noDevice.data).toBeNull()
    expect(noDevice.error?.code).toBe('PGRST202')

    // A foreign device with the leaving keys omitted is refused.
    const stale = await victim.rpc('save_quiz_position', {
      p_session_id: sessionId,
      p_current_index: 1,
      p_pinned_question_ids: [mcId],
      p_device_id: DEVICE_B,
      p_question_id: undefined,
      p_time_spent_ms: undefined,
    })
    expect(stale.data).toBeNull()
    expect(stale.error?.message).toBe(TAKEN_OVER)
    expect(await readSession(sessionId)).toEqual(before)

    // CONTROL: the claiming device moves the position; omitted leaving keys write no progress row.
    const ok = await victim.rpc('save_quiz_position', {
      p_session_id: sessionId,
      p_current_index: 1,
      p_pinned_question_ids: [mcId],
      p_device_id: DEVICE_A,
    })
    expect(ok.error).toBeNull()
    expect(await readSession(sessionId)).toEqual({
      active_device_id: DEVICE_A,
      current_index: 1,
      pinned_question_ids: [mcId],
    })
    expect(await readProgress(sessionId)).toEqual([])
  })
})
