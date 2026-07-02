import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestData } from './cleanup'
import {
  createTestOrg,
  createTestUser,
  getAdminClient,
  getAnonClient,
  getAuthenticatedClient,
} from './setup'

/**
 * Integration tests for record_internal_exam_code_emailed() RPC (migration 110).
 *
 * The RPC is SECURITY DEFINER, EXECUTE-granted to authenticated. It writes one
 * 'internal_exam.code_emailed' audit row when an admin emails an internal exam
 * code to a student. audit_events blocks direct INSERTs (audit_no_direct_insert
 * = WITH CHECK false), so the row can only originate from this function.
 *
 * Covered:
 *  (a) admin emails a code in their org → audit row written with the correct
 *      event_type/resource_type/resource_id/actor_role/org + student/subject metadata
 *  (b) non-admin (student) caller → throws 'not_admin', no audit row
 *  (c) cross-org code (belongs to another org) → throws 'code_not_found'
 *  (d) consumed code (state guard, defense-in-depth) → throws 'code_not_found'
 *  (e) voided code (state guard) → throws 'code_not_found'
 *  (f) expired code (state guard) → throws 'code_not_found'
 *  (g) soft-deleted code (rule 9: deleted_at filter) → throws 'code_not_found'
 *  (h) resend on an already-emailed code (no emailed_at IS NULL guard) → later timestamp
 *  (i) unauthenticated caller (auth.uid() NULL) → throws 'not_authenticated'
 *
 * Hermetic: internal_exam_codes rows created here are HARD-deleted in afterAll
 * (test teardown only) — the table has no FK children, and cleanupTestData
 * hard-deletes the users/orgs/quiz_sessions these rows reference, so the codes
 * must be removed first or those deletes hit FK violations. audit_events is
 * append-only/immutable, so assertions scope by the unique created code id
 * (resource_id) rather than deleting audit rows. cleanupTestData removes the
 * test orgs (which cascades the org-scoped audit_events) and users.
 *
 * The RT subject (mig 097) is a global reference row used only to satisfy the
 * internal_exam_codes.subject_id FK — it is never modified or deleted here.
 */
