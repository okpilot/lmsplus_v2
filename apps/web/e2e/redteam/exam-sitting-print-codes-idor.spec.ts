/**
 * Red Team Spec: print-codes page IDOR (Vector MZ, #1777)
 *
 * Attack: GET /app/admin/internal-exams/sittings/<id>/print — the only page that renders PLAINTEXT
 * internal exam codes — for an egmont sitting holding one live issued code, as a cross-org admin, an
 * egmont student and a soft-deleted egmont admin with a live JWT.
 * Expected: no response body carries the plaintext code; the cross-org admin gets the admin
 * not-found boundary, the student and the soft-deleted admin get requireAdmin's redirect.
 * CONTROL: the egmont admin receives the plaintext code on the same path.
 *
 * Hermetic: throwaway student and soft-deleted admin; sitting carries the E2E seed marker;
 * afterAll soft-deletes the issued codes, then cleanupSittingFixtures (per-step accumulator).
 */

import { type Browser, type BrowserContext, expect, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { getAdminClient } from '../helpers/supabase'
import {
  cleanupSittingFixtures,
  createSittingRpc,
  type SittingTrack,
} from './helpers/exam-sitting-seed'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { upsertUser } from './helpers/seed-core'
import { ensureExamConfig, pickSubjectWithQuestions } from './helpers/seed-quiz'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedCrossOrgAdmin,
  seedRedTeamAdmin,
  seedRedTeamUsers,
} from './helpers/seed-users'

const BASE_URL = 'http://localhost:3000'
const SITTING_PATH = '/app/admin/internal-exams/sittings'
// notFound() after the shell streamed: Next appends a noindex robots meta.
const NOT_FOUND = /<meta name="robots" content="noindex"\/>/
const REDIRECT = /NEXT_REDIRECT;(?:replace|push);\/app\/dashboard;/

const MZ_STUDENT_EMAIL = 'redteam-mz-student@lmsplus.local'
const MZ_STUDENT_PASSWORD = 'redteam-mz-student-2026!'
const MZ_SOFTDEL_EMAIL = 'redteam-mz-softdel-admin@lmsplus.local'
const MZ_SOFTDEL_PASSWORD = 'redteam-mz-softdel-admin-2026!'

type Admin = ReturnType<typeof getAdminClient>
type Credentials = { email: string; password: string; userId: string }

async function signIn(browser: Browser, creds: Credentials): Promise<BrowserContext> {
  const context = await browser.newContext({ storageState: undefined })
  const page = await context.newPage()
  await page.goto('/')
  await page.getByLabel('Email address').fill(creds.email)
  await page.getByLabel('Password', { exact: true }).fill(creds.password)
  await Promise.all([
    page.waitForURL(/\/(app\/dashboard|consent)(?:\?.*)?$/, { timeout: 30_000 }),
    page.getByRole('button', { name: 'Sign in' }).click(),
  ])
  await context.addCookies([
    { name: CONSENT_COOKIE, value: buildConsentCookieValue(creds.userId), url: BASE_URL },
  ])
  await page.close()
  return context
}

async function fetchPrint(
  context: BrowserContext,
  sittingId: string,
): Promise<{ status: number; body: string }> {
  const res = await context.request.fetch(`${SITTING_PATH}/${sittingId}/print`, {
    maxRedirects: 0,
    timeout: 90_000,
  })
  return { status: res.status(), body: await res.text() }
}

