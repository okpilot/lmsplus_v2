/**
 * Red Team Spec: start_internal_exam_session RPC
 *
 * Vectors BJ / BK / BL / BM (HIGH/MEDIUM): student-facing RPC that redeems a
 * single-use code and creates an internal_exam quiz_session.
 *  - BJ: unauthenticated → 'not_authenticated'
 *  - BK: student-B uses student-A's code → 'code_not_yours' (cross-student)
 *  - BL(1): expired code → 'code_expired'
 *  - BL(2): voided code  → 'code_voided'
 *  - BM:  double-redemption / consumed code → 'code_already_used'
 *  - extra: starting a second concurrent code while a session is already
 *           active for the same subject → 'active_session_exists'
 *
 * Status: Expected to PASS — every guard is in the SECURITY DEFINER body.
 */

import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  ensureExamConfig,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const unauthClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

type CodeRow = { id: string; code: string }

async function seedCode(
  admin: ReturnType<typeof getAdminClient>,
  opts: {
    studentId: string
    subjectId: string
    orgId: string
    expiresInMs?: number
    consumedAt?: string | null
    consumedSessionId?: string | null
    voidedAt?: string | null
    voidedBy?: string | null
  },
): Promise<CodeRow> {
  // crypto.randomUUID() is collision-resistant; Math.random() can collide
  // across rapid test runs in the same describe block.
  const code = `RT${crypto
    .randomUUID()
    .replace(/-/g, '')
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, 'A')
    .slice(0, 6)}`
  const expiresAt = new Date(Date.now() + (opts.expiresInMs ?? 60 * 60 * 1000)).toISOString()
  const insertRow: Record<string, unknown> = {
    code,
    subject_id: opts.subjectId,
    student_id: opts.studentId,
    issued_by: opts.studentId, // FK satisfaction; not exercised by the RPC
    expires_at: expiresAt,
    organization_id: opts.orgId,
  }
  if (opts.consumedAt) {
    insertRow.consumed_at = opts.consumedAt
    // CHECK constraint consumed_pair_consistency requires consumed_session_id
    // and consumed_at to be NULL together or both set together. When the caller
    // doesn't provide a real session id, synthesise a placeholder quiz_session
    // so the seed satisfies the constraint and the RPC's read-side guard runs.
    let sessionId = opts.consumedSessionId
    if (!sessionId) {
      const { data: sessionRow, error: sessionErr } = await admin
        .from('quiz_sessions')
        .insert({
          organization_id: opts.orgId,
          student_id: opts.studentId,
          mode: 'internal_exam',
          subject_id: opts.subjectId,
          config: { question_ids: [] },
          total_questions: 0,
          ended_at: opts.consumedAt,
        })
        .select('id')
        .single()
      if (sessionErr || !sessionRow) {
        throw new Error(`seedCode placeholder session: ${sessionErr?.message}`)
      }
      sessionId = sessionRow.id
    }
    insertRow.consumed_session_id = sessionId
  }
  if (opts.voidedAt) {
    insertRow.voided_at = opts.voidedAt
    insertRow.voided_by = opts.voidedBy ?? opts.studentId
  }
  const { data, error } = await admin
    .from('internal_exam_codes')
    .insert(insertRow)
    .select('id, code')
    .single()
  if (error || !data) throw new Error(`seedCode: ${error?.message}`)
  return data
}

