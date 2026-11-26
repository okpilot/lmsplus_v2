/**
 * Red Team Spec: internal-exam code-existence oracle is unified at the Server Action (Vector NL)
 *
 * Attack: a student who holds one live code probes OTHER codes through the code-entry modal to
 * learn which 8-character strings are live codes belonging to someone else — in their own org and
 * in another org. `start_internal_exam_session` (mig 20261117001400) looks the code up by `code`
 * alone (no org, no owner scope) and raises `code_not_yours` when it exists but is owned by someone
 * else, `code_not_found` when it does not exist, so the RPC itself IS an existence oracle.
 * Expected: the student-facing surface shows ONE message for all three probes — the unified string
 * in `apps/web/app/app/internal-exam/actions/_error-messages.ts` — never the generic
 * `Failed to start internal exam.` fallback, and nothing is consumed, started or audited.
 * CONTROL: the same three code strings through the RPC directly (the prober's own authenticated
 * PostgREST client, bypassing the Server Action) return DISTINCT tokens, so the unified message is
 * doing the hiding rather than the signal being absent.
 *
 * Hermetic: dedicated throwaway students; probe codes carry E2E_REDTEAM_NL_CODE_PREFIX; afterAll
 * soft-deletes them and the prober's sessions (per-step accumulator).
 */