test.describe('Red Team: print-codes page IDOR (MZ)', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 })

  let admin: Admin
  let egmontAdmin: Credentials
  let crossAdmin: Credentials
  let student: Credentials
  let softAdmin: Credentials
  let candidateId: string
  let sittingId: string
  let plaintextCode: string
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const users = await seedRedTeamUsers()
    const a = await seedRedTeamAdmin()
    const ca = await seedCrossOrgAdmin()
    track.adminId = a.adminUserId
    egmontAdmin = { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, userId: a.adminUserId }
    crossAdmin = { email: ca.email, password: ca.password, userId: ca.adminUserId }
    student = { email: ATTACKER_EMAIL, password: ATTACKER_PASSWORD, userId: users.attackerUserId }

    candidateId = await upsertUser(admin, MZ_STUDENT_EMAIL, MZ_STUDENT_PASSWORD, a.orgId)
    const picked = await pickSubjectWithQuestions(admin, { orgId: a.orgId })
    await ensureExamConfig(a.orgId, picked.subjectId, picked.topicId)

    const softId = await upsertUser(admin, MZ_SOFTDEL_EMAIL, MZ_SOFTDEL_PASSWORD, a.orgId, 'admin')
    const { error: liveErr } = await admin
      .from('users')
      .update({ deleted_at: null })
      .eq('id', softId)
    if (liveErr) throw new Error(`softdel revive: ${liveErr.message}`)
    softAdmin = { email: MZ_SOFTDEL_EMAIL, password: MZ_SOFTDEL_PASSWORD, userId: softId }

    const client = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    sittingId = await createSittingRpc(client, a.adminUserId)
    track.sittingIds.push(sittingId)
    const add = await client.rpc('add_exam_sitting_candidates', {
      p_sitting_id: sittingId,
      p_user_ids: [candidateId],
    })
    if (add.error) throw new Error(`add candidates: ${add.error.message}`)
    const ent = await client.rpc('add_exam_sitting_entries', {
      p_sitting_id: sittingId,
      p_user_ids: [candidateId],
      p_subject_ids: [picked.subjectId],
    })
    if (ent.error) throw new Error(`add entries: ${ent.error.message}`)
    expect(ent.data?.[0]?.added, JSON.stringify(ent.data)).toBe(1)
    const iss = await client.rpc('issue_sitting_exam_codes', { p_sitting_id: sittingId })
    if (iss.error) throw new Error(`issue: ${iss.error.message}`)
    expect(iss.data?.[0]?.issued).toBe(1)

    const { data: codes, error: cErr } = await admin
      .from('internal_exam_codes')
      .select('code')
      .eq('student_id', candidateId)
      .is('voided_at', null)
      .is('consumed_at', null)
      .is('deleted_at', null)
    if (cErr || codes?.length !== 1) throw new Error(`codes: ${cErr?.message ?? codes?.length}`)
    plaintextCode = codes[0]?.code as string
    expect(plaintextCode.length).toBeGreaterThan(5)

    const { data: sit, error: sErr } = await admin
      .from('exam_sittings')
      .select('status')
      .eq('id', sittingId)
      .single()
    if (sErr) throw new Error(`sitting read: ${sErr.message}`)
    expect(sit?.status).toBe('scheduled')
  })

  test.afterAll(async () => {
    const errors: string[] = []
    try {
      const { error } = await admin
        .from('internal_exam_codes')
        .update({ deleted_at: new Date().toISOString() })
        .eq('student_id', candidateId)
        .not('sitting_entry_id', 'is', null)
        .is('deleted_at', null)
      if (error) throw new Error(`codes: ${error.message}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      await cleanupSittingFixtures(admin, track)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`MZ afterAll: ${errors.join('; ')}`)
  })

  test('MZ: egmont admin prints the plaintext code (control)', async ({ browser }) => {
    const ctx = await signIn(browser, egmontAdmin)
    try {
      const r = await fetchPrint(ctx, sittingId)
      expect(r.status).toBe(200)
      expect(r.body, 'admin code').toContain(plaintextCode)
      expect(r.body, 'admin not-found').not.toMatch(NOT_FOUND)
    } finally {
      await ctx.close()
    }
  })

  test('MZ: cross-org admin, student and soft-deleted admin get no printable code', async ({
    browser,
  }) => {
    // Non-vacuity: the sitting is still live and the code still printable at this point.
    const { data: live, error: liveErr } = await admin
      .from('exam_sittings')
      .select('status, deleted_at')
      .eq('id', sittingId)
      .single()
    if (liveErr) throw new Error(`sitting precondition: ${liveErr.message}`)
    expect({ status: live?.status, deleted: live?.deleted_at }).toEqual({
      status: 'scheduled',
      deleted: null,
    })
    const { data: codeRow, error: codeErr } = await admin
      .from('internal_exam_codes')
      .select('voided_at, consumed_at, deleted_at')
      .eq('code', plaintextCode)
      .single()
    if (codeErr) throw new Error(`code precondition: ${codeErr.message}`)
    expect(codeRow).toEqual({ voided_at: null, consumed_at: null, deleted_at: null })

    const cross = await signIn(browser, crossAdmin)
    const stu = await signIn(browser, student)
    // Signed in while live, then soft-deleted: the JWT outlives the profile row.
    const soft = await signIn(browser, softAdmin)
    const { data: del, error: delErr } = await admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', softAdmin.userId)
      .select('id')
    if (delErr || !del?.length) throw new Error(`softdel: ${delErr?.message ?? '0 rows'}`)
    try {
      const c = await fetchPrint(cross, sittingId)
      expect(c.status, 'cross status').toBeLessThan(300)
      expect(c.body, 'cross not-found').toMatch(NOT_FOUND)
      expect(c.body, 'cross code').not.toContain(plaintextCode)

      for (const [who, ctx] of [
        ['student', stu],
        ['soft-deleted admin', soft],
      ] as const) {
        // The admin layout shell streams first, so requireAdmin's redirect travels in a 200 body.
        const r = await fetchPrint(ctx, sittingId)
        expect(r.status, `${who} status`).toBe(200)
        expect(r.body, `${who} redirect`).toMatch(REDIRECT)
        expect(r.body, `${who} code`).not.toContain(plaintextCode)
      }
      // CONTROL (in-test): the same path still prints the code for the owning org's admin.
      const own = await signIn(browser, egmontAdmin)
      try {
        const r = await fetchPrint(own, sittingId)
        expect(r.status, 'control status').toBe(200)
        expect(r.body, 'control code').toContain(plaintextCode)
      } finally {
        await own.close()
      }
    } finally {
      await cross.close()
      await stu.close()
      await soft.close()
    }
  })
})
