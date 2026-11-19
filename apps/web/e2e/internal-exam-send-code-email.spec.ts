/**
 * E2E spec — Internal Exam: "Send via email" pre-send state guard (red-team EC,
 * Server-Action/UI half — issue #915).
 *
 * The RPC layer (record_internal_exam_code_emailed) + integration tests already
 * pin the data-layer guard, including the "no audit row written for a stale
 * code" guarantee (#902). This spec pins the Server Action's pre-send UX guard
 * through the real admin UI: the state check in send-code-email.ts
 * (`if (consumedAt || voidedAt || isExpired) return 'Code is no longer active'`)
 * rejects a voided/expired code with a specific toast, BEFORE any email or audit
 * work.
 *
 * Scope note — why this spec does NOT assert email delivery or audit writes:
 * the audit row is only written after a SUCCESSFUL email send, and a successful
 * send requires RESEND_API_KEY (absent in CI, where `pnpm start` runs with
 * NODE_ENV=production so resend.ts fails closed). Delivery is therefore
 * environment-dependent and not observable here; the no-email/no-audit guarantee
 * is owned by the RPC layer (#902). This UI spec's job is the state guard: a
 * stale code is rejected with "Code is no longer active", and an active code is
 * NOT rejected by that guard (the discrimination control below makes the two
 * negative tests non-vacuous — the rejection is caused by the code's state, not
 * by a broken button or a generically-failing action).
 *
 * Seed dependency: apps/web/scripts/seed-e2e.ts. Uses admin (admin@lmsplus.local)
 * and the dedicated internal-exam student fixture (e2e-internal-exam@lmsplus.local)
 * — see helpers/supabase.ts.
 *
 * Auth: admin storage state is the default for this admin-e2e spec. A
 * service-role client (getAdminClient) drives the row lookups and the
 * stale-state mutations.
 */

import { expect, type Page, test } from '@playwright/test'
import { ADMIN_TEST_EMAIL, signInAsAdmin } from './helpers/admin-supabase'
import { cleanupE2eExamSittings } from './helpers/exam-sitting-cleanup'
import { insertLegacyCodeFor, issueSittingCodeFor } from './helpers/sitting-code'
import {
  cleanupInternalExamStudentActiveSessions,
  getAdminClient,
  INTERNAL_EXAM_STUDENT_EMAIL,
} from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/admin.json' })

const SUBJECT_LABEL_FRAGMENT = 'Meteorology'
const STALE_CODE_TOAST = 'Code is no longer active'

type AdminClient = ReturnType<typeof getAdminClient>

// Codes issued during the run, tracked for hermetic cleanup (§7 E2E rule). The
// codes belong to the shared INTERNAL_EXAM_STUDENT fixture — leaving active
// issued codes would pollute the downstream internal-exam-*.spec.ts specs.
const issuedCodeIds = new Set<string>()

/** Legacy code seeded, Codes tab open on its row (the page stays mounted while the test mutates the DB). */
async function openLegacyCodeRow(adminPage: Page, admin: AdminClient): Promise<string> {
  const code = await insertLegacyCodeFor({
    studentEmail: INTERNAL_EXAM_STUDENT_EMAIL,
    subjectFragment: SUBJECT_LABEL_FRAGMENT,
  })
  const codeId = await lookupCodeId(admin, code)
  await adminPage.goto('/app/admin/internal-exams?tab=codes')
  await expect(adminPage.locator('tr', { hasText: code })).toBeVisible()
  return codeId
}

function sendButton(adminPage: Page) {
  return adminPage.getByRole('button', { name: /send email/i })
}
/** Resolve the issued code's row id by its (globally UNIQUE) code string. */
async function lookupCodeId(admin: AdminClient, code: string): Promise<string> {
  const { data, error } = await admin
    .from('internal_exam_codes')
    .select('id')
    .eq('code', code)
    .is('deleted_at', null)
    .maybeSingle<{ id: string }>()
  if (error) throw new Error(`lookupCodeId: ${error.message}`)
  if (!data?.id) throw new Error(`lookupCodeId: no row for code ${code}`)
  issuedCodeIds.add(data.id)
  return data.id
}

