/**
 * Red Team Spec: voidInternalExamCode Server Action — app-side void guard (Vector NF, #1777)
 *
 * `void_internal_exam_code` (mig 20260601000003) validates only a blank or over-long reason and
 * carries no sitting guard (#1820, Vectors NB/NC). The admin codes tab therefore runs
 * `checkSittingCode` (apps/web/app/app/admin/internal-exams/actions/sitting-code-guard.ts) before
 * the RPC, and that Server-Action guard is the SOLE barrier for both states below:
 *
 *  - a reason equal to a reserved system token (`RESERVED_VOID_REASONS`, packages/db/src/schema.ts).
 *    Three notice readers (migs 20261117001000, 20261117001100, 20261117001200) key on
 *    `sitting_cancelled`, so free text reaching `void_reason` must never be able to forge one.
 *  - a code attached to a sitting entry that is not a live attempt (Decision 264: those are voided
 *    from their sitting, not the codes tab).
 *
 * The row's Void button is rendered from `codeRowVoidable`, so the second state is reached the way
 * an attacker reaches it: the dialog is opened while the row still reads as a legacy code, and the
 * code is attached to a sitting entry before the submit — a stale-render / TOCTOU submit the client
 * cannot be trusted to prevent.
 *
 * CONTROL ARM (in-spec): the same dialog, same code, same click with FREE TEXT voids the code and
 * writes the reason — so each refusal is caused by the guarded condition, not a broken button.
 *
 * Hermetic: a throwaway student, codes carrying NF_CODE_PREFIX, one marked sitting tracked in
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
const NF_CODE_PREFIX = 'RTNF'
const NF_STUDENT_EMAIL = 'redteam-nf-student@lmsplus.local'
const NF_STUDENT_PASSWORD = 'redteam-nf-student-2026!'
const NF_FREE_TEXT = '[E2E_REDTEAM_NF] admin void probe'
/** One of RESERVED_VOID_REASONS; the token the three notice readers key on. */
const FORGED_REASON = 'sitting_cancelled'
const LEGACY_VALIDITY_MS = 24 * 60 * 60 * 1000

type Admin = ReturnType<typeof getAdminClient>

function markedCode(): string {
  const tail = crypto.randomUUID().replaceAll('-', '').toUpperCase().slice(0, 6)
  return `${NF_CODE_PREFIX}${tail}`
}

