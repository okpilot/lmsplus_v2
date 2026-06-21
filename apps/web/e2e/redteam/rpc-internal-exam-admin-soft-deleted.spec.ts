/**
 * Red Team Spec: soft-deleted admin — internal-exam admin RPC family (Vector EI)
 *
 * Proves the defense-in-depth property that a soft-deleted admin holding a
 * still-valid JWT is REJECTED (with no side effect) when calling the three
 * internal-exam admin-only RPCs:
 *   - record_internal_exam_code_emailed (mig 110)
 *   - issue_internal_exam_code          (mig 087)
 *   - void_internal_exam_code           (mig 084)
 *
 * Two-layer defense (why /not_admin|admin_not_found/):
 *
 *   Layer 1 — is_admin() (mig 057a): filters `AND deleted_at IS NULL`, so a
 *   soft-deleted admin fails `NOT is_admin()` and the RPC raises `not_admin`.
 *   This is the PRIMARY defense and the one exercised today.
 *
 *   Layer 2 — active-user re-select in each RPC body: all three RPCs also do
 *   `SELECT ... FROM users WHERE id = v_admin_id AND deleted_at IS NULL` as an
 *   independent backstop after is_admin(). If a future regression removes the
 *   deleted_at filter from is_admin() but leaves the re-select intact, the RPC
 *   would raise `admin_not_found` instead of `not_admin`.
 *
 *   Both outcomes are correct rejections. The regex `/not_admin|admin_not_found/`
 *   covers both layers so the test pins the defence without coupling to which
 *   layer fires — a regression that swaps the error token is still caught.
 *
 * start_internal_exam_session is student-facing (its guard is `not_authenticated`
 * for anon + code/student ownership checks, NOT an admin gate) and is therefore
 * NOT included in this spec.
 *
 * Non-vacuity: before soft-deleting, each RPC is called with the ACTIVE admin
 * client and asserted to reach the guard AFTER the admin gate — proving the JWT
 * + admin role are genuinely valid before soft-delete.
 *
 * No-side-effect: a scoped audit_events count (actor_id = soft-deleted admin)
 * is captured before and after the rejected calls and asserted UNCHANGED.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { ensureExamConfig, pickSubjectWithQuestions, seedRedTeamUsers } from './helpers/seed'

// Dedicated throwaway admin — NOT the shared redteam-admin@lmsplus.local.
// Soft-deleting the shared admin would cascade not_admin failures across all 12
// specs that depend on it if the process crashes mid-test. This email is unique
// to this spec so the blast radius of a soft-delete is bounded to this file.
const SOFTDEL_ADMIN_EMAIL = 'redteam-softdel-admin@lmsplus.local'
const SOFTDEL_ADMIN_PASSWORD = 'redteam-softdel-admin-2026!'

test.describe('Red Team: soft-deleted admin cannot call internal-exam admin RPCs (Vector EI)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let softDelAdminId: string
  let softDelAdminClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let orgId: string
  let subjectId: string

  test.beforeAll(async () => {
    admin = getAdminClient()

    // Resolve egmont-aviation org via the shared seed helpers. victimUserId is
    // not needed for this spec (all RPC calls use dummy param UUIDs).
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId

    // Pick a subject that has at least one active question (needed for the
    // issue_internal_exam_code positive-control call to reach student_not_found).
    const picked = await pickSubjectWithQuestions(admin, { orgId })
    subjectId = picked.subjectId
    const topicId = picked.topicId

    // Ensure an exam_config exists for the subject so issue_internal_exam_code
    // reaches student_not_found (not exam_config_required) on the positive-control.
    await ensureExamConfig(orgId, subjectId, topicId)

    // Create (or realign) the dedicated throwaway admin user.
    const { data: authList, error: listError } = await admin.auth.admin.listUsers()
    if (listError) throw new Error(`beforeAll: listUsers failed: ${listError.message}`)

    const existing = authList.users.find((u) => u.email === SOFTDEL_ADMIN_EMAIL)
    if (existing) {
      softDelAdminId = existing.id
      // Ensure the public.users row exists, has the correct org + role, and is
      // NOT soft-deleted from a prior aborted run.
      const { data: userRow, error: userRowErr } = await admin
        .from('users')
        .select('id, organization_id, role, deleted_at')
        .eq('id', existing.id)
        .maybeSingle()
      if (userRowErr) throw new Error(`beforeAll: users lookup failed: ${userRowErr.message}`)

      if (!userRow) {
        const { error: insertError } = await admin.from('users').insert({
          id: existing.id,
          organization_id: orgId,
          email: SOFTDEL_ADMIN_EMAIL,
          full_name: 'Red Team Soft-Delete Admin',
          role: 'admin',
        })
        if (insertError)
          throw new Error(`beforeAll: insert user row failed: ${insertError.message}`)
      } else if (
        userRow.organization_id !== orgId ||
        userRow.role !== 'admin' ||
        userRow.deleted_at !== null
      ) {
        const { data: realigned, error: updateError } = await admin
          .from('users')
          .update({ organization_id: orgId, role: 'admin', deleted_at: null })
          .eq('id', existing.id)
          .select('id')
        if (updateError)
          throw new Error(`beforeAll: realign user row failed: ${updateError.message}`)
        if (!realigned?.length) throw new Error('beforeAll: realign user row affected 0 rows')
      }
    } else {
      // Create new auth user.
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: SOFTDEL_ADMIN_EMAIL,
        password: SOFTDEL_ADMIN_PASSWORD,
        email_confirm: true,
      })
      if (createError || !created.user)
        throw new Error(`beforeAll: createUser failed: ${createError?.message}`)
      softDelAdminId = created.user.id

      const { error: insertError } = await admin.from('users').insert({
        id: softDelAdminId,
        organization_id: orgId,
        email: SOFTDEL_ADMIN_EMAIL,
        full_name: 'Red Team Soft-Delete Admin',
        role: 'admin',
      })
      if (insertError) throw new Error(`beforeAll: insert user row failed: ${insertError.message}`)
    }

    // Authenticate BEFORE soft-delete — this client holds a still-valid JWT that
    // will be used in the post-delete rejected calls.
    softDelAdminClient = await createAuthenticatedClient(
      SOFTDEL_ADMIN_EMAIL,
      SOFTDEL_ADMIN_PASSWORD,
    )
  })

  test.afterAll(async () => {
    // Delete the auth user only: public.users.id REFERENCES auth.users(id)
    // ON DELETE CASCADE (mig 001), so removing the auth user also removes the
    // public.users row. Single step → no error-accumulator needed (code-style.md
    // §7 exempts single-step cleanups). Deleting auth-FIRST (rather than the
    // public.users row first) avoids orphaning the auth user if the row delete
    // were ever blocked by a future FK child (e.g. an audit_events row written by
    // a future RPC change that logs rejected admin calls).
    if (softDelAdminId) {
      const { error: deleteAuthErr } = await admin.auth.admin.deleteUser(softDelAdminId)
      if (deleteAuthErr) throw new Error(`afterAll: delete auth user: ${deleteAuthErr.message}`)
    }
  })

  test('soft-deleted admin JWT is rejected by all three internal-exam admin RPCs with no audit side effect (Vector EI)', async () => {
    // ── Step 1: Positive controls (non-vacuity) ─────────────────────────────
    //
    // Call each RPC with the ACTIVE (not yet soft-deleted) admin client and
    // assert it reaches the guard AFTER the admin gate. This proves the JWT and
    // admin role are genuinely valid — so the subsequent rejections (after
    // soft-delete) are caused by the deleted_at filter, not a stale/invalid JWT.
    //
    // record: dummy code_id → code_not_found (the code doesn't exist, but the
    // admin gate passed — the RPC reached the org-scoped code lookup).
    const dummyCodeId = crypto.randomUUID()
    const { data: preRecordData, error: preRecordError } = await softDelAdminClient.rpc(
      'record_internal_exam_code_emailed',
      { p_code_id: dummyCodeId },
    )
    // record_internal_exam_code_emailed is RETURNS void (mig 110), so `data` is
    // always null on BOTH success and error — the error-token assertion below is
    // the load-bearing one; the toBeNull() is kept for cross-RPC symmetry only.
    expect(preRecordData).toBeNull()
    expect(preRecordError).not.toBeNull()
    expect(preRecordError?.message ?? '').toMatch(/code_not_found/i)

    // void: dummy code_id + non-blank reason → code_not_found (the code doesn't
    // exist, but the admin gate passed; guard fires at the code-lookup step).
    const { data: preVoidData, error: preVoidError } = await softDelAdminClient.rpc(
      'void_internal_exam_code',
      { p_code_id: dummyCodeId, p_reason: 'redteam EI probe' },
    )
    expect(preVoidData).toBeNull()
    expect(preVoidError).not.toBeNull()
    expect(preVoidError?.message ?? '').toMatch(/code_not_found/i)

    // issue: dummy subject_id + dummy student_id → student_not_found (subject
    // exists in the seed; the dummy student UUID guarantees student_not_found,
    // which fires BEFORE exam_config_required in the guard order (mig 087 L288 vs
    // L307) — so ensureExamConfig in beforeAll is future-proofing, not strictly
    // required for this assertion. The guard fires at the student-in-same-org lookup).
    const dummyStudentId = crypto.randomUUID()
    const { data: preIssueData, error: preIssueError } = await softDelAdminClient.rpc(
      'issue_internal_exam_code',
      { p_subject_id: subjectId, p_student_id: dummyStudentId },
    )
    expect(preIssueData).toBeNull()
    expect(preIssueError).not.toBeNull()
    expect(preIssueError?.message ?? '').toMatch(/student_not_found/i)

    // ── Step 2: Capture pre-delete audit_events count scoped to this admin ──
    //
    // Use actor_id scoping so the assertion is non-vacuous: the pre and post
    // counts match EXACTLY the rows this admin would have written. An insertion
    // regression that fires before the guard raises would increment this count.
    const { count: preCount, error: preCountErr } = await admin
      .from('audit_events')
      .select('id', { count: 'exact', head: true })
      .eq('actor_id', softDelAdminId)
    expect(preCountErr).toBeNull()
    expect(preCount).not.toBeNull()

    // ── Step 3: Soft-delete the admin + post-delete rejection assertions ─────
    //
    // Use a finally block to guarantee restoration even if a rejection assertion
    // fails mid-test (noUnsafeFinally: assertions happen OUTSIDE the finally).
    let restoreError: string | null = null
    let recordResult: { data: unknown; error: { message: string } | null } | null = null
    let voidResult: { data: unknown; error: { message: string } | null } | null = null
    let issueResult: { data: unknown; error: { message: string } | null } | null = null

    try {
      const { data: delData, error: delErr } = await admin
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', softDelAdminId)
        .is('deleted_at', null)
        .select('id')
      expect(delErr).toBeNull()
      // Non-vacuity: assert exactly 1 row was soft-deleted so the guard below
      // genuinely exercises the deleted-user path (not an already-deleted row).
      expect(delData?.length).toBe(1)

      // Call each RPC with the STILL-VALID JWT of the now-soft-deleted admin.
      // No re-auth — same client used before soft-delete (stale JWT simulation).
      const rec = await softDelAdminClient.rpc('record_internal_exam_code_emailed', {
        p_code_id: dummyCodeId,
      })
      recordResult = { data: rec.data, error: rec.error }

      const voi = await softDelAdminClient.rpc('void_internal_exam_code', {
        p_code_id: dummyCodeId,
        p_reason: 'redteam EI probe post-delete',
      })
      voidResult = { data: voi.data, error: voi.error }

      const iss = await softDelAdminClient.rpc('issue_internal_exam_code', {
        p_subject_id: subjectId,
        p_student_id: dummyStudentId,
      })
      issueResult = { data: iss.data, error: iss.error }
    } finally {
      // Restore the admin so afterAll's hard-delete can proceed cleanly and so
      // that a repeat run finds a clean state. Capture the error — never throw
      // inside finally (noUnsafeFinally).
      const { data: restoreData, error: restoreErr } = await admin
        .from('users')
        .update({ deleted_at: null })
        .eq('id', softDelAdminId)
        .select('id')
      if (restoreErr) {
        restoreError = restoreErr.message
      } else if ((restoreData?.length ?? 0) === 0) {
        restoreError = 'restore matched no rows'
      }
    }

    // ── Step 4: Assert rejections (outside finally) ─────────────────────────
    // The security proof (did the RPCs reject the soft-deleted admin?) is the
    // primary purpose — assert it BEFORE the infra restoreError check (Step 6) so
    // a rejection regression yields the actionable CI failure, not restore noise.

    // record_internal_exam_code_emailed must be rejected by the admin gate.
    //
    // Two-layer defense:
    //   Primary   — is_admin() filters deleted_at IS NULL → RAISE 'not_admin'
    //   Backstop  — active-user re-select (mig 110 L55-58) → RAISE 'admin_not_found'
    //
    // The regex covers both so a regression that swaps which layer fires is still
    // caught without false-failing when only Layer 2 survives.
    expect(recordResult?.error).not.toBeNull()
    expect(recordResult?.error?.message ?? '').toMatch(/not_admin|admin_not_found/i)
    expect(recordResult?.data).toBeNull()

    // void_internal_exam_code must be rejected by the admin gate. The soft-deleted
    // admin hits not_admin FIRST (is_admin() deleted_at filter), so the reason
    // string is irrelevant to THIS rejection — invalid_reason is never reached.
    // (The non-blank reason matters only for the pre-delete POSITIVE control above,
    // so the active admin passes the reason guard and reaches code_not_found.)
    expect(voidResult?.error).not.toBeNull()
    expect(voidResult?.error?.message ?? '').toMatch(/not_admin|admin_not_found/i)
    expect(voidResult?.data).toBeNull()

    // issue_internal_exam_code must be rejected by the admin gate.
    expect(issueResult?.error).not.toBeNull()
    expect(issueResult?.error?.message ?? '').toMatch(/not_admin|admin_not_found/i)
    expect(issueResult?.data).toBeNull()

    // ── Step 5: No-side-effect assertion ────────────────────────────────────
    //
    // Re-read the scoped audit_events count after all three rejected calls.
    // Any insertion that fires before the guard raises would increment this.
    const { count: postCount, error: postCountErr } = await admin
      .from('audit_events')
      .select('id', { count: 'exact', head: true })
      .eq('actor_id', softDelAdminId)
    expect(postCountErr).toBeNull()
    expect(postCount).toBe(preCount)

    // ── Step 6: Infra check last ────────────────────────────────────────────
    // The throwaway admin was restored (deleted_at cleared) in the finally above,
    // so afterAll's cascade delete runs cleanly and a repeat run finds a clean
    // state. Asserted last so a restore failure never masks the security proof.
    expect(restoreError).toBeNull()
  })
})