/** Resolve the E2E admin's user id — needed for the voided_by FK. */
async function lookupAdminUserId(admin: AdminClient): Promise<string> {
  const { data, error } = await admin
    .from('users')
    .select('id')
    .eq('email', ADMIN_TEST_EMAIL)
    .is('deleted_at', null)
    .maybeSingle<{ id: string }>()
  if (error) throw new Error(`lookupAdminUserId: ${error.message}`)
  if (!data?.id) throw new Error('lookupAdminUserId: no admin user')
  return data.id
}

test.describe('internal exam — send-code-email pre-send state guard', () => {
  test.setTimeout(120_000)

  // Stale-session cleanup — see issue #587.
  test.beforeEach(async () => {
    const adminClient = await signInAsAdmin()
    await cleanupInternalExamStudentActiveSessions(adminClient)
    await cleanupE2eExamSittings()
  })

  // Hermeticity (§7) — soft-delete every code this spec issued so downstream
  // internal-exam specs don't inherit active/issued codes. Single cleanup step.
  test.afterEach(async () => {
    await cleanupE2eExamSittings()
    if (issuedCodeIds.size === 0) return
    try {
      const admin = getAdminClient()
      const ids = [...issuedCodeIds]
      const { data, error } = await admin
        .from('internal_exam_codes')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', ids)
        .select('id')
      if (error) throw new Error(`afterEach soft-delete: ${error.message}`)
      if ((data?.length ?? 0) > 0) {
        console.log(`[cleanup] soft-deleted ${data?.length} internal exam code(s)`)
      }
    } finally {
      issuedCodeIds.clear()
    }
  })

  test('accepts an active code past the pre-send state guard', async ({ page: adminPage }) => {
    const admin = getAdminClient()
    await openLegacyCodeRow(adminPage, admin)

    await sendButton(adminPage).first().click()

    // Discrimination control: an ACTIVE code must NOT be rejected by the state
    // guard. This makes the two stale-code tests non-vacuous — the rejection
    // there is caused by the code's state, not by a broken button. We assert the
    // action reached a post-guard terminal state (success when email is
    // configured, send-failure otherwise — RESEND_API_KEY is absent in CI), and
    // never the stale-guard message.
    await expect(adminPage.getByText(/Code emailed to student|Failed to send email/)).toBeVisible({
      timeout: 10_000,
    })
    await expect(adminPage.getByText(STALE_CODE_TOAST)).toHaveCount(0)
  })

  test('rejects a voided code with "Code is no longer active"', async ({ page: adminPage }) => {
    const admin = getAdminClient()
    const adminUserId = await lookupAdminUserId(admin)

    const codeId = await openLegacyCodeRow(adminPage, admin)

    // Void the freshly issued code while the panel (and its Send button) is
    // still mounted. CHECK voided_pair_consistency requires BOTH columns.
    const { data: voided, error: voidErr } = await admin
      .from('internal_exam_codes')
      .update({ voided_at: new Date().toISOString(), voided_by: adminUserId })
      .eq('id', codeId)
      .select('id')
    if (voidErr) throw new Error(`void update: ${voidErr.message}`)
    if (!voided?.length) throw new Error('void update: no row affected')

    await sendButton(adminPage).first().click()

    await expect(adminPage.getByText(STALE_CODE_TOAST)).toBeVisible({ timeout: 10_000 })
  })

  test('rejects an expired code with "Code is no longer active"', async ({ page: adminPage }) => {
    const admin = getAdminClient()
    const codeId = await openLegacyCodeRow(adminPage, admin)

    // Expire the freshly issued code while the panel is still mounted.
    const { data: expired, error: expireErr } = await admin
      .from('internal_exam_codes')
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', codeId)
      .select('id')
    if (expireErr) throw new Error(`expire update: ${expireErr.message}`)
    if (!expired?.length) throw new Error('expire update: no row affected')

    await sendButton(adminPage).first().click()

    await expect(adminPage.getByText(STALE_CODE_TOAST)).toBeVisible({ timeout: 10_000 })
  })

  test('a sitting code row has no email button', async ({ page: adminPage }) => {
    const { code } = await issueSittingCodeFor({
      studentEmail: INTERNAL_EXAM_STUDENT_EMAIL,
      subjectFragment: SUBJECT_LABEL_FRAGMENT,
    })
    await adminPage.goto('/app/admin/internal-exams?tab=codes')
    const row = adminPage.locator('tr', { hasText: code })
    await expect(row).toBeVisible()
    await expect(row.getByRole('link', { name: 'Sitting code' })).toBeVisible()
    await expect(row.getByRole('button', { name: /send email/i })).toHaveCount(0)
  })
})
