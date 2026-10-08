import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearActiveSessions } from './cleanup'
import { requireRpcResult } from './guards'
import { type ProgressFixture, setupProgressFixture, startPractice } from './quiz-progress-fixture'

const DEVICE_A = '11111111-1111-4111-8111-111111111111'
const DEVICE_B = '22222222-2222-4222-8222-222222222222'

type Client = ProgressFixture['student']
type AuditRow = {
  actor_id: string | null
  actor_role: string | null
  organization_id: string | null
  resource_type: string | null
  resource_id: string | null
  metadata: Record<string, unknown> | null
}

describe('RPC: saved-quiz audit events', () => {
  let f: ProgressFixture

  beforeAll(async () => {
    f = await setupProgressFixture('qsavedaudit')
  })
  afterAll(async () => {
    await f.teardown()
  })
  beforeEach(async () => {
    await clearActiveSessions({ admin: f.admin, orgId: f.orgId })
    const { error } = await f.admin
      .from('quiz_sessions')
      .update({ saved_at: null })
      .eq('organization_id', f.orgId)
      .not('saved_at', 'is', null)
    expect(error).toBeNull()
  })

  const save = (c: Client, id: string, device = DEVICE_A) =>
    c.rpc('save_quiz_for_later', { p_session_id: id, p_device_id: device })
  const resume = (c: Client, id: string, device = DEVICE_A) =>
    c.rpc('resume_saved_quiz', { p_session_id: id, p_device_id: device })
  const discard = (c: Client, id: string) => c.rpc('discard_saved_quiz', { p_session_id: id })

  async function events(sessionId: string, eventType: string): Promise<AuditRow[]> {
    const { data, error } = await f.admin
      .from('audit_events')
      .select('actor_id, actor_role, organization_id, resource_type, resource_id, metadata')
      .eq('resource_id', sessionId)
      .eq('event_type', eventType)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    return (data ?? []) as AuditRow[]
  }

  async function expectSessionExists(sessionId: string) {
    const { data, error } = await f.admin
      .from('quiz_sessions')
      .select('id')
      .eq('id', sessionId)
      .single()
    expect(error).toBeNull()
    expect(data).not.toBeNull()
  }

  async function studentRole(): Promise<string> {
    const { data, error } = await f.admin
      .from('users')
      .select('role')
      .eq('id', f.studentId)
      .single()
    expect(error).toBeNull()
    return requireRpcResult<{ role: string }>(data, 'student role').role
  }

  async function savedSession(): Promise<string> {
    const id = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 3))
    expect((await save(f.student, id)).error).toBeNull()
    return id
  }

  it('records one saved event with the student, role and organization', async () => {
    const id = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 3))
    await expectSessionExists(id)
    expect(await events(id, 'quiz_session.saved')).toHaveLength(0)

    expect((await save(f.student, id)).error).toBeNull()
    const rows = await events(id, 'quiz_session.saved')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      actor_id: f.studentId,
      actor_role: await studentRole(),
      organization_id: f.orgId,
      resource_type: 'quiz_session',
      resource_id: id,
    })
  })

  it('records no further saved event when a save is retried', async () => {
    const id = await savedSession()
    expect(await events(id, 'quiz_session.saved')).toHaveLength(1)

    expect((await save(f.student, id)).error).toBeNull()
    expect(await events(id, 'quiz_session.saved')).toHaveLength(1)
  })

  it('records a resumed event for a saved quiz and another when it is resumed again', async () => {
    const id = await savedSession()
    expect(await events(id, 'quiz_session.resumed')).toHaveLength(0)

    expect((await resume(f.student, id, DEVICE_B)).error).toBeNull()
    const first = await events(id, 'quiz_session.resumed')
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({
      actor_id: f.studentId,
      actor_role: await studentRole(),
      organization_id: f.orgId,
      resource_type: 'quiz_session',
      resource_id: id,
    })
    expect(first[0]?.metadata).toMatchObject({ already_active: false })

    expect((await resume(f.student, id, DEVICE_B)).error).toBeNull()
    const all = await events(id, 'quiz_session.resumed')
    expect(all).toHaveLength(2)
    expect(all.map((r) => r.metadata?.already_active).sort()).toEqual([false, true])
  })

  it('records a saved-discarded event when a saved quiz is discarded', async () => {
    const id = await savedSession()
    expect(await events(id, 'quiz_session.saved_discarded')).toHaveLength(0)

    expect((await discard(f.student, id)).error).toBeNull()
    const rows = await events(id, 'quiz_session.saved_discarded')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      actor_id: f.studentId,
      actor_role: await studentRole(),
      organization_id: f.orgId,
      resource_type: 'quiz_session',
      resource_id: id,
    })
  })

  it('records nothing when a foreign student tries to resume or discard a saved quiz', async () => {
    const id = await savedSession()
    await expectSessionExists(id)

    expect((await resume(f.other, id)).error?.message).toBe('session_not_found')
    expect((await discard(f.other, id)).error?.message).toBe('session_not_found')
    expect(await events(id, 'quiz_session.resumed')).toHaveLength(0)
    expect(await events(id, 'quiz_session.saved_discarded')).toHaveLength(0)
  })

  it('records no resumed event when a discarded quiz is refused', async () => {
    const id = await savedSession()
    expect((await discard(f.student, id)).error).toBeNull()
    await expectSessionExists(id)

    expect((await resume(f.student, id)).error?.message).toBe('session_not_saved')
    expect(await events(id, 'quiz_session.resumed')).toHaveLength(0)
    expect(await events(id, 'quiz_session.saved_discarded')).toHaveLength(1)
  })
})
