/**
 * Red Team Spec: record_internal_exam_code_emailed RPC
 *
 * Vectors EA / EB / EC (HIGH). Admin-only audit RPC (mig 110) that writes one
 * `internal_exam.code_emailed` audit row when an admin emails a code to a
 * student. Guard order (from mig 110):
 *   1. auth.uid() IS NULL          → not_authenticated  (covered by DZ in
 *                                     server-action-unauthenticated.spec.ts)
 *   2. NOT is_admin()              → not_admin           (EA)
 *   3. active-admin gate           → admin_not_found
 *   4. org/state-scoped code read  → code_not_found      (EB cross-org, EC state)
 *
 * Tests cover:
 *  - EA: authenticated student (non-admin) → not_admin
 *  - EB: cross-org admin, code in victim org → code_not_found (existence-hiding)
 *  - EC (RPC layer): owner-org admin, code consumed/voided/expired →
 *        code_not_found (existence-hiding of non-active state)
 *
 * Every rejected call asserts NO `internal_exam.code_emailed` audit row was
 * written for the targeted code (non-vacuous negative, code-style.md §7).
 *
 * The Server-Action-UI half of EC (the "Code is no longer active" toast +
 * no-email-sent) is deferred to a follow-up — it needs a browser harness.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  E2E_REDTEAM_CODE_PREFIX,
  ensureExamConfig,
  pickSubjectWithQuestions,
  seedCrossOrgAdmin,
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed'

// Note: the unauthenticated guard (Vector DZ → not_authenticated) lives in
// server-action-unauthenticated.spec.ts alongside the other anon-RPC vectors —
// this spec covers the authenticated attacker paths (EA/EB/EC) only.

type SeedOpts = {
  studentId: string
  subjectId: string
  orgId: string
  issuedBy: string
  consumedSessionId?: string
  voidedBy?: string
  expired?: boolean
}

async function seedCode(
  admin: ReturnType<typeof getAdminClient>,
  opts: SeedOpts,
): Promise<{ id: string; code: string }> {
  // crypto.randomUUID() is collision-resistant; Math.random() can collide
  // across rapid test runs in the same describe block.
  // Match the RPC's issued charset (excludes 0/1/I/O to avoid mis-reads) so the
  // seeded code is faithful to a real one; A-HJ-NP-Z2-9 drops I and O too.
  const code = `${E2E_REDTEAM_CODE_PREFIX}${crypto
    .randomUUID()
    .replace(/-/g, '')
    .toUpperCase()
    .replace(/[^A-HJ-NP-Z2-9]/g, 'A')
    .slice(0, 6)}`
  const row: Record<string, unknown> = {
    code,
    subject_id: opts.subjectId,
    student_id: opts.studentId,
    issued_by: opts.issuedBy,
    // Active by default; the `expired` flag below backdates expiry.
    expires_at: new Date(
      opts.expired ? Date.now() - 60 * 60 * 1000 : Date.now() + 60 * 60 * 1000,
    ).toISOString(),
    organization_id: opts.orgId,
    // consumed_pair_consistency CHECK: consumed_at and consumed_session_id must
    // be set together or both null.
    ...(opts.consumedSessionId
      ? { consumed_at: new Date().toISOString(), consumed_session_id: opts.consumedSessionId }
      : {}),
    // voided_pair_consistency CHECK: voided_at and voided_by must be set together.
    ...(opts.voidedBy ? { voided_at: new Date().toISOString(), voided_by: opts.voidedBy } : {}),
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
  opts: { studentId: string; subjectId: string; orgId: string },
): Promise<string> {
  const { data, error } = await admin
    .from('quiz_sessions')
    .insert({
      organization_id: opts.orgId,
      student_id: opts.studentId,
      mode: 'internal_exam',
      subject_id: opts.subjectId,
      config: { question_ids: [], pass_mark: 75 },
      // total_questions matches the empty question_ids — this row only exists to
      // satisfy the consumed_session_id FK; no RPC reads it.
      total_questions: 0,
      time_limit_seconds: 600,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seedSession: ${error?.message}`)
  return data.id
}

test.describe('Red Team: record_internal_exam_code_emailed RPC', () => {
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

  // Rows created per test hang off the shared victim seed user; track their ids
  // so afterEach can soft-delete them and keep the spec hermetic (code-style.md
  // §7) — otherwise codes/sessions accumulate across runs and could skew counts
  // in downstream specs.
  const createdCodeIds = new Set<string>()
  const createdSessionIds = new Set<string>()

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
  const session = async () => {
    const id = await seedSession(admin, { studentId: victimUserId, subjectId, orgId })
    createdSessionIds.add(id)
    return id
  }

  test.afterEach(async () => {
    // Service-role soft-delete of rows created this test. Accumulate errors so
    // both cleanups run even if the first throws; clear the sets in finally so
    // a failed delete can't replay stale ids into the next test's cleanup.
    const errors: string[] = []
    const now = new Date().toISOString()
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
          console.log(`[record-emailed] soft-deleted ${data?.length} internal_exam_code(s)`)
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
          console.log(`[record-emailed] soft-deleted ${data?.length} quiz_session(s)`)
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      } finally {
        createdSessionIds.clear()
      }
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  // Assert NO internal_exam.code_emailed audit row exists for this code id —
  // makes every rejected-call test a non-vacuous negative (code-style.md §7).
  const expectNoEmailedAudit = async (codeId: string) => {
    const { data, error } = await admin
      .from('audit_events')
      .select('id')
      .eq('event_type', 'internal_exam.code_emailed')
      .eq('resource_id', codeId)
    expect(error).toBeNull()
    expect(data?.length ?? 0).toBe(0)
  }

  test('authenticated student (non-admin) cannot record a code emailed (Vector EA)', async () => {
    // Seed a VALID code so the call reaches the is_admin() guard, not a
    // code_not_found path — this pins the rejection to the role check.
    const code = await validCode()
    // Non-vacuity (code-style.md §7): prove the code exists before the attack, so
    // not_admin proves the role gate fired — not that the code was simply absent.
    const { data: seeded } = await admin
      .from('internal_exam_codes')
      .select('id')
      .eq('id', code.id)
      .single()
    expect(seeded?.id).toBe(code.id)

    const { data, error } = await attackerStudentClient.rpc('record_internal_exam_code_emailed', {
      p_code_id: code.id,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/not_admin/i)
    expect(data).toBeNull()
    await expectNoEmailedAudit(code.id)
  })

  test('cross-org admin cannot record a code emailed in foreign org (Vector EB)', async () => {
    // Seed the code in the VICTIM org via service-role, then assert it exists
    // before the attack so the code_not_found below proves org-scoping, not an
    // empty table (non-vacuous, code-style.md §7).
    const code = await validCode()
    const { data: seeded } = await admin
      .from('internal_exam_codes')
      .select('id')
      .eq('id', code.id)
      .single()
    expect(seeded?.id).toBe(code.id)

    const { data, error } = await crossOrgAdminClient.rpc('record_internal_exam_code_emailed', {
      p_code_id: code.id,
    })

    expect(error).not.toBeNull()
    // Existence-hiding: must report code_not_found, not a more specific error.
    expect(error?.message ?? '').toMatch(/code_not_found/i)
    expect(data).toBeNull()
    await expectNoEmailedAudit(code.id)
  })

  test('admin cannot record a consumed code emailed (Vector EC — consumed state hidden)', async () => {
    // A consumed code (consumed_at + consumed_session_id set per the
    // consumed_pair_consistency CHECK) is no longer active. The RPC's state
    // guard hides it behind code_not_found.
    const sessionId = await session()
    const code = await seedCode(admin, {
      studentId: victimUserId,
      subjectId,
      orgId,
      issuedBy: adminUserId,
      consumedSessionId: sessionId,
    })
    createdCodeIds.add(code.id)

    const { data, error } = await adminClientAuthed.rpc('record_internal_exam_code_emailed', {
      p_code_id: code.id,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/code_not_found/i)
    expect(data).toBeNull()
    await expectNoEmailedAudit(code.id)
  })

  test('admin cannot record a voided code emailed (Vector EC — voided state hidden)', async () => {
    // A voided code (voided_at + voided_by set per the voided_pair_consistency
    // CHECK) is no longer active → code_not_found.
    const code = await seedCode(admin, {
      studentId: victimUserId,
      subjectId,
      orgId,
      issuedBy: adminUserId,
      voidedBy: adminUserId,
    })
    createdCodeIds.add(code.id)

    const { data, error } = await adminClientAuthed.rpc('record_internal_exam_code_emailed', {
      p_code_id: code.id,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/code_not_found/i)
    expect(data).toBeNull()
    await expectNoEmailedAudit(code.id)
  })

  test('admin cannot record an expired code emailed (Vector EC — expired state hidden)', async () => {
    // An expired code (expires_at in the past) fails the `expires_at > now()`
    // guard → code_not_found.
    const code = await seedCode(admin, {
      studentId: victimUserId,
      subjectId,
      orgId,
      issuedBy: adminUserId,
      expired: true,
    })
    createdCodeIds.add(code.id)

    const { data, error } = await adminClientAuthed.rpc('record_internal_exam_code_emailed', {
      p_code_id: code.id,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/code_not_found/i)
    expect(data).toBeNull()
    await expectNoEmailedAudit(code.id)
  })
})
