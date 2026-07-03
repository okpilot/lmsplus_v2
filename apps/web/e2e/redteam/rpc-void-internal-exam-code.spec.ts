/**
 * Red Team Spec: void_internal_exam_code RPC
 *
 * Vectors DD/DE/DF/DG (HIGH). Admin-only RPC that voids a code and (optionally)
 * ends the linked active session. Tests cover:
 *  - DD unauthenticated → not_authenticated
 *  - DE student → not_admin
 *  - DF    cross-org admin → code_not_found (existence-hiding)
 *  - DG    consumed + finished session → cannot_void_finished_attempt
 *  - CD    consumed code, linked session soft-deleted before void →
 *          session_state_changed (fail-fast, code NOT voided — mig 084)
 *  - positive — consumed + active session ends with passed=false.
 */

import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_CODE_PREFIX } from './helpers/seed-markers'
import { ensureExamConfig, pickSubjectWithQuestions } from './helpers/seed-quiz'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedCrossOrgAdmin,
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed-users'

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
  const code = `${E2E_REDTEAM_CODE_PREFIX}${crypto
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

  // Rows created per test hang off the shared victim seed user; track their
  // ids so afterEach can soft-delete them and keep the spec hermetic
  // (code-style.md §7) — otherwise consumed codes / sessions accumulate
  // across runs and could skew counts in downstream specs.
  const createdCodeIds = new Set<string>()
  const createdSessionIds = new Set<string>()

  // The CM test mutates the SHARED victim seed user's last_active_at to a fixed
  // value. Track + restore it in afterEach so the mutation can't leak into
  // downstream specs that read this user's last_active_at (code-style.md §7).
  let victimLastActiveAtMutated = false
  let originalVictimLastActiveAt: string | null = null

  // Compact factories — every test uses the same victim+subject+org+issuer.
  const validCode = async () => {
    const code = await seedCode(admin, {
      studentId: victimUserId,
      subjectId,
      orgId,
      issuedBy: adminUserId,
    })
    createdCodeIds.add(code.id)
    return code
  }
  const codeForSession = async (consumedSessionId: string) => {
    const code = await seedCode(admin, {
      studentId: victimUserId,
      subjectId,
      orgId,
      issuedBy: adminUserId,
      consumedSessionId,
    })
    createdCodeIds.add(code.id)
    return code
  }
  const session = async (ended?: boolean) => {
    const id = await seedSession(admin, { studentId: victimUserId, subjectId, orgId, ended })
    createdSessionIds.add(id)
    return id
  }

  test.afterEach(async () => {
    // Service-role soft-delete of rows created this test. Accumulate errors so
    // both cleanups run even if the first throws; clear the sets in finally so
    // a failed delete can't replay stale ids into the next test's cleanup.
    const errors: string[] = []
    const now = new Date().toISOString()
    if (victimLastActiveAtMutated) {
      try {
        const { error } = await admin
          .from('users')
          .update({ last_active_at: originalVictimLastActiveAt })
          .eq('id', victimUserId)
        if (error) throw new Error(`afterEach restore last_active_at: ${error.message}`)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      } finally {
        victimLastActiveAtMutated = false
      }
    }
    if (createdCodeIds.size > 0) {
      try {
        const { data, error } = await admin
          .from('internal_exam_codes')
          .update({ deleted_at: now })
          .in('id', Array.from(createdCodeIds))
          .is('deleted_at', null)
          .select('id')
        if (error) throw new Error(`afterEach soft-delete codes: ${error.message}`)
        if ((data?.length ?? 0) > 0) {
          console.log(`[void-code] soft-deleted ${data?.length} internal_exam_code(s)`)
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      } finally {
        createdCodeIds.clear()
      }
    }
    if (createdSessionIds.size > 0) {
      try {
        const { data, error } = await admin
          .from('quiz_sessions')
          .update({ deleted_at: now })
          .in('id', Array.from(createdSessionIds))
          .is('deleted_at', null)
          .select('id')
        if (error) throw new Error(`afterEach soft-delete sessions: ${error.message}`)
        if ((data?.length ?? 0) > 0) {
          console.log(`[void-code] soft-deleted ${data?.length} quiz_session(s)`)
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      } finally {
        createdSessionIds.clear()
      }
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  test('unauthenticated call returns not_authenticated (Vector DD)', async () => {
    const code = await validCode()
    const { data, error } = await unauthClient.rpc('void_internal_exam_code', {
      p_code_id: code.id,
      p_reason: 'red team',
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not_authenticated/i)
    expect(data).toBeNull()
  })

  test('authenticated student (non-admin) cannot void a code (Vector DE)', async () => {
    const code = await validCode()
    const { data, error } = await attackerStudentClient.rpc('void_internal_exam_code', {
      p_code_id: code.id,
      p_reason: 'red team',
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not_admin/i)
    expect(data).toBeNull()
  })

  test('cross-org admin cannot void code in foreign org (Vector DF)', async () => {
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

  test('void on consumed code with finished session raises cannot_void_finished_attempt (Vector DG)', async () => {
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
    // Runtime guard before the cast (code-style.md §5): the RPC returns a
    // SETOF row, so assert the array shape before narrowing + indexing it.
    expect(Array.isArray(data)).toBe(true)
    const [result] = data as Array<{
      code_id: string
      session_id: string
      session_ended: boolean
    }>
    // Distinguish an empty-array RPC return from a wrong-value field below.
    expect(result).toBeDefined()
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

  test('admin void of an active session does NOT stamp the student last_active_at (Vector CM)', async () => {
    const sessionId = await session()
    const code = await codeForSession(sessionId)

    // Seed a KNOWN non-null last_active_at via service-role so the "unchanged"
    // assertion below always exercises the strict timestamp-equality branch. On
    // a fresh env the victim's last_active_at is NULL, and the trigger only ever
    // writes a non-null now() — so a null->null comparison can't distinguish
    // "trigger skipped" from "trigger never fired". A fixed before-value makes
    // the regression detector (after === before) non-vacuous.
    const SEEDED_LAST_ACTIVE_AT = '2026-01-01T00:00:00.000Z'
    // Capture the pre-mutation value so afterEach can restore it — this user is
    // shared across the suite/specs (code-style.md §7).
    const { data: preSeedRow, error: preSeedErr } = await admin
      .from('users')
      .select('last_active_at')
      .eq('id', victimUserId)
      .single()
    if (preSeedErr) throw new Error(`capture last_active_at: ${preSeedErr.message}`)
    originalVictimLastActiveAt = preSeedRow?.last_active_at ?? null
    victimLastActiveAtMutated = true
    const { data: seededRows, error: seedErr } = await admin
      .from('users')
      .update({ last_active_at: SEEDED_LAST_ACTIVE_AT })
      .eq('id', victimUserId)
      .select('id')
    if (seedErr) throw new Error(`seed last_active_at: ${seedErr.message}`)
    // Zero-row no-op guard (code-style.md §5): if the update matched 0 rows (e.g. the
    // victim was deleted between capture and seed), the "unchanged" assertion below would
    // compare null === null and pass vacuously. Fail loudly instead.
    if ((seededRows?.length ?? 0) === 0)
      throw new Error(`seed last_active_at matched 0 rows for victim ${victimUserId}`)

    // Read the victim's last_active_at via service-role BEFORE the void. RLS
    // does not block the service-role client, so this is the true stored value.
    const { data: beforeRow, error: beforeErr } = await admin
      .from('users')
      .select('last_active_at')
      .eq('id', victimUserId)
      .single()
    if (beforeErr) throw new Error(`read last_active_at before: ${beforeErr.message}`)
    const before = beforeRow?.last_active_at ?? null

    const { data, error } = await adminClientAuthed.rpc('void_internal_exam_code', {
      p_code_id: code.id,
      p_reason: 'void no-stamp check',
    })

    expect(error).toBeNull()
    // Non-vacuity: prove the ended_at write actually fired (session_ended=true)
    // so the trigger DID get a chance to run — only then is "unchanged" meaningful.
    expect(Array.isArray(data)).toBe(true)
    const [result] = data as Array<{
      code_id: string
      session_id: string
      session_ended: boolean
    }>
    expect(result).toBeDefined()
    expect(result?.code_id).toBe(code.id)
    expect(result?.session_id).toBe(sessionId)
    expect(result?.session_ended).toBe(true)

    // The trigger's auth.uid() = NEW.student_id guard is FALSE for an admin-driven
    // ended_at write, so last_active_at must be unchanged. Compare by parsed
    // timestamp (TIMESTAMPTZ serialization differs), preserving the null case.
    const { data: afterRow, error: afterErr } = await admin
      .from('users')
      .select('last_active_at')
      .eq('id', victimUserId)
      .single()
    if (afterErr) throw new Error(`read last_active_at after: ${afterErr.message}`)
    const after = afterRow?.last_active_at ?? null

    if (before === null) {
      expect(after).toBeNull()
    } else {
      expect(after).not.toBeNull()
      expect(new Date(after as string).getTime()).toBe(new Date(before).getTime())
    }
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
