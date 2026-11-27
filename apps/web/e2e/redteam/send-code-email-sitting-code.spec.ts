/**
 * Red Team Spec: sendInternalExamCodeEmail must not email a sitting code once its sitting is
 * cancelled (Vector NG, #1777, #1812)
 *
 * Sitting codes are emailable from the codes tab. The server re-checks the sitting at submit
 * (apps/web/app/app/admin/internal-exams/actions/send-code-email.ts, sitting guard first); a stale
 * render must not bypass it. Protected:
 *   - the plaintext code of a cancelled sitting;
 *   - `internal_exam_codes.emailed_at`, which makes a cancelled sitting's code a pending removal
 *     notice (mig 20261117001000).
 *
 * Attack: render the codes tab with the sitting code live and "Send email" enabled, soft-delete its
 * sitting directly (no void, no audit), then submit.
 * Expected: the closed-sitting refusal, no terminal success toast, `emailed_at` NULL, no
 * `internal_exam.code_emailed` audit row for the code.
 *
 * CONTROL ARM (in-spec): a legacy code of the same student, same page, same click reaches a
 * post-guard TERMINAL toast. The control does not assert delivery or the audit row: a send without
 * RESEND_API_KEY succeeds outside production and fails in production (apps/web/lib/email/resend.ts).
 *
 * Hermetic: a throwaway student, codes carrying NG_CODE_PREFIX, one marked sitting tracked in
 * `SittingTrack`; afterAll soft-deletes the codes, then cleanupSittingFixtures.
 */