test.describe('Red Team: start_internal_exam_session RPC', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let victimClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let attackerUserId: string
  let victimUserId: string
  let orgId: string
  let subjectId: string

  test.beforeAll(async () => {
    admin = getAdminClient()

    const seed = await seedRedTeamUsers()
    attackerUserId = seed.attackerUserId
    victimUserId = seed.victimUserId
    orgId = seed.orgId

    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    victimClient = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)

    // Resolve subject + topic from egmont and ensure an exam_config exists so
    // the RPC can reach the active-session / consumption code paths.
    const { data: subjects } = await admin.from('easa_subjects').select('id').limit(1)
    if (!subjects || subjects.length === 0) {
      throw new Error('seed: no easa_subjects rows available for red-team setup')
    }
    subjectId = subjects[0]!.id

    const { data: topics } = await admin
      .from('easa_topics')
      .select('id')
      .eq('subject_id', subjectId)
      .limit(1)
    // Don't fall back to subjectId — easa_topics.id and easa_subjects.id are
    // distinct relations; a fallback would FK-fail downstream with a confusing
    // error instead of a clear setup failure.
    const topicId = topics?.[0]?.id
    if (!topicId) {
      throw new Error(
        `seed: no easa_topics row for subject ${subjectId} — red-team fixtures need at least one topic`,
      )
    }

    await ensureExamConfig(orgId, subjectId, topicId)
  })

  test('unauthenticated call returns not_authenticated (Vector BJ)', async () => {
    const { data, error } = await unauthClient.rpc('start_internal_exam_session', {
      p_code: 'NEVERUSED',
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not_authenticated/i)
    expect(data).toBeNull()
  })

  test('student-B using student-A code is rejected without disclosing existence (Vector BK)', async () => {
    const code = await seedCode(admin, {
      studentId: victimUserId,
      subjectId,
      orgId,
    })

    // Attacker (student-B) tries to redeem the victim's code.
    const { data, error } = await attackerClient.rpc('start_internal_exam_session', {
      p_code: code.code,
    })

    expect(error).not.toBeNull()
    // The RPC raises 'code_not_yours'; spec-design also accepts 'code_not_found'
    // as an existence-hiding alternative. Either is a valid generic error and
    // must NOT leak any session id, exam config, or question ids.
    expect(error?.message ?? '').toMatch(/code_not_yours|code_not_found/i)
    expect(data).toBeNull()

    // Belt-and-braces: no session was created for the attacker against the
    // victim's code.
    const { data: probe } = await admin
      .from('quiz_sessions')
      .select('id')
      .eq('student_id', attackerUserId)
      .eq('mode', 'internal_exam')
      .is('deleted_at', null)
    expect((probe ?? []).length).toBe(0)
  })

  test('expired code is rejected with code_expired (Vector BL-1)', async () => {
    // Insert a code that was already expired one minute ago.
    const code = await seedCode(admin, {
      studentId: victimUserId,
      subjectId,
      orgId,
      expiresInMs: -60_000,
    })

    const { data, error } = await victimClient.rpc('start_internal_exam_session', {
      p_code: code.code,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/code_expired/i)
    expect(data).toBeNull()
  })

  test('voided code is rejected with code_voided (Vector BL-2)', async () => {
    const code = await seedCode(admin, {
      studentId: victimUserId,
      subjectId,
      orgId,
      voidedAt: new Date().toISOString(),
      voidedBy: victimUserId,
    })

    const { data, error } = await victimClient.rpc('start_internal_exam_session', {
      p_code: code.code,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/code_voided/i)
    expect(data).toBeNull()
  })

  test('already-consumed code is rejected with code_already_used (Vector BM)', async () => {
    // Seed a code marked consumed via direct admin insert (skips the FOR UPDATE
    // lock that the RPC uses; the read-side guard `IF v_code_consumed IS NOT NULL`
    // is what we're exercising).
    const code = await seedCode(admin, {
      studentId: victimUserId,
      subjectId,
      orgId,
      consumedAt: new Date().toISOString(),
    })

    const { data, error } = await victimClient.rpc('start_internal_exam_session', {
      p_code: code.code,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/code_already_used/i)
    expect(data).toBeNull()
  })

  test('second valid code for same subject while a session is active raises active_session_exists', async () => {
    // Issue two valid (non-consumed, non-voided, future-expiry) codes for the
    // same student + subject. Redeem the first to create an active session,
    // then attempt the second — must hit the duplicate-active guard.
    const code1 = await seedCode(admin, {
      studentId: attackerUserId,
      subjectId,
      orgId,
    })
    const code2 = await seedCode(admin, {
      studentId: attackerUserId,
      subjectId,
      orgId,
    })

    const first = await attackerClient.rpc('start_internal_exam_session', {
      p_code: code1.code,
    })
    // The first redemption requires sufficient questions in the configured
    // distribution. If the test fixture lacks them, the RPC raises
    // 'insufficient_questions_for_exam' before reaching the active-session
    // guard. Skip the assertion in that case (covered by SQL integration tests).
    if (first.error && /insufficient_questions/i.test(first.error.message)) {
      test.skip(
        true,
        'insufficient seeded questions for exam_config — fixture limitation; covered by SQL integration tests',
      )
      return
    }
    expect(first.error).toBeNull()

    const second = await attackerClient.rpc('start_internal_exam_session', {
      p_code: code2.code,
    })
    expect(second.error).not.toBeNull()
    expect(second.error?.message ?? '').toMatch(/active_session_exists/i)
    expect(second.data).toBeNull()
  })
})
