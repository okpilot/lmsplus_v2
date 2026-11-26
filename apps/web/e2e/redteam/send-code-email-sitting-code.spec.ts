/**
 * Red Team Spec: sendInternalExamCodeEmail must never email a SITTING code (Vector NG, #1777)
 *
 * The codes tab renders "Send email" only for a legacy code (`sittingEntryId === null`), so the
 * server-side branch in apps/web/app/app/admin/internal-exams/actions/send-code-email.ts
 * (`Sitting codes cannot be emailed from here yet`, #1812) is the only enforcement against a stale
 * render. Two things it protects:
 *   - the plaintext code, which for a sitting is handed out through the invigilator-scoped roster
 *     and Print codes page only (docs/security.md § Sitting codes);
 *   - `internal_exam_codes.emailed_at`, which is what makes a cancelled sitting's code a pending
 *     removal notice (mig 20261117001000) — stamping it from the codes tab forges notice state.
 *
 * Attack: open the codes tab while the code reads as legacy (button rendered, enabled), attach it
 * to a sitting entry, then submit — a TOCTOU submit the client cannot prevent.
 * Expected: the refusal toast, `emailed_at` still NULL, and no `internal_exam.code_emailed` audit
 * row for the code (record_internal_exam_code_emailed is the only writer of either).
 *
 * CONTROL ARM (in-spec): a legacy code of the same student, same page, same click reaches a
 * post-guard TERMINAL toast — so the refusal above is caused by the sitting attachment, not by a
 * broken button. The control does not assert delivery or the audit row: a successful send needs
 * RESEND_API_KEY (apps/web/lib/email/resend.ts), absent in CI.
 *
 * Hermetic: a throwaway student, codes carrying NG_CODE_PREFIX, one marked sitting tracked in
 * `SittingTrack`; afterAll soft-deletes the codes, then cleanupSittingFixtures (per-step
 * accumulator).
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
const SITTING_REFUSAL = 'Sitting codes cannot be emailed from here yet'
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

async function insertLegacyCode(
  admin: Admin,
  opts: { orgId: string; adminId: string; studentId: string; subjectId: string },
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
      // What issue_internal_exam_code gives a legacy code: issued_at + 24h.
      expires_at: new Date(Date.now() + LEGACY_VALIDITY_MS).toISOString(),
    })
    .select('id')
    .single()
  if (error || typeof data?.id !== 'string') {
    throw new Error(`legacy code: ${error?.message ?? 'no row'}`)
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
    const sittingId = await createSittingRpc(egmontAdmin, adminUserId)
    track.sittingIds.push(sittingId)
    // No code is issued for this entry, so uq_internal_exam_codes_live_entry stays free for the
    // attach below. The composite FK needs (entry id, org, subject, user) to match the code's row.
    entryId = await insertEntry(admin, { orgId, sittingId, userId: studentId, subjectId })

    target = await insertLegacyCode(admin, { orgId, adminId: adminUserId, studentId, subjectId })
    control = await insertLegacyCode(admin, { orgId, adminId: adminUserId, studentId, subjectId })

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

  test('a code attached to a sitting entry after the row rendered is not emailed', async () => {
    // Non-vacuous: the target exists, has never been emailed and carries no audit row.
    expect(await emailedAt(admin, target.id)).toBeNull()
    expect(await emailedAuditCount(admin, target.id)).toBe(0)

    const page = await adminContext.newPage()
    await page.goto(CODES_URL)
    const row = page.getByRole('row').filter({ hasText: target.code })
    await expect(row).toHaveCount(1)
    const send = row.getByRole('button', { name: 'Send email' })
    await expect(send).toBeEnabled()

    // Stale render: the code becomes a sitting code before the submit reaches the server.
    const { data: moved, error: moveErr } = await admin
      .from('internal_exam_codes')
      .update({ sitting_entry_id: entryId })
      .eq('id', target.id)
      .select('id')
    if (moveErr || moved?.length !== 1) {
      throw new Error(`attach entry: ${moveErr?.message ?? moved?.length}`)
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