async function codeState(admin: Admin, codeId: string) {
  const { data, error } = await admin
    .from('internal_exam_codes')
    .select('id, voided_at, void_reason, sitting_entry_id')
    .eq('id', codeId)
    .single()
  if (error || !data) throw new Error(`code ${codeId}: ${error?.message ?? 'no row'}`)
  return {
    voided: data.voided_at !== null,
    reason: data.void_reason,
    sittingEntryId: data.sitting_entry_id,
  }
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

test.describe('Red Team: codes-tab void Server Action guard (NF)', () => {
  let admin: Admin
  let adminContext: BrowserContext
  let orgId: string
  let adminUserId: string
  let studentId: string
  let subjectId: string
  let entryId: string
  let forge: { id: string; code: string }
  let flip: { id: string; code: string }
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }

  test.beforeAll(async ({ browser }) => {
    admin = getAdminClient()
    await seedRedTeamUsers()
    const a = await seedRedTeamAdmin()
    orgId = a.orgId
    adminUserId = a.adminUserId
    track.adminId = a.adminUserId
    studentId = await upsertUser(admin, NF_STUDENT_EMAIL, NF_STUDENT_PASSWORD, orgId)
    const picked = await pickSubjectWithQuestions(admin, { orgId })
    subjectId = picked.subjectId
    await ensureExamConfig(orgId, subjectId, picked.topicId)

    const egmontAdmin: SupabaseClient = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    const sittingId = await createSittingRpc(egmontAdmin, adminUserId)
    track.sittingIds.push(sittingId)
    // No code is issued for this entry, so uq_internal_exam_codes_live_entry stays free for the
    // flip below. The composite FK needs (entry id, org, subject, user) to match the code's row.
    entryId = await insertEntry(admin, { orgId, sittingId, userId: studentId, subjectId })

    forge = await insertLegacyCode(admin, { orgId, adminId: adminUserId, studentId, subjectId })
    flip = await insertLegacyCode(admin, { orgId, adminId: adminUserId, studentId, subjectId })

    adminContext = await signInAdmin(browser, adminUserId)
  })

  test.afterAll(async () => {
    const errors: string[] = []
    try {
      const { data, error } = await admin
        .from('internal_exam_codes')
        .update({ deleted_at: new Date().toISOString() })
        .like('code', `${NF_CODE_PREFIX}%`)
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`codes: ${error.message}`)
      if (data && data.length > 0) {
        console.log(`NF afterAll: soft-deleted ${data.length} code(s)`)
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
    if (errors.length > 0) throw new Error(`NF afterAll: ${errors.join('; ')}`)
  })

  test('a reserved system void reason is refused, and free text through the same dialog voids', async () => {
    // Non-vacuous: the target exists and is unvoided before the attempt.
    expect(await codeState(admin, forge.id)).toEqual({
      voided: false,
      reason: null,
      sittingEntryId: null,
    })

    const page = await adminContext.newPage()
    await page.goto(CODES_URL)
    const row = page.getByRole('row').filter({ hasText: forge.code })
    await expect(row).toHaveCount(1)
    await row.getByRole('button', { name: 'Void' }).click()

    await page.locator('#void-reason').fill(FORGED_REASON)
    await page.getByRole('button', { name: 'Void code' }).click()
    await expect(page.getByRole('alert')).toHaveText(/reserved for the system/i)

    // The RPC would have written the token straight to void_reason (#1820).
    expect(await codeState(admin, forge.id)).toEqual({
      voided: false,
      reason: null,
      sittingEntryId: null,
    })

    // CONTROL: the reason string is what is refused — free text, same dialog, same code, voids it.
    await page.locator('#void-reason').fill(NF_FREE_TEXT)
    await page.getByRole('button', { name: 'Void code' }).click()
    await expect(page.locator('#void-reason')).toBeHidden()
    expect(await codeState(admin, forge.id)).toEqual({
      voided: true,
      reason: NF_FREE_TEXT,
      sittingEntryId: null,
    })
    await page.close()
  })

  test('a code attached to a sitting entry after the row rendered cannot be voided from the codes tab', async () => {
    expect(await codeState(admin, flip.id)).toEqual({
      voided: false,
      reason: null,
      sittingEntryId: null,
    })

    const page = await adminContext.newPage()
    await page.goto(CODES_URL)
    const row = page.getByRole('row').filter({ hasText: flip.code })
    await expect(row).toHaveCount(1)
    // The row rendered as a legacy code, so codeRowVoidable offered the button.
    await row.getByRole('button', { name: 'Void' }).click()
    await expect(page.locator('#void-reason')).toBeVisible()

    // Stale render: the code becomes a sitting code before the submit reaches the server.
    const { data: moved, error: moveErr } = await admin
      .from('internal_exam_codes')
      .update({ sitting_entry_id: entryId })
      .eq('id', flip.id)
      .select('id')
    if (moveErr || moved?.length !== 1) {
      throw new Error(`attach entry: ${moveErr?.message ?? moved?.length}`)
    }
    expect((await codeState(admin, flip.id)).sittingEntryId).toBe(entryId)

    await page.locator('#void-reason').fill(NF_FREE_TEXT)
    await page.getByRole('button', { name: 'Void code' }).click()
    await expect(page.getByRole('alert')).toHaveText(/Manage this sitting code from its sitting/i)

    // The legacy RPC has no sitting guard (#1820), so a bypass here voids a sitting code from the
    // wrong screen; the first test's control proves this same submit voids a legacy code.
    expect(await codeState(admin, flip.id)).toEqual({
      voided: false,
      reason: null,
      sittingEntryId: entryId,
    })
    await page.close()
  })
})
