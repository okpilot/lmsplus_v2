import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestData } from './cleanup'
import { createTestOrg, createTestUser, getAdminClient, getAuthenticatedClient } from './setup'

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
 *  (d) unauthenticated caller (auth.uid() NULL) → throws 'not_authenticated'
 *  (e) consumed code (state guard, defense-in-depth) → throws 'code_not_found'
 *
 * Hermetic: internal_exam_codes rows created here are soft-deleted in afterAll;
 * audit_events is append-only/immutable, so assertions scope by the unique
 * created code id (resource_id) rather than deleting audit rows. cleanupTestData
 * removes the test orgs (which cascades the org-scoped audit_events) and users.
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
    // Soft-delete codes (internal_exam_codes supports deleted_at; no hard DELETE).
    if (createdCodeIds.length > 0) {
      const { data: discarded, error } = await admin
        .from('internal_exam_codes')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', createdCodeIds)
        .is('deleted_at', null)
        .select('id')
      if (error) console.error(`afterAll: code soft-delete failed: ${error.message}`)
      else if ((discarded?.length ?? 0) > 0)
        console.log(`[record_code_emailed] soft-deleted ${discarded?.length} code(s)`)
    }
    // cleanupTestData removes org-scoped audit_events + users + orgs.
    await cleanupTestData({ admin, orgId, userIds })
    await cleanupTestData({ admin, orgId: otherOrgId, userIds: otherUserIds })
  })

  // ── (a) Admin happy path ────────────────────────────────────────────────────

  it('writes a code_emailed audit row when an admin emails a code in their org', async () => {
    const codeId = await seedCode({ org: orgId, student: studentId, issuedBy: adminUserId })

    const { error } = await adminClient.rpc('record_internal_exam_code_emailed', {
      p_code_id: codeId,
    })
    expect(error).toBeNull()

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

  // ── (e) Consumed code is rejected (state guard, defense-in-depth) ────────────

  it('rejects a consumed code with code_not_found and writes no audit row', async () => {
    const codeId = await seedCode({ org: orgId, student: studentId, issuedBy: adminUserId })

    // Mark the code consumed via service-role (the app guards this before
    // calling, so the RPC's in-body state guard is defense-in-depth).
    const { data: consumed, error: consumeErr } = await admin
      .from('internal_exam_codes')
      .update({ consumed_at: new Date().toISOString() })
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

  // ── (d) Unauthenticated caller is rejected ──────────────────────────────────

  it('rejects an unauthenticated call with not_authenticated', async () => {
    const codeId = await seedCode({ org: orgId, student: studentId, issuedBy: adminUserId })

    const { createClient } = await import('@supabase/supabase-js')
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const { error } = await anonClient.rpc('record_internal_exam_code_emailed', {
      p_code_id: codeId,
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('not_authenticated')

    const { data: rows, error: readErr } = await admin
      .from('audit_events')
      .select('id')
      .eq('event_type', 'internal_exam.code_emailed')
      .eq('resource_id', codeId)
    expect(readErr).toBeNull()
    expect(rows).toHaveLength(0)
  })
})
