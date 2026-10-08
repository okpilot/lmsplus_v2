/**
 * Red Team Spec: resume_saved_quiz on an already-open row + save/resume/discard audit (#1486) — Vectors HU/HV
 *
 * Surface: resume_saved_quiz / save_quiz_for_later / discard_saved_quiz (migration 20261008000100),
 * audit_events (audit_no_update / audit_no_delete).
 *
 * HU (auth-bypass): the open-row branch of resume_saved_quiz claims active_device_id without the
 *     saved-row checks. It must stay limited to the caller's own open quick_quiz / smart_review row:
 *     an open mock_exam, an ended or discarded practice row and another student's open row are refused
 *     and keep their device.
 *     CONTROL: the caller's own open practice row is claimed, and the displaced device's
 *     save_quiz_position is refused with session_taken_over.
 * HV (sibling-guard-gap): each successful save / resume / discard writes exactly one audit row with the
 *     caller as actor and the session's org; a refused or idempotent call writes none; the student
 *     cannot UPDATE or DELETE the rows.
 *     CONTROL: the same student reads the rows through audit_read_own.
 *
 * Status: Expected to PASS.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { clearOpenSessions } from './helpers/clear-open-sessions'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_SQ_MARKER } from './helpers/seed-markers'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed-users'

type Client = Awaited<ReturnType<typeof createAuthenticatedClient>>

const DEVICE_A = '00000000-0000-4000-8000-0000000000a1'
const DEVICE_B = '00000000-0000-4000-8000-0000000000b2'
const SAVED_EVENTS = ['quiz_session.saved', 'quiz_session.resumed', 'quiz_session.saved_discarded']

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

test.describe('Red Team: resume open row + saved-quiz audit (Vectors HU/HV)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attacker: Client
  let victim: Client
  let orgId: string
  let attackerUserId: string
  let victimUserId: string
  let q1: string
  let q2: string

  const seedSession = async (
    studentId: string,
    opts: { mode: 'quick_quiz' | 'mock_exam'; device?: string | null },
  ): Promise<string> => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode: opts.mode,
        total_questions: 2,
        time_limit_seconds: opts.mode === 'mock_exam' ? 3600 : null,
        active_device_id: opts.device ?? null,
        config: { question_ids: [q1, q2], e2e_marker: E2E_REDTEAM_SQ_MARKER },
      })
      .select('id')
      .single()
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`seedSession(${opts.mode}): ${error?.message ?? 'bad shape'}`)
    return data.id
  }

  const patchRow = async (sessionId: string, patch: Record<string, string | null>) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .update(patch)
      .eq('id', sessionId)
      .select('id')
    if (error || data?.length !== 1) throw new Error(`patchRow: ${error?.message ?? 'no row'}`)
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

  const auditRows = async (sessionId: string) => {
    const { data, error } = await admin
      .from('audit_events')
      .select('id, event_type, actor_id, actor_role, organization_id, metadata')
      .eq('resource_id', sessionId)
      .in('event_type', SAVED_EVENTS)
      .order('created_at')
    if (error) throw new Error(`auditRows: ${error.message}`)
    return data ?? []
  }

  const resume = (client: Client, sessionId: string, device: string) =>
    client.rpc('resume_saved_quiz', { p_session_id: sessionId, p_device_id: device })

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
      .order('id')
      .limit(2)
    if (error) throw new Error(`beforeAll questions: ${error.message}`)
    if (!Array.isArray(data) || data.length < 2) throw new Error('need 2 active MC questions')
    q1 = data[0]?.id as string
    q2 = data[1]?.id as string
  })

  test.beforeEach(async () => {
    await clearOpenSessions(admin, victimUserId, 'resume-open')
    await clearOpenSessions(admin, attackerUserId, 'resume-open')
  })

  test.afterEach(async () => {
    const errors: string[] = []
    try {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ saved_at: null })
        .eq('config->>e2e_marker', E2E_REDTEAM_SQ_MARKER)
        .not('saved_at', 'is', null)
        .select('id')
      if (error) throw new Error(`unsave: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.info(`[resume-open] unsaved ${data?.length}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('config->>e2e_marker', E2E_REDTEAM_SQ_MARKER)
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`soft-delete: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.info(`[resume-open] soft-deleted ${data?.length}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  test('HU: an open exam, an ended or discarded row and a foreign open row cannot be claimed by resume', async () => {
    const examId = await seedSession(victimUserId, { mode: 'mock_exam', device: DEVICE_A })
    const examBefore = await readRow(examId)
    expect(examBefore.active_device_id).toBe(DEVICE_A)
    expect((await resume(victim, examId, DEVICE_B)).error?.message).toBe('session_not_saved')
    expect(await readRow(examId)).toEqual(examBefore)
    await clearOpenSessions(admin, victimUserId, 'resume-open')

    const endedId = await seedSession(victimUserId, { mode: 'quick_quiz', device: DEVICE_A })
    await patchRow(endedId, { ended_at: new Date().toISOString() })
    const endedBefore = await readRow(endedId)
    expect(endedBefore.ended_at).not.toBeNull()
    expect((await resume(victim, endedId, DEVICE_B)).error?.message).toBe('session_not_saved')
    expect(await readRow(endedId)).toEqual(endedBefore)

    const discardedId = await seedSession(victimUserId, { mode: 'quick_quiz', device: DEVICE_A })
    await patchRow(discardedId, { deleted_at: new Date().toISOString() })
    const discardedBefore = await readRow(discardedId)
    expect(discardedBefore.deleted_at).not.toBeNull()
    expect((await resume(victim, discardedId, DEVICE_B)).error?.message).toBe('session_not_saved')
    expect(await readRow(discardedId)).toEqual(discardedBefore)

    const victimOpenId = await seedSession(victimUserId, { mode: 'quick_quiz', device: DEVICE_A })
    const foreign = await resume(attacker, victimOpenId, DEVICE_B)
    expect(foreign.data).toBeNull()
    expect(foreign.error?.message).toBe('session_not_found')
    expect((await readRow(victimOpenId)).active_device_id).toBe(DEVICE_A)
    expect(await auditRows(victimOpenId)).toEqual([])
    for (const id of [examId, endedId, discardedId]) expect(await auditRows(id)).toEqual([])

    // Control: the owner's own open practice row is claimed, displacing DEVICE_A.
    expect((await resume(victim, victimOpenId, DEVICE_B)).error).toBeNull()
    expect(await readRow(victimOpenId)).toEqual({
      deleted_at: null,
      saved_at: null,
      ended_at: null,
      active_device_id: DEVICE_B,
    })
    const stale = await victim.rpc('save_quiz_position', {
      p_session_id: victimOpenId,
      p_current_index: 1,
      p_pinned_question_ids: [],
      p_device_id: DEVICE_A,
    })
    expect(stale.error?.message).toBe('session_taken_over')
  })

  test('HV: save, resume and discard each write one immutable audit row; refusals write none', async () => {
    const sessionId = await seedSession(victimUserId, { mode: 'quick_quiz', device: DEVICE_A })
    expect(await auditRows(sessionId)).toEqual([])

    // Refused calls write nothing: a discard of an unsaved row, a foreign save/resume/discard.
    expect(
      (await victim.rpc('discard_saved_quiz', { p_session_id: sessionId })).error?.message,
    ).toBe('session_not_found')
    expect(
      (
        await attacker.rpc('save_quiz_for_later', {
          p_session_id: sessionId,
          p_device_id: DEVICE_A,
        })
      ).error?.message,
    ).toBe('session_not_found')
    expect(await auditRows(sessionId)).toEqual([])

    const save = () =>
      victim.rpc('save_quiz_for_later', { p_session_id: sessionId, p_device_id: DEVICE_A })
    expect((await save()).error).toBeNull()
    expect((await save()).error).toBeNull()
    expect(
      (await attacker.rpc('resume_saved_quiz', { p_session_id: sessionId, p_device_id: DEVICE_B }))
        .error?.message,
    ).toBe('session_not_found')
    expect(
      (await attacker.rpc('discard_saved_quiz', { p_session_id: sessionId })).error?.message,
    ).toBe('session_not_found')
    expect((await auditRows(sessionId)).map((r) => r.event_type)).toEqual(['quiz_session.saved'])

    expect((await resume(victim, sessionId, DEVICE_A)).error).toBeNull()
    expect((await resume(victim, sessionId, DEVICE_B)).error).toBeNull()
    expect((await save()).error?.message).toBe('session_taken_over')
    const saveB = await victim.rpc('save_quiz_for_later', {
      p_session_id: sessionId,
      p_device_id: DEVICE_B,
    })
    expect(saveB.error).toBeNull()
    expect((await victim.rpc('discard_saved_quiz', { p_session_id: sessionId })).error).toBeNull()

    const rows = await auditRows(sessionId)
    expect(
      rows.map((r) => [r.event_type, isRecord(r.metadata) ? r.metadata.already_active : null]),
    ).toEqual([
      ['quiz_session.saved', undefined],
      ['quiz_session.resumed', false],
      ['quiz_session.resumed', true],
      ['quiz_session.saved', undefined],
      ['quiz_session.saved_discarded', undefined],
    ])
    for (const r of rows) {
      expect(r.actor_id).toBe(victimUserId)
      expect(r.actor_role).toBe('student')
      expect(r.organization_id).toBe(orgId)
    }

    // Control: the owner reads the rows; tampering is a no-op.
    const own = await victim
      .from('audit_events')
      .select('id')
      .eq('resource_id', sessionId)
      .in('event_type', SAVED_EVENTS)
    expect(own.error).toBeNull()
    expect(own.data?.length).toBe(rows.length)
    const ids = rows.map((r) => r.id)
    const upd = await victim
      .from('audit_events')
      .update({ metadata: { forged: true } })
      .in('id', ids)
      .select('id')
    expect(upd.error === null ? upd.data : []).toEqual([])
    const del = await victim.from('audit_events').delete().in('id', ids).select('id')
    expect(del.error === null ? del.data : []).toEqual([])
    expect(await auditRows(sessionId)).toEqual(rows)
  })
})