import { type Browser, type BrowserContext, expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { getAdminClient } from '../helpers/supabase'
import {
  cleanupSittingFixtures,
  createSittingRpc,
  insertEntry,
  type SittingTrack,
} from './helpers/exam-sitting-seed'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { upsertUser } from './helpers/seed-core'
import { ensureExamConfig, pickSubjectWithQuestions } from './helpers/seed-quiz'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed-users'

const BASE_URL = 'http://localhost:3000'
const CODES_URL = '/app/admin/internal-exams?tab=codes&status=active'

/** Stable marker for every code this spec creates; afterAll soft-deletes by this prefix. */
const NG_CODE_PREFIX = 'RTNG'
const NG_STUDENT_EMAIL = 'redteam-ng-student@lmsplus.local'
const NG_STUDENT_PASSWORD = 'redteam-ng-student-2026!'
const SITTING_REFUSAL = 'This sitting is closed and cannot be changed.'
const TERMINAL_TOAST = /Code emailed to student|Failed to send email/
const LEGACY_VALIDITY_MS = 24 * 60 * 60 * 1000

type Admin = ReturnType<typeof getAdminClient>

function markedCode(): string {
  const tail = crypto.randomUUID().replaceAll('-', '').toUpperCase().slice(0, 6)
  return `${NG_CODE_PREFIX}${tail}`
}

async function emailedAt(admin: Admin, codeId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('internal_exam_codes')
    .select('id, emailed_at')
    .eq('id', codeId)
    .single()
  if (error || !data) throw new Error(`code ${codeId}: ${error?.message ?? 'no row'}`)
  return data.emailed_at
}

async function emailedAuditCount(admin: Admin, codeId: string): Promise<number> {
  const { count, error } = await admin
    .from('audit_events')
    .select('id', { count: 'exact', head: true })
    .eq('event_type', 'internal_exam.code_emailed')
    .eq('resource_id', codeId)
  if (error) throw new Error(`audit_events: ${error.message}`)
  return count ?? 0
}

async function insertCode(
  admin: Admin,
  opts: {
    orgId: string
    adminId: string
    studentId: string
    subjectId: string
    sittingEntryId?: string
  },
): Promise<{ id: string; code: string }> {
  const code = markedCode()
  const { data, error } = await admin
    .from('internal_exam_codes')
    .insert({
      code,
      organization_id: opts.orgId,
      issued_by: opts.adminId,
      student_id: opts.studentId,
      subject_id: opts.subjectId,
      ...(opts.sittingEntryId ? { sitting_entry_id: opts.sittingEntryId } : {}),
      // What issue_internal_exam_code gives a legacy code: issued_at + 24h.
      expires_at: new Date(Date.now() + LEGACY_VALIDITY_MS).toISOString(),
    })
    .select('id')
    .single()
  if (error || typeof data?.id !== 'string') {
    throw new Error(`code: ${error?.message ?? 'no row'}`)
  }
  return { id: data.id, code }
}

async function signInAdmin(browser: Browser, userId: string): Promise<BrowserContext> {
  const context = await browser.newContext({ storageState: undefined })
  const page = await context.newPage()
  await page.goto('/')
  await page.getByLabel('Email address').fill(ADMIN_EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN_PASSWORD)
  await Promise.all([
    page.waitForURL(/\/(app\/dashboard|consent)(?:\?.*)?$/, { timeout: 30_000 }),
    page.getByRole('button', { name: 'Sign in' }).click(),
  ])
  await context.addCookies([
    { name: CONSENT_COOKIE, value: buildConsentCookieValue(userId), url: BASE_URL },
  ])
  await page.close()
  return context
}

test.describe('Red Team: codes-tab Send email never reaches a sitting code (NG)', () => {
  let admin: Admin
  let adminContext: BrowserContext
  let orgId: string
  let adminUserId: string
  let studentId: string
  let subjectId: string
  let sittingId: string
  let entryId: string
  let target: { id: string; code: string }
  let control: { id: string; code: string }
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }

  test.beforeAll(async ({ browser }) => {
    admin = getAdminClient()
    await seedRedTeamUsers()
    const a = await seedRedTeamAdmin()
    orgId = a.orgId
    adminUserId = a.adminUserId
    track.adminId = a.adminUserId
    studentId = await upsertUser(admin, NG_STUDENT_EMAIL, NG_STUDENT_PASSWORD, orgId)
    const picked = await pickSubjectWithQuestions(admin, { orgId })
    subjectId = picked.subjectId
    await ensureExamConfig(orgId, subjectId, picked.topicId)

    const egmontAdmin: SupabaseClient = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    sittingId = await createSittingRpc(egmontAdmin, adminUserId)
    track.sittingIds.push(sittingId)
    entryId = await insertEntry(admin, { orgId, sittingId, userId: studentId, subjectId })

    target = await insertCode(admin, {
      orgId,
      adminId: adminUserId,
      studentId,
      subjectId,
      sittingEntryId: entryId,
    })
    control = await insertCode(admin, { orgId, adminId: adminUserId, studentId, subjectId })

    adminContext = await signInAdmin(browser, adminUserId)
  })

  test.afterAll(async () => {
    const errors: string[] = []
    try {
      const { data, error } = await admin
        .from('internal_exam_codes')
        .update({ deleted_at: new Date().toISOString() })
        .like('code', `${NG_CODE_PREFIX}%`)
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`codes: ${error.message}`)
      if (data && data.length > 0) {
        console.log(`NG afterAll: soft-deleted ${data.length} code(s)`)
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      await cleanupSittingFixtures(admin, track)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      await adminContext.close()
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`NG afterAll: ${errors.join('; ')}`)
  })

  test('a sitting code rendered emailable is not emailed once its sitting is cancelled', async () => {
    // Non-vacuous: the target exists, has never been emailed and carries no audit row.
    expect(await emailedAt(admin, target.id)).toBeNull()
    expect(await emailedAuditCount(admin, target.id)).toBe(0)

    const page = await adminContext.newPage()
    await page.goto(CODES_URL)
    const row = page.getByRole('row').filter({ hasText: target.code })
    await expect(row).toHaveCount(1)
    const send = row.getByRole('button', { name: 'Send email' })
    await expect(send).toBeEnabled()

    const { data: cancelled, error: cancelErr } = await admin
      .from('exam_sittings')
      .update({ deleted_at: new Date().toISOString(), deleted_by: adminUserId })
      .eq('id', sittingId)
      .select('id')
    if (cancelErr || cancelled?.length !== 1) {
      throw new Error(`cancel sitting: ${cancelErr?.message ?? cancelled?.length}`)
    }

    await send.click()
    await expect(page.getByText(SITTING_REFUSAL)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(TERMINAL_TOAST)).toHaveCount(0)
    expect(await emailedAt(admin, target.id)).toBeNull()
    expect(await emailedAuditCount(admin, target.id)).toBe(0)
    await page.close()
  })

  test('a legacy code of the same student reaches the send path from the same page', async () => {
    // CONTROL: the sitting attachment is what is refused, not the button.
    const page = await adminContext.newPage()
    await page.goto(CODES_URL)
    const row = page.getByRole('row').filter({ hasText: control.code })
    await expect(row).toHaveCount(1)
    await row.getByRole('button', { name: 'Send email' }).click()
    await expect(page.getByText(TERMINAL_TOAST)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(SITTING_REFUSAL)).toHaveCount(0)
    await page.close()
  })
})
