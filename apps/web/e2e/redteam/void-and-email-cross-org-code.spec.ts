/**
 * Red Team Spec: the two new codes-tab Server-Action guards against a FOREIGN-ORG code
 * (Vectors NH, NI, #1777)
 *
 * NH (cross-tenant) — `voidInternalExamCode` now runs `checkSittingCode`
 *   (apps/web/app/app/admin/internal-exams/actions/sitting-code-guard.ts) BEFORE
 *   `void_internal_exam_code`. The guard reads `internal_exam_codes` through the admin's RLS-bound
 *   client with `.eq('organization_id', organizationId)`, and its four refusal strings
 *   (`Code is already voided`, `Manage this sitting code from its sitting`,
 *   `Cannot void a finished attempt`, `This attempt is no longer live`) are a richer state oracle
 *   than the RPC's uniform `code_not_found`. A foreign-org code must reach NONE of them.
 *   Arms: an active foreign code, an already-voided foreign code (same refusal — no state oracle),
 *   and an active foreign code with a reserved system reason (the reason check runs before the
 *   lookup, so it must not become an existence oracle either).
 *
 * NI (cross-tenant) — `sendInternalExamCodeEmail` reads its payload through
 *   `getInternalExamCodeForEmail` (apps/web/app/app/admin/internal-exams/email-queries.ts), which
 *   uses `adminClient` (SERVICE ROLE, RLS bypassed). Its `.eq('organization_id', organizationId)`
 *   is therefore the SOLE barrier: a miss emails another org's plaintext code to another org's
 *   student and stamps `emailed_at`, which is what makes a cancelled sitting's code a pending
 *   removal notice (mig 20261117001000).
 *
 * Both actions are replayed directly (`postServerAction`), not through the row UI: a cross-org code
 * has no row in the attacker's codes tab, so the replay is the only way an attacker reaches them.
 *
 * CONTROL ARM (in-spec): the identical replay, same captured headers, same action id, on an
 * OWN-ORG legacy code — the void succeeds and writes `voided_at` + the reason and one
 * `internal_exam.code_voided` row; the send reaches a post-guard terminal result. So each refusal
 * above is caused by the org scope, not by a broken replay. The send control does not assert
 * delivery: a send without RESEND_API_KEY succeeds outside production and fails in production (apps/web/lib/email/resend.ts).
 *
 * Hermetic: every code this spec creates carries NH_CODE_PREFIX in `code`; afterAll soft-deletes
 * them (never a hard DELETE — `internal_exam_codes` is soft-delete, docs/database.md §3) through a
 * per-step error accumulator. The cross-org org, admin and student are the shared red-team
 * fixtures (`createCrossOrgUser` / `seedCrossOrgAdmin`), not created here.
 */

