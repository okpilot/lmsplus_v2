/**
 * Red Team Spec: blocked-start chain at the saved-quiz cap — Vector HL
 *
 * Surface: the blocked-start flow (`use-blocked-start.ts`: checkSavedQuizRoom → claim_quiz_session →
 * save_quiz_for_later). checkSavedQuizRoom is a client-orchestrated pre-flight; a caller skipping
 * it drives claim + save directly. save_quiz_for_later must enforce the cap itself and leave the
 * session open, so the single active slot stays occupied (uq_one_active_session_per_student).
 *
 * Status: Expected to PASS. Control arm: one saved row under the cap, the same save parks the
 * session and frees the slot.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { clearOpenSessions } from './helpers/clear-open-sessions'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_BS_MARKER } from './helpers/seed-markers'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed-users'

const SAVED_CAP = 20
const DEVICE_A = '00000000-0000-4000-8000-0000000000b1'
const DEVICE_B = '00000000-0000-4000-8000-0000000000b2'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

test.describe('Red Team: blocked-start save at the saved-quiz cap (Vector HL)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let student: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let orgId: string
  let studentId: string
  let questionIds: string[]

  const sessionRow = (extra: Record<string, unknown>) => ({
    organization_id: orgId,
    student_id: studentId,
    mode: 'quick_quiz',
    total_questions: questionIds.length,
    config: { question_ids: questionIds, e2e_marker: E2E_REDTEAM_BS_MARKER },
    ...extra,
  })

  const insertOpen = (deviceId: string | null) =>
    admin
      .from('quiz_sessions')
      .insert(sessionRow({ active_device_id: deviceId }))
      .select('id')
      .single()

  const savedCount = async (): Promise<number> => {
    const { count, error } = await admin
      .from('quiz_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', studentId)
      .not('saved_at', 'is', null)
    if (error) throw new Error(`savedCount: ${error.message}`)
    return count ?? 0
  }

  const fillSavedTo = async (target: number): Promise<void> => {
    const missing = target - (await savedCount())
    if (missing < 0) throw new Error(`fillSavedTo: already ${target - missing} saved rows`)
    if (missing === 0) return
    const now = new Date().toISOString()
    const rows = Array.from({ length: missing }, () =>
      sessionRow({ deleted_at: now, saved_at: now }),
    )
    const { error } = await admin.from('quiz_sessions').insert(rows)
    if (error) throw new Error(`fillSavedTo: ${error.message}`)
  }

  const readRow = async (sessionId: string) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('deleted_at, saved_at, ended_at, active_device_id')
      .eq('id', sessionId)
      .single()
    if (error || !data) throw new Error(`readRow: ${error?.message}`)
    return data
  }

  const claimThenSave = async (sessionId: string) => {
    const claim = await student.rpc('claim_quiz_session', {
      p_session_id: sessionId,
      p_device_id: DEVICE_A,
    })
    const save = await student.rpc('save_quiz_for_later', {
      p_session_id: sessionId,
      p_device_id: DEVICE_A,
    })
    return { claim, save }
  }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    studentId = seed.attackerUserId
    student = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    const { data, error } = await admin
      .from('questions')
      .select('id')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('id')
      .limit(2)
    if (error) throw new Error(`beforeAll questions: ${error.message}`)
    if (!Array.isArray(data) || data.length < 2) throw new Error('need 2 active questions')
    questionIds = data.map((q) => q.id as string)
  })

  test.beforeEach(async () => {
    await clearOpenSessions(admin, studentId, 'saved-cap')
  })

  test.afterEach(async () => {
    const errors: string[] = []
    try {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ saved_at: null })
        .eq('config->>e2e_marker', E2E_REDTEAM_BS_MARKER)
        .not('saved_at', 'is', null)
        .select('id')
      if (error) throw new Error(`unsave: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.info(`[saved-cap] unsaved ${data?.length}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('config->>e2e_marker', E2E_REDTEAM_BS_MARKER)
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`soft-delete: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.info(`[saved-cap] soft-deleted ${data?.length}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  test('HL: claim + save past the cap is refused and the slot stays occupied', async () => {
    await fillSavedTo(SAVED_CAP)
    expect(await savedCount()).toBe(SAVED_CAP)
    const open = await insertOpen(DEVICE_B)
    if (open.error || !isRecord(open.data) || typeof open.data.id !== 'string')
      throw new Error(`insertOpen: ${open.error?.message ?? 'bad shape'}`)
    const sessionId = open.data.id

    const { claim, save } = await claimThenSave(sessionId)
    expect(claim.error).toBeNull()
    expect(save.error?.message).toBe('saved_quiz_limit_reached')
    expect(await readRow(sessionId)).toEqual({
      deleted_at: null,
      saved_at: null,
      ended_at: null,
      active_device_id: DEVICE_A,
    })
    expect(await savedCount()).toBe(SAVED_CAP)
    const second = await insertOpen(null)
    expect(second.error?.code).toBe('23505')

    // Control: one under the cap, the same save parks the session and frees the slot.
    const { data: pick, error: pickErr } = await admin
      .from('quiz_sessions')
      .select('id')
      .eq('config->>e2e_marker', E2E_REDTEAM_BS_MARKER)
      .eq('student_id', studentId)
      .not('saved_at', 'is', null)
      .limit(1)
      .single()
    if (pickErr || !pick) throw new Error(`pick saved row: ${pickErr?.message}`)
    const { data: freed, error: unsaveErr } = await admin
      .from('quiz_sessions')
      .update({ saved_at: null })
      .eq('id', pick.id)
      .select('id')
    expect(unsaveErr).toBeNull()
    expect(freed).toHaveLength(1)
    expect(await savedCount()).toBe(SAVED_CAP - 1)

    const retry = await claimThenSave(sessionId)
    expect(retry.claim.error).toBeNull()
    expect(retry.save.error).toBeNull()
    const parked = await readRow(sessionId)
    expect(parked.saved_at).not.toBeNull()
    expect(parked.deleted_at).not.toBeNull()
    expect(parked.active_device_id).toBeNull()
    expect(await savedCount()).toBe(SAVED_CAP)
    const next = await insertOpen(null)
    expect(next.error).toBeNull()
  })
})
