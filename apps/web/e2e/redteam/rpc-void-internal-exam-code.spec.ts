/**
 * Red Team Spec: void_internal_exam_code RPC
 *
 * Vectors BN/BO/BP (HIGH). Admin-only RPC that voids a code and (optionally)
 * ends the linked active session. Tests cover:
 *  - BN(1) unauthenticated → not_authenticated
 *  - BN(2) student → not_admin
 *  - BO    cross-org admin → code_not_found (existence-hiding)
 *  - BP    consumed + finished session → cannot_void_finished_attempt
 *  - CD    consumed code, linked session soft-deleted before void →
 *          session_state_changed (fail-fast, code NOT voided — mig 084)
 *  - positive — consumed + active session ends with passed=false.
 */

import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  ensureExamConfig,
  pickSubjectWithQuestions,
  seedCrossOrgAdmin,
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const unauthClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

type SeedOpts = {
  studentId: string
  subjectId: string
  orgId: string
  issuedBy: string
  consumedSessionId?: string
}

async function seedCode(
  admin: ReturnType<typeof getAdminClient>,
  opts: SeedOpts,
): Promise<{ id: string; code: string }> {
  // crypto.randomUUID() is collision-resistant; Math.random() can collide
  // across rapid test runs in the same describe block.
  const code = `RT${crypto
    .randomUUID()
    .replace(/-/g, '')
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, 'A')
    .slice(0, 6)}`
  const row: Record<string, unknown> = {
    code,
    subject_id: opts.subjectId,
    student_id: opts.studentId,
    issued_by: opts.issuedBy,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    organization_id: opts.orgId,
    ...(opts.consumedSessionId
      ? { consumed_at: new Date().toISOString(), consumed_session_id: opts.consumedSessionId }
      : {}),
  }
  const { data, error } = await admin
    .from('internal_exam_codes')
    .insert(row)
    .select('id, code')
    .single()
  if (error || !data) throw new Error(`seedCode: ${error?.message}`)
  return data
}

async function seedSession(
  admin: ReturnType<typeof getAdminClient>,
  opts: { studentId: string; subjectId: string; orgId: string; ended?: boolean },
): Promise<string> {
  const row: Record<string, unknown> = {
    organization_id: opts.orgId,
    student_id: opts.studentId,
    mode: 'internal_exam',
    subject_id: opts.subjectId,
    config: { question_ids: [], pass_mark: 75 },
    total_questions: 1,
    time_limit_seconds: 600,
    ...(opts.ended
      ? {
          ended_at: new Date().toISOString(),
          score_percentage: 100,
          passed: true,
          correct_count: 1,
        }
      : {}),
  }
  const { data, error } = await admin.from('quiz_sessions').insert(row).select('id').single()
  if (error || !data) throw new Error(`seedSession: ${error?.message}`)
  return data.id
}

