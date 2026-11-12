/**
 * Red Team Spec: start_internal_exam_session code-state oracle for a soft-deleted caller (Vector LK, #1024)
 *
 * A soft-deleted student with a still-valid JWT probes codes. Every probe must raise
 * 'user not found or inactive' (mig 20261109000200), never a code-state token, and must
 * consume nothing, start nothing and write no audit row.
 * Control arm: the same student while active gets three DISTINCT code-state tokens, so the
 * oracle exists when the active-user condition is absent.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  E2E_REDTEAM_CODE_PREFIX,
  E2E_REDTEAM_EO_SOFTDEL_STUDENT_EMAIL,
  E2E_REDTEAM_EO_SOFTDEL_STUDENT_PASSWORD,
} from './helpers/seed-markers'
import { pickSubjectWithQuestions } from './helpers/seed-quiz'
import { seedRedTeamUsers } from './helpers/seed-users'
import { ensureEoSoftDelStudent } from './helpers/start-quiz-fixtures'

const RPC = 'start_internal_exam_session'
const INACTIVE = /user not found or inactive/i

function newCode(): string {
  const tail = crypto
    .randomUUID()
    .replace(/-/g, '')
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, 'A')
    .slice(0, 6)
  return `${E2E_REDTEAM_CODE_PREFIX}${tail}`
}

test.describe('Red Team: soft-deleted caller gets no code-state oracle from start_internal_exam_session (Vector LK)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let orgId: string
  let subjectId: string
  let victimUserId: string
  let studentId: string
  let studentClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  const codeIds = new Set<string>()

  async function seedCode(owner: string, voided = false): Promise<string> {
    const code = newCode()
    const { data, error } = await admin
      .from('internal_exam_codes')
      .insert({
        code,
        subject_id: subjectId,
        student_id: owner,
        issued_by: owner,
        organization_id: orgId,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        ...(voided ? { voided_at: new Date().toISOString(), voided_by: owner } : {}),
      })
      .select('id, code')
      .single()
    if (error || !data) throw new Error(`seedCode: ${error?.message}`)
    codeIds.add(data.id)
    return data.code
  }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    victimUserId = seed.victimUserId
    subjectId = (await pickSubjectWithQuestions(admin, { orgId })).subjectId
    studentId = await ensureEoSoftDelStudent(admin, orgId)
    studentClient = await createAuthenticatedClient(
      E2E_REDTEAM_EO_SOFTDEL_STUDENT_EMAIL,
      E2E_REDTEAM_EO_SOFTDEL_STUDENT_PASSWORD,
    )
  })

  test.afterEach(async () => {
    const errors: string[] = []
    // The shared EO-SD throwaway rests soft-deleted; ensureEoSoftDelStudent realigns it.
    try {
      const { error } = await admin
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', studentId)
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`soft-delete student: ${error.message}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      if (codeIds.size > 0) {
        const { data, error } = await admin
          .from('internal_exam_codes')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', Array.from(codeIds))
          .is('deleted_at', null)
          .select('id')
        if (error) throw new Error(`soft-delete codes: ${error.message}`)
        if ((data?.length ?? 0) > 0)
          console.log(`[LK afterEach] soft-deleted ${data?.length} code(s)`)
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      codeIds.clear()
    }
    try {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('student_id', studentId)
        .eq('mode', 'internal_exam')
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`soft-delete sessions: ${error.message}`)
      if ((data?.length ?? 0) > 0)
        console.log(`[LK afterEach] soft-deleted ${data?.length} session(s)`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  test('every code probe returns the same inactive error once the caller is soft-deleted', async () => {
    const foreignCode = await seedCode(victimUserId)
    const voidedCode = await seedCode(studentId, true)
    const liveCode = await seedCode(studentId)
    const missingCode = newCode()

    // Control arm: active caller — three distinct code-state tokens (the oracle).
    const ctrlForeign = await studentClient.rpc(RPC, { p_code: foreignCode })
    const ctrlVoided = await studentClient.rpc(RPC, { p_code: voidedCode })
    const ctrlMissing = await studentClient.rpc(RPC, { p_code: missingCode })
    expect(ctrlForeign.error?.message ?? '').toMatch(/code_not_yours/)
    expect(ctrlVoided.error?.message ?? '').toMatch(/code_voided/)
    expect(ctrlMissing.error?.message ?? '').toMatch(/code_not_found/)

    const { count: auditBefore, error: auditBeforeErr } = await admin
      .from('audit_events')
      .select('id', { count: 'exact', head: true })
      .eq('actor_id', studentId)
    expect(auditBeforeErr).toBeNull()

    const { data: deleted, error: delErr } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', studentId)
      .is('deleted_at', null)
      .select('id')
    expect(delErr).toBeNull()
    expect(deleted?.length).toBe(1)

    const probes = [foreignCode, voidedCode, missingCode, liveCode]
    const results = []
    for (const p_code of probes) {
      const r = await studentClient.rpc(RPC, { p_code })
      results.push({ p_code, data: r.data, message: r.error?.message ?? '' })
    }

    expect(results).toHaveLength(probes.length)
    for (const r of results) {
      expect(r.message, r.p_code).toMatch(INACTIVE)
      expect(r.data, r.p_code).toBeNull()
    }

    const { data: codeRows, error: codeErr } = await admin
      .from('internal_exam_codes')
      .select('id, consumed_at, consumed_session_id')
      .in('id', Array.from(codeIds))
    expect(codeErr).toBeNull()
    expect(codeRows?.length).toBe(codeIds.size)
    for (const row of codeRows ?? []) {
      expect(row.consumed_at).toBeNull()
      expect(row.consumed_session_id).toBeNull()
    }

    const { data: sessions, error: sessErr } = await admin
      .from('quiz_sessions')
      .select('id')
      .eq('student_id', studentId)
      .eq('mode', 'internal_exam')
      .is('deleted_at', null)
    expect(sessErr).toBeNull()
    expect(sessions ?? []).toHaveLength(0)

    const { count: auditAfter, error: auditAfterErr } = await admin
      .from('audit_events')
      .select('id', { count: 'exact', head: true })
      .eq('actor_id', studentId)
    expect(auditAfterErr).toBeNull()
    expect(auditAfter).toBe(auditBefore)
  })
})