import { type BrowserContext, expect, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { getAdminClient } from '../helpers/supabase'
import { upsertUser } from './helpers/seed-core'
import { pickSubjectWithQuestions } from './helpers/seed-quiz'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  createCrossOrgUser,
  seedCrossOrgAdmin,
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed-users'
import { postServerAction, signInViaForm, watchServerActions } from './server-action-capture'

const BASE_URL = 'http://localhost:3000'
const CODES_PATH = '/app/admin/internal-exams?tab=codes&status=active'

/** Stable marker for every code this spec creates; afterAll soft-deletes by this prefix. */
const NH_CODE_PREFIX = 'RTNH'
const NH_STUDENT_EMAIL = 'redteam-nh-student@lmsplus.local'
const NH_STUDENT_PASSWORD = 'redteam-nh-student-2026!'
const NH_FREE_TEXT = '[E2E_REDTEAM_NH] cross-org void probe'
const NH_CAPTURE_TEXT = '[E2E_REDTEAM_NH] capture'
/** One of RESERVED_VOID_REASONS (packages/db/src/schema.ts) — the token three notice readers key on. */
const FORGED_REASON = 'sitting_cancelled'
const NOT_FOUND = 'Code not found'
/** What the send action returns once it is past the scope and sitting guards. */
const SEND_TERMINAL = /"success":true|Failed to send email/
const LEGACY_VALIDITY_MS = 24 * 60 * 60 * 1000

type Admin = ReturnType<typeof getAdminClient>
type Captured = { headers: Record<string, string>; voidId: string; sendId: string }
type Code = { id: string; code: string }

function markedCode(): string {
  const tail = crypto.randomUUID().replaceAll('-', '').toUpperCase().slice(0, 6)
  return `${NH_CODE_PREFIX}${tail}`
}

test.describe('Red Team: codes-tab void and send guards vs a foreign-org code (NH, NI)', () => {
  test.setTimeout(180_000)

  let admin: Admin
  let ctx: BrowserContext
  let cap: Captured
  let egmontOrgId = ''
  let crossOrgId = ''
  let capture: Code
  let voidControl: Code
  let sendControl: Code
  let victimActive: Code
  let victimVoided: Code

  async function insertLegacyCode(opts: {
    orgId: string
    issuerId: string
    studentId: string
    subjectId: string
    voidedBy?: string
  }): Promise<Code> {
    const code = markedCode()
    const voided = opts.voidedBy
      ? { voided_at: new Date().toISOString(), voided_by: opts.voidedBy, void_reason: 'seeded' }
      : {}
    const { data, error } = await admin
      .from('internal_exam_codes')
      .insert({
        code,
        organization_id: opts.orgId,
        issued_by: opts.issuerId,
        student_id: opts.studentId,
        subject_id: opts.subjectId,
        // What the pre-2e issue RPC gives a legacy code: issued_at + 24h.
        expires_at: new Date(Date.now() + LEGACY_VALIDITY_MS).toISOString(),
        ...voided,
      })
      .select('id')
      .single()
    if (error || typeof data?.id !== 'string') {
      throw new Error(`legacy code (${opts.orgId}): ${error?.message ?? 'no row'}`)
    }
    return { id: data.id, code }
  }

  async function codeState(codeId: string) {
    const { data, error } = await admin
      .from('internal_exam_codes')
      .select('id, organization_id, voided_at, void_reason, emailed_at')
      .eq('id', codeId)
      .single()
    if (error || !data) throw new Error(`code ${codeId}: ${error?.message ?? 'no row'}`)
    return {
      orgId: data.organization_id as string,
      voided: data.voided_at !== null,
      reason: data.void_reason as string | null,
      emailed: data.emailed_at !== null,
    }
  }

  async function auditCount(eventType: string, codeId: string): Promise<number> {
    const { count, error } = await admin
      .from('audit_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', eventType)
      .eq('resource_id', codeId)
    if (error) throw new Error(`audit_events ${eventType}: ${error.message}`)
    return count ?? 0
  }

  const invoke = (actionId: string, arg: Record<string, unknown>) =>
    postServerAction(ctx.request, {
      url: `${BASE_URL}${CODES_PATH}`,
      headers: cap.headers,
      id: actionId,
      origin: BASE_URL,
      arg,
    })

  test.beforeAll(async ({ browser }) => {
    admin = getAdminClient()
    await seedRedTeamUsers()
    const egmont = await seedRedTeamAdmin()
    egmontOrgId = egmont.orgId
    const crossAdmin = await seedCrossOrgAdmin()
    const crossStudent = await createCrossOrgUser()
    crossOrgId = crossAdmin.orgId
    // Non-vacuous by construction: a shared org would make every "foreign" arm an own-org call.
    expect(crossOrgId).not.toBe(egmontOrgId)
    expect(crossStudent.orgId).toBe(crossOrgId)

    const studentId = await upsertUser(admin, NH_STUDENT_EMAIL, NH_STUDENT_PASSWORD, egmontOrgId)
    // easa_subjects is shared reference data (no organization_id), so one subject serves both orgs.
    const { subjectId } = await pickSubjectWithQuestions(admin, { orgId: egmontOrgId })

    const own = {
      orgId: egmontOrgId,
      issuerId: egmont.adminUserId,
      studentId,
      subjectId,
    }
    capture = await insertLegacyCode(own)
    voidControl = await insertLegacyCode(own)
    sendControl = await insertLegacyCode(own)
    const foreign = {
      orgId: crossOrgId,
      issuerId: crossAdmin.adminUserId,
      studentId: crossStudent.userId,
      subjectId,
    }
    victimActive = await insertLegacyCode(foreign)
    victimVoided = await insertLegacyCode({ ...foreign, voidedBy: crossAdmin.adminUserId })

    ctx = await browser.newContext({ storageState: undefined })
    await ctx.addCookies([
      { name: CONSENT_COOKIE, value: buildConsentCookieValue(egmont.adminUserId), url: BASE_URL },
    ])
    const page = await ctx.newPage()
    await signInViaForm(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    const watch = watchServerActions(page)
    await page.goto(CODES_PATH)
    // The capture code is voided for real: that POST is what yields the replay headers. Both
    // action references sit in the chunks this page loads — the row renders Void and Send email.
    const row = page.getByRole('row').filter({ hasText: capture.code })
    await expect(row).toHaveCount(1)
    await expect(row.getByRole('button', { name: 'Send email' })).toBeVisible()
    await row.getByRole('button', { name: 'Void' }).click()
    await page.locator('#void-reason').fill(NH_CAPTURE_TEXT)
    await page.getByRole('button', { name: 'Void code' }).click()
    await expect.poll(() => watch.headers() !== undefined, { timeout: 20_000 }).toBe(true)
    await expect(page.locator('#void-reason')).toBeHidden()
    const ids = await watch.settle()
    await page.close()

    const headers = watch.headers()
    const voidId = ids.get('voidInternalExamCode')
    const sendId = ids.get('sendInternalExamCodeEmail')
    if (!headers || !voidId || !sendId) {
      throw new Error(
        `actions not captured: headers=${headers !== undefined} void=${voidId} send=${sendId}`,
      )
    }
    expect(headers['next-action']).toBe(voidId)
    expect(voidId).not.toBe(sendId)
    cap = { headers, voidId, sendId }
  })

  test.afterAll(async () => {
    const errors: string[] = []
    try {
      const { data, error } = await admin
        .from('internal_exam_codes')
        .update({ deleted_at: new Date().toISOString() })
        .like('code', `${NH_CODE_PREFIX}%`)
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`codes: ${error.message}`)
      if (data && data.length > 0) {
        console.log(`NH afterAll: soft-deleted ${data.length} code(s)`)
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      await ctx?.close()
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`NH afterAll: ${errors.join('; ')}`)
  })

  test('NH: a foreign-org code is neither voided nor described, and an own-org code is', async () => {
    // Non-vacuous: both victims exist, sit in the other org, and hold the state each arm probes.
    expect(await codeState(victimActive.id)).toEqual({
      orgId: crossOrgId,
      voided: false,
      reason: null,
      emailed: false,
    })
    expect(await codeState(victimVoided.id)).toEqual({
      orgId: crossOrgId,
      voided: true,
      reason: 'seeded',
      emailed: false,
    })

    const onActive = await invoke(cap.voidId, {
      codeId: victimActive.id,
      reason: NH_FREE_TEXT,
    })
    expect(onActive).not.toContain('"success":true')
    expect(onActive).toContain(NOT_FOUND)

    // No state oracle: the already-voided foreign code gets the SAME refusal, not the guard's
    // `Code is already voided`.
    const onVoided = await invoke(cap.voidId, { codeId: victimVoided.id, reason: NH_FREE_TEXT })
    expect(onVoided).not.toContain('"success":true')
    expect(onVoided).toContain(NOT_FOUND)
    expect(onVoided).not.toContain('already voided')

    // The reserved-reason check runs before the lookup, so it must not leak existence either:
    // the refusal names the reason, never the code.
    const onReserved = await invoke(cap.voidId, {
      codeId: victimActive.id,
      reason: FORGED_REASON,
    })
    expect(onReserved).not.toContain('"success":true')
    expect(onReserved).toContain('reserved for the system')

    expect(await codeState(victimActive.id)).toEqual({
      orgId: crossOrgId,
      voided: false,
      reason: null,
      emailed: false,
    })
    expect(await codeState(victimVoided.id)).toEqual({
      orgId: crossOrgId,
      voided: true,
      reason: 'seeded',
      emailed: false,
    })
    expect(await auditCount('internal_exam.code_voided', victimActive.id)).toBe(0)
    expect(await auditCount('internal_exam.code_voided', victimVoided.id)).toBe(0)

    // CONTROL: the identical replay on an own-org legacy code voids it and audits it, so the three
    // refusals above are caused by the org scope, not by a rejected replay.
    expect((await codeState(voidControl.id)).voided).toBe(false)
    const control = await invoke(cap.voidId, { codeId: voidControl.id, reason: NH_FREE_TEXT })
    expect(control).toContain('"success":true')
    expect(await codeState(voidControl.id)).toEqual({
      orgId: egmontOrgId,
      voided: true,
      reason: NH_FREE_TEXT,
      emailed: false,
    })
    expect(await auditCount('internal_exam.code_voided', voidControl.id)).toBe(1)
  })

  test('NI: a foreign-org code is never emailed, and an own-org code reaches the send path', async () => {
    // Non-vacuous: the victim exists in the other org and has never been emailed.
    expect(await codeState(victimActive.id)).toEqual({
      orgId: crossOrgId,
      voided: false,
      reason: null,
      emailed: false,
    })

    const res = await invoke(cap.sendId, { codeId: victimActive.id })
    expect(res).not.toContain('"success":true')
    expect(res).toContain(NOT_FOUND)
    // `getInternalExamCodeForEmail` reads with the service role, so the org filter is the only
    // barrier between the attacker and another org's plaintext code and `emailed_at`.
    expect((await codeState(victimActive.id)).emailed).toBe(false)
    expect(await auditCount('internal_exam.code_emailed', victimActive.id)).toBe(0)

    // CONTROL: the identical replay on an own-org legacy code gets PAST both guards to a terminal
    // result. Delivery is not asserted — a send without RESEND_API_KEY fails in production (CI).
    const control = await invoke(cap.sendId, { codeId: sendControl.id })
    expect(control).not.toContain(NOT_FOUND)
    expect(control).not.toContain('Sitting codes cannot be emailed')
    expect(control).toMatch(SEND_TERMINAL)
  })
})