test.describe('Red Team: void_internal_exam_code RPC', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attackerStudentClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let adminClientAuthed: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let crossOrgAdminClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let adminUserId: string
  let victimUserId: string
  let orgId: string
  let subjectId: string

  test.beforeAll(async () => {
    admin = getAdminClient()

    const seed = await seedRedTeamUsers()
    victimUserId = seed.victimUserId
    orgId = seed.orgId

    const {
      adminUserId: aId,
      email: adminEmail,
      password: adminPassword,
    } = await seedRedTeamAdmin()
    adminUserId = aId

    const crossOrg = await seedCrossOrgAdmin()

    attackerStudentClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    adminClientAuthed = await createAuthenticatedClient(adminEmail, adminPassword)
    crossOrgAdminClient = await createAuthenticatedClient(crossOrg.email, crossOrg.password)

    const picked = await pickSubjectWithQuestions(admin, { orgId })
    subjectId = picked.subjectId
    const topicId = picked.topicId

    // Egmont org needs the exam_config so subject is "exam-eligible".
    await ensureExamConfig(orgId, subjectId, topicId)
  })

  // Compact factories — every test uses the same victim+subject+org+issuer.
  const validCode = () =>
    seedCode(admin, { studentId: victimUserId, subjectId, orgId, issuedBy: adminUserId })
  const codeForSession = (consumedSessionId: string) =>
    seedCode(admin, {
      studentId: victimUserId,
      subjectId,
      orgId,
      issuedBy: adminUserId,
      consumedSessionId,
    })
  const session = (ended?: boolean) =>
    seedSession(admin, { studentId: victimUserId, subjectId, orgId, ended })

  test('unauthenticated call returns not_authenticated (Vector BN-1)', async () => {
    const code = await validCode()
    const { data, error } = await unauthClient.rpc('void_internal_exam_code', {
      p_code_id: code.id,
      p_reason: 'red team',
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not_authenticated/i)
    expect(data).toBeNull()
  })

  test('authenticated student (non-admin) cannot void a code (Vector BN-2)', async () => {
    const code = await validCode()
    const { data, error } = await attackerStudentClient.rpc('void_internal_exam_code', {
      p_code_id: code.id,
      p_reason: 'red team',
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not_admin/i)
    expect(data).toBeNull()
  })

  test('cross-org admin cannot void code in foreign org (Vector BO)', async () => {
    const code = await validCode()
    const { data, error } = await crossOrgAdminClient.rpc('void_internal_exam_code', {
      p_code_id: code.id,
      p_reason: 'red team cross-org void',
    })

    expect(error).not.toBeNull()
    // Existence-hiding: must report code_not_found, not a more specific error.
    expect(error?.message ?? '').toMatch(/code_not_found/i)
    expect(data).toBeNull()

    const { data: row } = await admin
      .from('internal_exam_codes')
      .select('voided_at')
      .eq('id', code.id)
      .single()
    expect(row?.voided_at ?? null).toBeNull()
  })

  test('void on consumed code with finished session raises cannot_void_finished_attempt (Vector BP)', async () => {
    const sessionId = await session(true)
    const code = await codeForSession(sessionId)

    const { data, error } = await adminClientAuthed.rpc('void_internal_exam_code', {
      p_code_id: code.id,
      p_reason: 'attempted retroactive void',
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/cannot_void_finished_attempt/i)
    expect(data).toBeNull()

    // Score must NOT have changed.
    const { data: sessionRow } = await admin
      .from('quiz_sessions')
      .select('score_percentage, passed')
      .eq('id', sessionId)
      .single()
    expect(sessionRow?.score_percentage).toBe(100)
    expect(sessionRow?.passed).toBe(true)
  })

  test('positive path: voiding a code with an active session ends it with passed=false', async () => {
    const sessionId = await session()
    const code = await codeForSession(sessionId)

    const { data, error } = await adminClientAuthed.rpc('void_internal_exam_code', {
      p_code_id: code.id,
      p_reason: 'positive path',
    })

    expect(error).toBeNull()
    const result = (
      data as Array<{ code_id: string; session_id: string; session_ended: boolean }> | null
    )?.[0]
    expect(result?.code_id).toBe(code.id)
    expect(result?.session_id).toBe(sessionId)
    expect(result?.session_ended).toBe(true)

    // DB asserts: session ended with passed=false, code voided by this admin.
    const { data: sessionRow } = await admin
      .from('quiz_sessions')
      .select('ended_at, passed')
      .eq('id', sessionId)
      .single()
    expect(sessionRow?.ended_at).not.toBeNull()
    expect(sessionRow?.passed).toBe(false)

    const { data: codeRow } = await admin
      .from('internal_exam_codes')
      .select('voided_at, voided_by, void_reason')
      .eq('id', code.id)
      .single()
    expect(codeRow?.voided_at).not.toBeNull()
    expect(codeRow?.voided_by).toBe(adminUserId)
    expect(codeRow?.void_reason).toBe('positive path')
  })

  test('voiding a consumed code whose session was soft-deleted raises session_state_changed (Vector CD)', async () => {
    const sessionId = await session()
    const code = await codeForSession(sessionId)

    // Session vanishes between consume and void (service-role soft-delete
    // simulates an admin/cleanup path or org drift). The org-scoped
    // SELECT ... FOR UPDATE then finds no row → fail-fast (mig 084) instead
    // of silently voiding the code on a phantom session.
    const { data: deleted, error: delErr } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', sessionId)
      .is('deleted_at', null)
      .select('id')
    if (delErr) throw new Error(`soft-delete session: ${delErr.message}`)
    expect(deleted?.length ?? 0).toBe(1)

    const { data, error } = await adminClientAuthed.rpc('void_internal_exam_code', {
      p_code_id: code.id,
      p_reason: 'void on soft-deleted session',
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/session_state_changed/i)
    expect(data).toBeNull()

    // Fail-fast aborts the whole RPC — the code must NOT have been voided.
    const { data: codeRow } = await admin
      .from('internal_exam_codes')
      .select('voided_at')
      .eq('id', code.id)
      .single()
    expect(codeRow?.voided_at ?? null).toBeNull()
  })
})