import { randomBytes } from 'node:crypto'
import { expect, type Page, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { ensureConsentRecords, getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { getEgmontOrgId, getOrCreateOtherOrg, upsertUser } from './helpers/seed-core'
import {
  E2E_REDTEAM_NL_CODE_PREFIX,
  E2E_REDTEAM_NL_CROSSORG_EMAIL,
  E2E_REDTEAM_NL_CROSSORG_PASSWORD,
  E2E_REDTEAM_NL_PROBER_EMAIL,
  E2E_REDTEAM_NL_PROBER_PASSWORD,
} from './helpers/seed-markers'
import { pickSubjectWithQuestions } from './helpers/seed-quiz'
import { VICTIM_EMAIL, VICTIM_PASSWORD } from './helpers/seed-users'
import { signInViaForm } from './server-action-capture'

type Admin = ReturnType<typeof getAdminClient>

const RPC = 'start_internal_exam_session'
/** `_error-messages.ts` maps BOTH code_not_found and code_not_yours to this string. */
const UNIFIED = 'Invalid or expired code. Please contact your administrator.'
/** `start-internal-exam.ts` fallback for an unmapped RPC token. */
const FALLBACK = 'Failed to start internal exam.'
/** Crockford alphabet of the code-entry input's sanitizer (no I/O/0/1). */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const BASE_URL = 'http://localhost:3000'

/** An 8-character marked code the code-entry input keeps verbatim. */
function nlCode(): string {
  const tail = Array.from(randomBytes(4), (b) => ALPHABET[b % ALPHABET.length]).join('')
  return `${E2E_REDTEAM_NL_CODE_PREFIX}${tail}`
}

test.describe.configure({ mode: 'serial' })

test.describe('Red Team: internal-exam code existence is not disclosed to a prober (NL)', () => {
  test.setTimeout(180_000)

  let admin: Admin
  let orgId: string
  let otherOrgId: string
  let subjectId: string
  let proberId: string
  let victimId: string
  let crossOrgOwnerId: string
  let proberRpc: SupabaseClient
  /** The prober's own live code — never submitted, it only makes the modal reachable. */
  let ownCode = ''
  /** Live, owned by another student in the prober's org. */
  let sameOrgForeignCode = ''
  /** Live, owned by a student in another org. */
  let crossOrgCode = ''
  /** No such row. */
  let missingCode = ''
  const codeIds = new Set<string>()

  async function seedCode(opts: { owner: string; org: string; subject: string }): Promise<string> {
    const code = nlCode()
    const { data, error } = await admin
      .from('internal_exam_codes')
      .insert({
        code,
        subject_id: opts.subject,
        student_id: opts.owner,
        issued_by: opts.owner,
        organization_id: opts.org,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single()
    if (error || typeof data?.id !== 'string') throw new Error(`seedCode: ${error?.message}`)
    codeIds.add(data.id)
    return code
  }

  /** Opens the code-entry modal, submits `code`, returns the alert text. */
  async function probeViaUi(page: Page, code: string): Promise<string> {
    await page.goto('/app/internal-exam')
    await expect(page.getByTestId('available-list')).toBeVisible({ timeout: 20_000 })
    const form = page.getByTestId('code-entry-form')
    // The row's Start handler only fires once AvailableTab has hydrated, so retry the click.
    // Escape first: a dialog that opened but lost the visibility race would otherwise leave its
    // scrim over the button, and every later click would time out on pointer interception.
    await expect(async () => {
      await page.keyboard.press('Escape')
      await expect(form).toBeHidden({ timeout: 2_000 })
      await page.getByTestId('start-button').first().click({ timeout: 2_000 })
      await expect(form).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await page.getByTestId('code-input').fill(code)
    await page.getByRole('button', { name: 'Start exam' }).click()
    const alert = form.getByRole('alert').first()
    await expect(alert).toBeVisible({ timeout: 20_000 })
    return ((await alert.textContent()) ?? '').trim()
  }

  test.beforeAll(async () => {
    admin = getAdminClient()
    orgId = await getEgmontOrgId(admin)
    otherOrgId = await getOrCreateOtherOrg(admin)

    proberId = await upsertUser(
      admin,
      E2E_REDTEAM_NL_PROBER_EMAIL,
      E2E_REDTEAM_NL_PROBER_PASSWORD,
      orgId,
    )
    victimId = await upsertUser(admin, VICTIM_EMAIL, VICTIM_PASSWORD, orgId)
    crossOrgOwnerId = await upsertUser(
      admin,
      E2E_REDTEAM_NL_CROSSORG_EMAIL,
      E2E_REDTEAM_NL_CROSSORG_PASSWORD,
      otherOrgId,
    )

    // easa_subjects is shared reference data (no organization_id), so the cross-org code reuses it.
    subjectId = (await pickSubjectWithQuestions(admin, { orgId })).subjectId

    ownCode = await seedCode({ owner: proberId, org: orgId, subject: subjectId })
    sameOrgForeignCode = await seedCode({ owner: victimId, org: orgId, subject: subjectId })
    crossOrgCode = await seedCode({
      owner: crossOrgOwnerId,
      org: otherOrgId,
      subject: subjectId,
    })
    missingCode = nlCode()

    proberRpc = await createAuthenticatedClient(
      E2E_REDTEAM_NL_PROBER_EMAIL,
      E2E_REDTEAM_NL_PROBER_PASSWORD,
    )
  })

  test.afterAll(async () => {
    const errors: string[] = []
    try {
      if (codeIds.size > 0) {
        const { data, error } = await admin
          .from('internal_exam_codes')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', Array.from(codeIds))
          .is('deleted_at', null)
          .select('id')
        if (error) throw new Error(`codes: ${error.message}`)
        if ((data?.length ?? 0) > 0)
          console.log(`[NL afterAll] soft-deleted ${data?.length} code(s)`)
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      codeIds.clear()
    }
    try {
      if (proberId) {
        const { data, error } = await admin
          .from('quiz_sessions')
          .update({ deleted_at: new Date().toISOString() })
          .eq('student_id', proberId)
          .is('deleted_at', null)
          .select('id')
        if (error) throw new Error(`sessions: ${error.message}`)
        if ((data?.length ?? 0) > 0)
          console.log(`[NL afterAll] soft-deleted ${data?.length} session(s)`)
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`NL afterAll: ${errors.join('; ')}`)
  })

  test('NL1: the code-entry form shows one message for a foreign, a cross-org and an absent code', async ({
    browser,
  }) => {
    // Non-vacuous: both foreign codes really are live rows the RPC's lookup can find, and the
    // missing one really is absent — otherwise all three probes would agree trivially.
    const { data: live, error: liveErr } = await admin
      .from('internal_exam_codes')
      .select('code, student_id, organization_id, consumed_at, voided_at, deleted_at, expires_at')
      .in('code', [sameOrgForeignCode, crossOrgCode, missingCode])
      .is('deleted_at', null)
    if (liveErr) throw new Error(`fixture read: ${liveErr.message}`)
    expect(live?.map((r) => r.code).sort()).toEqual([sameOrgForeignCode, crossOrgCode].sort())
    for (const row of live ?? []) {
      expect(row.student_id, row.code).not.toBe(proberId)
      expect(row.consumed_at, row.code).toBeNull()
      expect(row.voided_at, row.code).toBeNull()
      expect(row.deleted_at, row.code).toBeNull()
      expect(new Date(row.expires_at as string).getTime()).toBeGreaterThan(Date.now())
    }
    expect(live?.some((r) => r.organization_id !== orgId)).toBe(true)

    await ensureConsentRecords(admin, proberId)
    const ctx = await browser.newContext({ storageState: undefined })
    await ctx.addCookies([
      { name: CONSENT_COOKIE, value: buildConsentCookieValue(proberId), url: BASE_URL },
    ])
    const page = await ctx.newPage()
    try {
      await signInViaForm(page, {
        email: E2E_REDTEAM_NL_PROBER_EMAIL,
        password: E2E_REDTEAM_NL_PROBER_PASSWORD,
      })

      const seen: Record<string, string> = {}
      for (const [label, code] of [
        ['same-org foreign', sameOrgForeignCode],
        ['cross-org foreign', crossOrgCode],
        ['absent', missingCode],
      ] as const) {
        seen[label] = await probeViaUi(page, code)
      }

      expect(seen['same-org foreign']).toBe(UNIFIED)
      expect(seen['cross-org foreign']).toBe(UNIFIED)
      expect(seen.absent).toBe(UNIFIED)
      // A dropped map entry falls through to the generic fallback, which differs per-token only by
      // being wrong for both — assert it never appears.
      expect(Object.values(seen)).not.toContain(FALLBACK)
      expect(new Set(Object.values(seen)).size).toBe(1)
    } finally {
      await ctx.close()
    }

    // Nothing consumed, no session, no audit row for the prober.
    const { data: after, error: afterErr } = await admin
      .from('internal_exam_codes')
      .select('id, consumed_at, consumed_session_id')
      .in('id', Array.from(codeIds))
    if (afterErr) throw new Error(`post-probe read: ${afterErr.message}`)
    expect(after?.length).toBe(codeIds.size)
    for (const row of after ?? []) {
      expect(row.consumed_at, row.id).toBeNull()
      expect(row.consumed_session_id, row.id).toBeNull()
    }
    const { count: sessions, error: sErr } = await admin
      .from('quiz_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', proberId)
      .is('deleted_at', null)
    if (sErr) throw new Error(`sessions: ${sErr.message}`)
    expect(sessions ?? -1).toBe(0)
    const { count: audits, error: aErr } = await admin
      .from('audit_events')
      .select('id', { count: 'exact', head: true })
      .eq('actor_id', proberId)
      .eq('event_type', 'internal_exam.started')
    if (aErr) throw new Error(`audits: ${aErr.message}`)
    expect(audits ?? -1).toBe(0)
  })

  test('NL2: control — the RPC itself still distinguishes the three codes', async () => {
    const foreign = await proberRpc.rpc(RPC, { p_code: sameOrgForeignCode })
    const cross = await proberRpc.rpc(RPC, { p_code: crossOrgCode })
    const absent = await proberRpc.rpc(RPC, { p_code: missingCode })

    expect(foreign.error?.message ?? `no error ${JSON.stringify(foreign.data)}`).toMatch(
      /code_not_yours/,
    )
    expect(cross.error?.message ?? `no error ${JSON.stringify(cross.data)}`).toMatch(
      /code_not_yours/,
    )
    expect(absent.error?.message ?? `no error ${JSON.stringify(absent.data)}`).toMatch(
      /code_not_found/,
    )
    // The oracle the unified message hides: two distinct tokens over the same three inputs.
    const tokens = new Set([foreign.error?.message, cross.error?.message, absent.error?.message])
    expect(tokens.size).toBe(2)
    // The prober's own code is untouched by the control arm — it is never submitted.
    const { data: own, error: ownErr } = await admin
      .from('internal_exam_codes')
      .select('consumed_at, voided_at, deleted_at')
      .eq('code', ownCode)
      .eq('organization_id', orgId)
      .single()
    if (ownErr) throw new Error(`own code read: ${ownErr.message}`)
    expect(own).not.toBeNull()
    expect(own?.consumed_at).toBeNull()
    expect(own?.voided_at).toBeNull()
    expect(own?.deleted_at).toBeNull()
  })
})