describe('RPC: record_internal_exam_code_emailed', () => {
  const admin = getAdminClient()
  const suffix = Date.now()

  let orgId: string
  let adminUserId: string
  let studentId: string
  let studentClient: SupabaseClient
  let adminClient: SupabaseClient
  const userIds: string[] = []

  // Second org — for the cross-org rejection test
  let otherOrgId: string
  let otherOrgAdminId: string
  let otherOrgStudentId: string
  const otherUserIds: string[] = []

  // Subject id (global RT reference row, mig 097) for the FK
  let subjectId: string

  // internal_exam_codes rows created here — soft-deleted in afterAll
  const createdCodeIds: string[] = []

  /** Service-role insert of an internal_exam_code (bypasses the no-INSERT-policy RLS). */
  async function seedCode(opts: {
    org: string
    student: string
    issuedBy: string
  }): Promise<string> {
    const { data, error } = await admin
      .from('internal_exam_codes')
      .insert({
        code: `EML${suffix}${createdCodeIds.length}`,
        subject_id: subjectId,
        student_id: opts.student,
        issued_by: opts.issuedBy,
        organization_id: opts.org,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single()
    if (error) throw new Error(`seedCode: ${error.message}`)
    const id = data.id as string
    createdCodeIds.push(id)
    return id
  }

  beforeAll(async () => {
    const { data: sub, error: subErr } = await admin
      .from('easa_subjects')
      .select('id')
      .eq('code', 'RT')
      .single()
    if (subErr || !sub) throw new Error('RT subject not found — run mig 097')
    subjectId = sub.id as string

    orgId = await createTestOrg({
      admin,
      name: `Test Org CodeEmailed ${suffix}`,
      slug: `test-code-emailed-${suffix}`,
    })
    adminUserId = await createTestUser({
      admin,
      orgId,
      email: `admin-code-emailed-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    userIds.push(adminUserId)
    studentId = await createTestUser({
      admin,
      orgId,
      email: `student-code-emailed-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    userIds.push(studentId)

    adminClient = await getAuthenticatedClient({
      email: `admin-code-emailed-${suffix}@test.local`,
      password: 'test-pass-123',
    })
    studentClient = await getAuthenticatedClient({
      email: `student-code-emailed-${suffix}@test.local`,
      password: 'test-pass-123',
    })

    // Second org with its own admin + student, for the cross-org test
    otherOrgId = await createTestOrg({
      admin,
      name: `Other Org CodeEmailed ${suffix}`,
      slug: `other-code-emailed-${suffix}`,
    })
    otherOrgAdminId = await createTestUser({
      admin,
      orgId: otherOrgId,
      email: `other-admin-code-emailed-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'admin',
    })
    otherUserIds.push(otherOrgAdminId)
    otherOrgStudentId = await createTestUser({
      admin,
      orgId: otherOrgId,
      email: `other-student-code-emailed-${suffix}@test.local`,
      password: 'test-pass-123',
      role: 'student',
    })
    otherUserIds.push(otherOrgStudentId)
  })

  afterAll(async () => {
    // Multi-step cleanup with a per-step error accumulator (code-style.md §7):
    // a failure that leaks shared state must surface, not be logged-and-continued.
    const errors: string[] = []

    // Step 1: hard-delete the test-created codes FIRST. internal_exam_codes has no
    // FK children, and cleanupTestData hard-deletes the users/orgs/quiz_sessions
    // these rows reference (issued_by, student_id, organization_id,
    // consumed_session_id) — a lingering row would FK-block those deletes. Test
    // teardown only; production never hard-deletes.
    if (createdCodeIds.length > 0) {
      try {
        const { data: removed, error } = await admin
          .from('internal_exam_codes')
          .delete()
          .in('id', createdCodeIds)
          .select('id')
        if (error) throw new Error(error.message)
        if ((removed?.length ?? 0) > 0)
          console.log(`[record_code_emailed] removed ${removed?.length} code(s)`)
      } catch (e) {
        errors.push(`code delete: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        createdCodeIds.length = 0
      }
    }

    // Steps 2-3: per-org cleanup (audit_events + quiz_sessions + users + orgs).
    // Dependent on step 1 (codes FK into these rows), so skip if the code delete
    // failed — a spurious FK error here would mask the root cause (§7).
    if (errors.length === 0) {
      try {
        await cleanupTestData({ admin, orgId, userIds })
      } catch (e) {
        errors.push(`cleanup ${orgId}: ${e instanceof Error ? e.message : String(e)}`)
      }
      try {
        await cleanupTestData({ admin, orgId: otherOrgId, userIds: otherUserIds })
      } catch (e) {
        errors.push(`cleanup ${otherOrgId}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  // ── (a) Admin happy path ────────────────────────────────────────────────────

  it('writes a code_emailed audit row when an admin emails a code in their org', async () => {
    const codeId = await seedCode({ org: orgId, student: studentId, issuedBy: adminUserId })

    // #905: emailed_at must be NULL before the RPC runs.
    const { data: beforeRow, error: beforeErr } = await admin
      .from('internal_exam_codes')
      .select('emailed_at')
      .eq('id', codeId)
      .single()
    expect(beforeErr).toBeNull()
    // .single() + the beforeErr null-check above guarantee a non-null row.
    expect(beforeRow!.emailed_at).toBeNull()

    const { error } = await adminClient.rpc('record_internal_exam_code_emailed', {
      p_code_id: codeId,
    })
    expect(error).toBeNull()

    // #905: emailed_at must be stamped to approximately now after the RPC.
    const { data: afterRow, error: afterErr } = await admin
      .from('internal_exam_codes')
      .select('emailed_at')
      .eq('id', codeId)
      .single()
    expect(afterErr).toBeNull()
    // .single() + the afterErr null-check above guarantee a non-null row; the
    // not.toBeNull() then justifies the `as string` cast on the next line.
    expect(afterRow!.emailed_at).not.toBeNull()
    const emailedAt = new Date(afterRow!.emailed_at as string).getTime()
    expect(Math.abs(Date.now() - emailedAt)).toBeLessThan(5000)

    const { data: rows, error: readErr } = await admin
      .from('audit_events')
      .select(
        'actor_id, actor_role, event_type, resource_type, resource_id, organization_id, metadata',
      )
      .eq('event_type', 'internal_exam.code_emailed')
      .eq('resource_id', codeId)
      .order('created_at', { ascending: false })
      .limit(1)

    expect(readErr).toBeNull()
    expect(rows).toHaveLength(1)
    const row = rows![0]!
    expect(row.actor_id).toBe(adminUserId)
    expect(row.actor_role).toBe('admin')
    expect(row.event_type).toBe('internal_exam.code_emailed')
    expect(row.resource_type).toBe('internal_exam_code')
    expect(row.resource_id).toBe(codeId)
    expect(row.organization_id).toBe(orgId)
    expect(row.metadata).toMatchObject({ student_id: studentId, subject_id: subjectId })
  })

  // ── (b) Non-admin caller is rejected ────────────────────────────────────────

  it('rejects a student (non-admin) caller with not_admin and writes no audit row', async () => {
    const codeId = await seedCode({ org: orgId, student: studentId, issuedBy: adminUserId })

    const { error } = await studentClient.rpc('record_internal_exam_code_emailed', {
      p_code_id: codeId,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/not_admin/)

    const { data: rows, error: readErr } = await admin
      .from('audit_events')
      .select('id')
      .eq('event_type', 'internal_exam.code_emailed')
      .eq('resource_id', codeId)
    expect(readErr).toBeNull()
    expect(rows).toHaveLength(0)
  })

  // ── (c) Cross-org code is rejected ──────────────────────────────────────────

  it('rejects an admin emailing a code that belongs to another org with code_not_found', async () => {
    // Code lives in the OTHER org; the primary-org admin must not reach it.
    const foreignCodeId = await seedCode({
      org: otherOrgId,
      student: otherOrgStudentId,
      issuedBy: otherOrgAdminId,
    })

    const { error } = await adminClient.rpc('record_internal_exam_code_emailed', {
      p_code_id: foreignCodeId,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/code_not_found/)

    const { data: rows, error: readErr } = await admin
      .from('audit_events')
      .select('id')
      .eq('event_type', 'internal_exam.code_emailed')
      .eq('resource_id', foreignCodeId)
    expect(readErr).toBeNull()
    expect(rows).toHaveLength(0)
  })

  // ── (d) Consumed code is rejected (state guard, defense-in-depth) ────────────

  it('rejects a consumed code with code_not_found and writes no audit row', async () => {
    const codeId = await seedCode({ org: orgId, student: studentId, issuedBy: adminUserId })

    // consumed_at and consumed_session_id must be set together
    // (consumed_pair_consistency CHECK), and consumed_session_id is an FK to
    // quiz_sessions — seed a minimal session to satisfy both.
    const { data: session, error: sessErr } = await admin
      .from('quiz_sessions')
      .insert({ organization_id: orgId, student_id: studentId, mode: 'mock_exam' })
      .select('id')
      .single()
    if (sessErr) throw new Error(`seed session: ${sessErr.message}`)
    const sessionId = session.id as string

    // Mark the code consumed via service-role (the app guards this before
    // calling, so the RPC's in-body state guard is defense-in-depth).
    const { data: consumed, error: consumeErr } = await admin
      .from('internal_exam_codes')
      .update({ consumed_at: new Date().toISOString(), consumed_session_id: sessionId })
      .eq('id', codeId)
      .select('id')
    if (consumeErr) throw new Error(`mark consumed: ${consumeErr.message}`)
    // Non-vacuous: confirm the seeded code actually exists and was updated.
    expect(consumed).toHaveLength(1)

    const { error } = await adminClient.rpc('record_internal_exam_code_emailed', {
      p_code_id: codeId,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/code_not_found/)

    const { data: rows, error: readErr } = await admin
      .from('audit_events')
      .select('id')
      .eq('event_type', 'internal_exam.code_emailed')
      .eq('resource_id', codeId)
    expect(readErr).toBeNull()
    expect(rows).toHaveLength(0)
  })

  // ── (e) Voided code is rejected (state guard) ───────────────────────────────

  it('rejects a voided code with code_not_found and writes no audit row', async () => {
    const codeId = await seedCode({ org: orgId, student: studentId, issuedBy: adminUserId })

    // voided_at and voided_by must be set together (voided_pair_consistency CHECK).
    const { data: voided, error: voidErr } = await admin
      .from('internal_exam_codes')
      .update({ voided_at: new Date().toISOString(), voided_by: adminUserId })
      .eq('id', codeId)
      .select('id')
    if (voidErr) throw new Error(`mark voided: ${voidErr.message}`)
    expect(voided).toHaveLength(1)

    const { error } = await adminClient.rpc('record_internal_exam_code_emailed', {
      p_code_id: codeId,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/code_not_found/)

    const { data: rows, error: readErr } = await admin
      .from('audit_events')
      .select('id')
      .eq('event_type', 'internal_exam.code_emailed')
      .eq('resource_id', codeId)
    expect(readErr).toBeNull()
    expect(rows).toHaveLength(0)
  })

  // ── (f) Expired code is rejected (state guard) ──────────────────────────────

  it('rejects an expired code with code_not_found and writes no audit row', async () => {
    // seedCode hardcodes a future expiry, so insert a past-expiry row directly.
    const { data, error: insertErr } = await admin
      .from('internal_exam_codes')
      .insert({
        code: `EMLX${suffix}${createdCodeIds.length}`,
        subject_id: subjectId,
        student_id: studentId,
        issued_by: adminUserId,
        organization_id: orgId,
        expires_at: new Date(Date.now() - 1000).toISOString(),
      })
      .select('id')
      .single()
    if (insertErr) throw new Error(`seed expired code: ${insertErr.message}`)
    const codeId = data.id as string
    createdCodeIds.push(codeId)

    const { error } = await adminClient.rpc('record_internal_exam_code_emailed', {
      p_code_id: codeId,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/code_not_found/)

    const { data: rows, error: readErr } = await admin
      .from('audit_events')
      .select('id')
      .eq('event_type', 'internal_exam.code_emailed')
      .eq('resource_id', codeId)
    expect(readErr).toBeNull()
    expect(rows).toHaveLength(0)
  })

  // ── (g) Soft-deleted code is rejected (rule 9: deleted_at filter) ────────────

  it('rejects a soft-deleted code with code_not_found and writes no audit row', async () => {
    const codeId = await seedCode({ org: orgId, student: studentId, issuedBy: adminUserId })

    const { data: deleted, error: delErr } = await admin
      .from('internal_exam_codes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', codeId)
      .select('id')
    if (delErr) throw new Error(`soft-delete: ${delErr.message}`)
    expect(deleted).toHaveLength(1)

    const { error } = await adminClient.rpc('record_internal_exam_code_emailed', {
      p_code_id: codeId,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/code_not_found/)

    const { data: rows, error: readErr } = await admin
      .from('audit_events')
      .select('id')
      .eq('event_type', 'internal_exam.code_emailed')
      .eq('resource_id', codeId)
    expect(readErr).toBeNull()
    expect(rows).toHaveLength(0)
  })

  // ── (h) Resend re-stamps emailed_at (no emailed_at IS NULL guard) ───────────

  it('re-stamps emailed_at to a later time when the code is emailed again', async () => {
    const codeId = await seedCode({ org: orgId, student: studentId, issuedBy: adminUserId })

    // First send: stamp emailed_at for the first time.
    const { error: firstErr } = await adminClient.rpc('record_internal_exam_code_emailed', {
      p_code_id: codeId,
    })
    expect(firstErr).toBeNull()

    const { data: afterFirst, error: firstReadErr } = await admin
      .from('internal_exam_codes')
      .select('emailed_at')
      .eq('id', codeId)
      .single()
    expect(firstReadErr).toBeNull()
    expect(afterFirst!.emailed_at).not.toBeNull()
    // Safe: the firstReadErr null-check above means .single() returned a non-null row.
    const firstEmailedAt = afterFirst!.emailed_at as string

    // Second send on the SAME code: the RPC has no `emailed_at IS NULL` guard,
    // so it re-runs the UPDATE and stamps a new (later) transaction timestamp.
    const { error: secondErr } = await adminClient.rpc('record_internal_exam_code_emailed', {
      p_code_id: codeId,
    })
    expect(secondErr).toBeNull()

    const { data: afterSecond, error: secondReadErr } = await admin
      .from('internal_exam_codes')
      .select('emailed_at')
      .eq('id', codeId)
      .single()
    expect(secondReadErr).toBeNull()
    expect(afterSecond!.emailed_at).not.toBeNull()
    // Safe: the secondReadErr null-check above means .single() returned a non-null row.
    const secondEmailedAt = afterSecond!.emailed_at as string

    // The two RPC calls are separate Postgres transactions — their now() timestamps
    // differ. The intermediate SELECT read between the calls guarantees at least one
    // network roundtrip of elapsed time, so T2 > T1 is reliable in practice. Strictly
    // greater (not >=) so a regression adding `AND emailed_at IS NULL` — which would
    // make the second UPDATE a no-op, leaving T2 === T1 — fails here instead of passing.
    expect(new Date(secondEmailedAt).getTime()).toBeGreaterThan(new Date(firstEmailedAt).getTime())
  })

  // ── (i) Unauthenticated caller is rejected ──────────────────────────────────

  it('rejects an unauthenticated call with not_authenticated', async () => {
    const codeId = await seedCode({ org: orgId, student: studentId, issuedBy: adminUserId })

    const anonClient = getAnonClient()
    const { error } = await anonClient.rpc('record_internal_exam_code_emailed', {
      p_code_id: codeId,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/not_authenticated/)

    const { data: rows, error: readErr } = await admin
      .from('audit_events')
      .select('id')
      .eq('event_type', 'internal_exam.code_emailed')
      .eq('resource_id', codeId)
    expect(readErr).toBeNull()
    expect(rows).toHaveLength(0)
  })
})
