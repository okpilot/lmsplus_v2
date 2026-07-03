/**
 * Red Team Spec: soft-deleted admin — admin answer-key read RPCs (Vector EJ)
 *
 * Proves the defense-in-depth property that a soft-deleted admin holding a
 * still-valid JWT is REJECTED (with no answer-key payload) when calling the two
 * admin-only SECURITY DEFINER read RPCs that return answer-key data:
 *   - get_question_authoring_fields   (mig 116) — returns correct_option_id et al.
 *   - get_admin_report_correct_options (mig 114) — returns {question_id, correct_option_id}
 *
 * Both RPCs are answer-key delivery paths, so a soft-deleted admin bypassing the
 * gate would be a CRITICAL answer-key leak — hence this coverage is P1.
 *
 * Two-layer defense (why the rejection regexes carry two tokens each):
 *
 *   Layer 1 — is_admin() (mig 057a): filters `AND deleted_at IS NULL`, so a
 *   soft-deleted admin fails `NOT is_admin()` and the RPC raises 'forbidden'.
 *   This is the PRIMARY defense and the one exercised today.
 *
 *   Layer 2 — active-user re-select in each RPC body: both RPCs derive the
 *   caller's org via `... FROM users WHERE id = auth.uid() AND deleted_at IS NULL`
 *   as an independent backstop after is_admin(). If a future regression removes
 *   the deleted_at filter from is_admin() but leaves the re-select intact, the
 *   RPC raises 'user not found' (get_question_authoring_fields) /
 *   'Caller has no organization' (get_admin_report_correct_options) instead.
 *
 *   Both outcomes are correct rejections. Each regex covers both layers so the
 *   test pins the defence without coupling to which layer fires — a regression
 *   that swaps the error token is still caught.
 *
 * Non-vacuity: before soft-deleting, each RPC is called with the ACTIVE admin
 * client and asserted to pass the admin gate — get_question_authoring_fields
 * returns exactly 1 row for a real same-org question; get_admin_report_correct_options
 * reaches the post-admin-gate session-lookup token. This proves the JWT + admin
 * role are genuinely valid before soft-delete.
 *
 * No-side-effect: both RPCs are READ-only (neither body contains INSERT INTO
 * audit_events), so the EI audit-count check would be vacuous here. The
 * load-bearing "no leak" proof is that `data` is null on every rejection.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { seedRedTeamUsers } from './helpers/seed-users'

// Dedicated throwaway admin — NOT the shared redteam-admin@lmsplus.local.
// Soft-deleting the shared admin would cascade forbidden failures across every
// spec that depends on it if the process crashes mid-test. This email is unique
// to this spec so the blast radius of a soft-delete is bounded to this file.
// Distinct from the EI spec's redteam-softdel-admin@ to avoid cross-spec collision.
const SOFTDEL_ADMIN_EMAIL = 'redteam-softdel-authoring-admin@lmsplus.local'
const SOFTDEL_ADMIN_PASSWORD = 'redteam-softdel-authoring-admin-2026!'

test.describe('Red Team: soft-deleted admin cannot call admin answer-key RPCs (Vector EJ)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let softDelAdminId: string
  let softDelAdminClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let orgId: string
  let realQuestionId: string

  test.beforeAll(async () => {
    admin = getAdminClient()

    // Resolve egmont-aviation org via the shared seed helpers.
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId

    // Pick one real active, non-deleted question in the org. get_question_authoring_fields
    // returns exactly 1 row for any same-org non-deleted question regardless of type
    // (mig 116: WHERE q.id = p_question_id AND q.organization_id = v_org_id AND
    // q.deleted_at IS NULL — no question-type filter), so this drives the positive
    // control. Mirrors the active-question query in seedVictimResponses.
    const { data: questionRow, error: questionErr } = await admin
      .from('questions')
      .select('id')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (questionErr) throw new Error(`beforeAll: question lookup failed: ${questionErr.message}`)
    if (!questionRow) throw new Error('beforeAll: no active egmont question found')
    realQuestionId = questionRow.id as string

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
          full_name: 'Red Team Soft-Delete Authoring Admin',
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
        full_name: 'Red Team Soft-Delete Authoring Admin',
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
    // §7 exempts single-step cleanups).
    if (softDelAdminId) {
      const { error: deleteAuthErr } = await admin.auth.admin.deleteUser(softDelAdminId)
      if (deleteAuthErr) throw new Error(`afterAll: delete auth user: ${deleteAuthErr.message}`)
    }
  })

  test('soft-deleted admin JWT is rejected by get_question_authoring_fields and get_admin_report_correct_options with no answer-key leak (Vector EJ)', async () => {
    // ── Step 1: Positive controls (non-vacuity) ─────────────────────────────
    //
    // Call each RPC with the ACTIVE (not yet soft-deleted) admin client and
    // assert it passes the admin gate. This proves the JWT and admin role are
    // genuinely valid — so the subsequent rejections (after soft-delete) are
    // caused by the deleted_at filter, not a stale/invalid JWT.
    //
    // get_question_authoring_fields: a REAL same-org question → exactly 1 row.
    // (A missing question returns 0 rows, not an error, so the .length === 1
    // assertion is the load-bearing non-vacuity check — it also fails if the
    // query mistakenly picked a wrong-org question or a type filter dropped it.)
    const { data: preAuthData, error: preAuthError } = await softDelAdminClient.rpc(
      'get_question_authoring_fields',
      { p_question_id: realQuestionId },
    )
    expect(preAuthError).toBeNull()
    expect(Array.isArray(preAuthData)).toBe(true)
    expect((preAuthData as unknown[]).length).toBe(1)

    // get_admin_report_correct_options: a dummy session_id → the post-admin-gate
    // session-lookup token. For an ACTIVE admin the auth/is_admin/org-lookup
    // guards all pass, so it proceeds to guard 4 (session not found). Reaching
    // this token proves the admin gate + active-user gate were both satisfied.
    const dummySessionId = crypto.randomUUID()
    const { error: preReportError } = await softDelAdminClient.rpc(
      'get_admin_report_correct_options',
      { p_session_id: dummySessionId },
    )
    expect(preReportError).not.toBeNull()
    expect(preReportError?.message ?? '').toMatch(
      /session not found|not in caller org|not completed/i,
    )

    // ── Step 2: Soft-delete the admin + post-delete rejection calls ──────────
    //
    // Use a finally block to guarantee restoration even if a rejection assertion
    // fails mid-test (noUnsafeFinally: assertions happen OUTSIDE the finally).
    let restoreError: string | null = null
    let authResult: { data: unknown; error: { message: string } | null } | null = null
    let reportResult: { data: unknown; error: { message: string } | null } | null = null

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
      const auth = await softDelAdminClient.rpc('get_question_authoring_fields', {
        p_question_id: realQuestionId,
      })
      authResult = { data: auth.data, error: auth.error }

      const report = await softDelAdminClient.rpc('get_admin_report_correct_options', {
        p_session_id: dummySessionId,
      })
      reportResult = { data: report.data, error: report.error }
    } finally {
      // Restore the admin so afterAll's cascade delete runs cleanly and a repeat
      // run finds a clean state. Capture the error — never throw inside finally
      // (noUnsafeFinally).
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

    // ── Step 3: Assert rejections (outside finally) ─────────────────────────
    // The security proof (did the RPCs reject the soft-deleted admin and leak no
    // answer key?) is the primary purpose — assert it BEFORE the infra
    // restoreError check (Step 4) so a rejection regression yields the actionable
    // CI failure, not restore noise.

    // get_question_authoring_fields must reject — and return NO answer-key payload.
    //   Primary  — is_admin() filters deleted_at IS NULL → RAISE 'forbidden'
    //   Backstop — active-user org re-select (v_org_id IS NULL) → RAISE 'user not found'
    expect(authResult?.error).not.toBeNull()
    expect(authResult?.error?.message ?? '').toMatch(/forbidden|user not found/i)
    // On a RAISE, PostgREST returns null data — no canonical_answer / correct_option_id leaked.
    expect(authResult?.data).toBeNull()

    // get_admin_report_correct_options must reject — and return NO answer key.
    //   Primary  — is_admin() filters deleted_at IS NULL → RAISE 'forbidden'
    //   Backstop — active-user org re-select (v_org_id IS NULL) → RAISE 'Caller has no organization'
    expect(reportResult?.error).not.toBeNull()
    expect(reportResult?.error?.message ?? '').toMatch(/forbidden|caller has no organization/i)
    // On a RAISE, PostgREST returns null data — no {question_id, correct_option_id} leaked.
    expect(reportResult?.data).toBeNull()

    // ── Step 4: Infra check last ────────────────────────────────────────────
    // The throwaway admin was restored (deleted_at cleared) in the finally above,
    // so afterAll's cascade delete runs cleanly and a repeat run finds a clean
    // state. Asserted last so a restore failure never masks the security proof.
    expect(restoreError).toBeNull()
  })
})
