/**
 * E2E spec — Internal Exam: "Send via email" pre-send state guard (red-team EC,
 * Server-Action/UI half — issue #915).
 *
 * The RPC layer (record_internal_exam_code_emailed) + integration tests already
 * pin the data-layer guard (#902). This spec pins the Server Action's pre-send
 * UX guard through the real admin UI: the state check in send-code-email.ts
 * (`if (consumedAt || voidedAt || isExpired) return 'Code is no longer active'`)
 * fires BEFORE sendEmail, and the success-only record_internal_exam_code_emailed
 * audit also never fires. Because this stack uses Resend (inbucket does NOT
 * capture Resend mail — and with no RESEND_API_KEY the resend.ts console-log
 * fallback runs, so even the happy-path control sends no real mail), audit-event
 * ABSENCE is the assertable "no email sent" proof here.
 *
 * The audit row written on success is:
 *   event_type    = 'internal_exam.code_emailed'
 *   resource_type = 'internal_exam_code'
 *   resource_id   = <the code id>   (direct column, not metadata)
 * — see supabase/migrations/20260618000001_record_internal_exam_code_emailed.sql.
 *
 * Seed dependency: apps/web/scripts/seed-exam-eval.ts. Uses admin
 * (admin@lmsplus.local) and the dedicated internal-exam student fixture
 * (e2e-internal-exam@lmsplus.local) — see helpers/supabase.ts.
 *
 * Auth: admin storage state is the default for this admin-e2e spec. A
 * service-role client (getAdminClient) drives the row lookups, the stale-state
 * mutations, and the audit-event reads.
 */

import { expect, type Page, test } from '@playwright/test'
import { ADMIN_TEST_EMAIL, signInAsAdmin } from './helpers/admin-supabase'
import {
  cleanupInternalExamStudentActiveSessions,
  getAdminClient,
  INTERNAL_EXAM_STUDENT_EMAIL,
} from './helpers/supabase'

test.use({ storageState: 'e2e/.auth/admin.json' })

const SUBJECT_LABEL_FRAGMENT = 'Meteorology'
const EMAILED_EVENT_TYPE = 'internal_exam.code_emailed'

type AdminClient = ReturnType<typeof getAdminClient>

// Codes issued during the run, tracked for hermetic cleanup (§7 E2E rule). The
// codes belong to the shared INTERNAL_EXAM_STUDENT fixture — leaving active
// issued codes would pollute the downstream internal-exam-*.spec.ts specs.
const issuedCodeIds = new Set<string>()

async function issueCodeAsAdmin(adminPage: Page, subjectFragment: string): Promise<string> {
  await adminPage.goto('/app/admin/internal-exams')
  await expect(adminPage.getByRole('heading', { name: 'Internal Exams' })).toBeVisible()
  const form = adminPage.getByTestId('issue-code-form')
  await form.locator('[aria-label="Student"]').click()
  await adminPage
    .locator('[data-slot="select-item"]')
    .filter({ hasText: INTERNAL_EXAM_STUDENT_EMAIL })
    .first()
    .click()
  await form.locator('[aria-label="Subject"]').click()
  await adminPage
    .locator('[data-slot="select-item"]')
    .filter({ hasText: subjectFragment })
    .first()
    .click()
  await form.getByRole('button', { name: 'Issue code' }).click()
  await expect(adminPage.getByText('Internal exam code issued')).toBeVisible({ timeout: 10_000 })
  const code = (await adminPage.getByTestId('issued-code-value').textContent())?.trim()
  if (!code) throw new Error('issued code panel had no value')
  return code
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

/** Count audit events recorded for the email-sent action against a given code id. */
async function countEmailedAuditEvents(admin: AdminClient, codeId: string): Promise<number> {
  const { count, error } = await admin
    .from('audit_events')
    .select('id', { count: 'exact', head: true })
    .eq('event_type', EMAILED_EVENT_TYPE)
    .eq('resource_id', codeId)
  if (error) throw new Error(`countEmailedAuditEvents: ${error.message}`)
  return count ?? 0
}

test.describe('internal exam — send-code-email pre-send state guard', () => {
  test.setTimeout(120_000)

  // Stale-session cleanup — see issue #587.
  test.beforeEach(async () => {
    const adminClient = await signInAsAdmin()
    await cleanupInternalExamStudentActiveSessions(adminClient)
  })

  // Hermeticity (§7) — soft-delete every code this spec issued so downstream
  // internal-exam specs don't inherit active/issued codes. Single cleanup step.
  test.afterEach(async () => {
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

  test('emails the code and records an audit event when the code is active', async ({
    page: adminPage,
  }) => {
    const admin = getAdminClient()
    const code = await issueCodeAsAdmin(adminPage, SUBJECT_LABEL_FRAGMENT)
    const codeId = await lookupCodeId(admin, code)

    const before = await countEmailedAuditEvents(admin, codeId)

    await adminPage.getByRole('button', { name: /send via email/i }).click()

    await expect(adminPage.getByText('Code emailed to student')).toBeVisible({ timeout: 10_000 })

    // Non-vacuity control: the active code DID record the emailed audit event,
    // so a "0 events" assertion on a stale code proves the guard rejected,
    // not that audit-writing is broken.
    await expect
      .poll(() => countEmailedAuditEvents(admin, codeId), { timeout: 10_000 })
      .toBe(before + 1)
  })

  test('refuses to email a voided code and records no audit event', async ({ page: adminPage }) => {
    const admin = getAdminClient()
    const adminUserId = await lookupAdminUserId(admin)

    const code = await issueCodeAsAdmin(adminPage, SUBJECT_LABEL_FRAGMENT)
    const codeId = await lookupCodeId(admin, code)

    // Void the freshly issued code while the panel (and its Send button) is
    // still mounted. CHECK voided_pair_consistency requires BOTH columns.
    const { data: voided, error: voidErr } = await admin
      .from('internal_exam_codes')
      .update({ voided_at: new Date().toISOString(), voided_by: adminUserId })
      .eq('id', codeId)
      .select('id')
    if (voidErr) throw new Error(`void update: ${voidErr.message}`)
    if (!voided?.length) throw new Error('void update: no row affected')

    const before = await countEmailedAuditEvents(admin, codeId)

    await adminPage.getByRole('button', { name: /send via email/i }).click()

    await expect(adminPage.getByText('Code is no longer active')).toBeVisible({ timeout: 10_000 })

    // No emailed audit event was written for the voided code.
    await expect.poll(() => countEmailedAuditEvents(admin, codeId), { timeout: 5_000 }).toBe(before)
  })

  test('refuses to email an expired code and records no audit event', async ({
    page: adminPage,
  }) => {
    const admin = getAdminClient()
    const code = await issueCodeAsAdmin(adminPage, SUBJECT_LABEL_FRAGMENT)
    const codeId = await lookupCodeId(admin, code)

    // Expire the freshly issued code while the panel is still mounted.
    const { data: expired, error: expireErr } = await admin
      .from('internal_exam_codes')
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', codeId)
      .select('id')
    if (expireErr) throw new Error(`expire update: ${expireErr.message}`)
    if (!expired?.length) throw new Error('expire update: no row affected')

    const before = await countEmailedAuditEvents(admin, codeId)

    await adminPage.getByRole('button', { name: /send via email/i }).click()

    await expect(adminPage.getByText('Code is no longer active')).toBeVisible({ timeout: 10_000 })

    // No emailed audit event was written for the expired code.
    await expect.poll(() => countEmailedAuditEvents(admin, codeId), { timeout: 5_000 }).toBe(before)
  })
})
