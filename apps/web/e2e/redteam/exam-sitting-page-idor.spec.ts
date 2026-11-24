/**
 * Red Team Spec: sitting detail page IDOR (Vector MX, #1777)
 *
 * Attack: GET /app/admin/internal-exams/sittings/<id> for an egmont live sitting and an egmont
 * cancelled (soft-deleted) sitting, as a cross-org admin and as an egmont student. The page reads
 * the sitting with the user client and the invigilator with the service role (readInvigilator).
 * Expected: no response carries either sitting's permitted_materials marker; the cross-org admin
 * gets the admin not-found boundary, the student gets requireAdmin's redirect.
 * CONTROL: the egmont admin receives both markers on the same paths.
 *
 * Hermetic: sittings carry EXAM_SITTING_E2E_PREFIX; afterEach soft-deletes the tracked unclosed
 * sittings (cleanupSittingFixtures, per-step accumulator).
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
// notFound() after the shell streamed: Next appends a noindex robots meta; the boundary markup itself
// ships in every admin payload.
const NOT_FOUND = /<meta name="robots" content="noindex"\/>/

type Credentials = { email: string; password: string; userId: string }
type Fixture = { id: string; materials: string }

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

async function fetchPage(
  context: BrowserContext,
  id: string,
): Promise<{ status: number; body: string }> {
  const res = await context.request.fetch(`${SITTING_PATH}/${id}`, {
    maxRedirects: 0,
    timeout: 90_000,
  })
  return { status: res.status(), body: await res.text() }
}

test.describe('Red Team: sitting detail page IDOR (MX)', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 })

  const admin = getAdminClient()
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }
  let egmontAdmin: Credentials
  let crossAdmin: Credentials
  let student: Credentials

  test.beforeAll(async () => {
    const users = await seedRedTeamUsers()
    const a = await seedRedTeamAdmin()
    const ca = await seedCrossOrgAdmin()
    track.adminId = a.adminUserId
    egmontAdmin = { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, userId: a.adminUserId }
    crossAdmin = { email: ca.email, password: ca.password, userId: ca.adminUserId }
    student = { email: ATTACKER_EMAIL, password: ATTACKER_PASSWORD, userId: users.attackerUserId }
  })

  test.afterEach(async () => {
    await cleanupSittingFixtures(admin, track)
  })

  async function seedSittings(): Promise<{ live: Fixture; cancelled: Fixture }> {
    const client = await createAuthenticatedClient(ADMIN_EMAIL, ADMIN_PASSWORD)
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000)
    const out: Fixture[] = []
    for (let i = 0; i < 2; i++) {
      const id = await createSittingRpc(client, egmontAdmin.userId, tomorrow)
      track.sittingIds.push(id)
      const { data, error } = await admin
        .from('exam_sittings')
        .select('permitted_materials')
        .eq('id', id)
        .single()
      if (error || typeof data?.permitted_materials !== 'string') {
        throw new Error(`read ${id}: ${error?.message}`)
      }
      out.push({ id, materials: data.permitted_materials })
    }
    const [live, cancelled] = out as [Fixture, Fixture]
    const cx = await client.rpc('cancel_exam_sitting', { p_sitting_id: cancelled.id })
    if (cx.error) throw new Error(`cancel_exam_sitting: ${cx.error.message}`)
    const { data: st, error: stErr } = await admin
      .from('exam_sittings')
      .select('id, status')
      .in('id', [live.id, cancelled.id])
    if (stErr || !st) throw new Error(`status read: ${stErr?.message}`)
    const byId = new Map(st.map((r) => [r.id as string, r.status as string]))
    expect(byId.get(live.id)).toBe('scheduled')
    expect(byId.get(cancelled.id)).toBe('cancelled')
    return { live, cancelled }
  }

  test('MX: cross-org admin and egmont student receive no egmont sitting page', async ({
    browser,
  }) => {
    const fx = await seedSittings()
    const cross = await signIn(browser, crossAdmin)
    const stu = await signIn(browser, student)
    try {
      for (const f of [fx.live, fx.cancelled]) {
        const c = await fetchPage(cross, f.id)
        expect(c.status, `cross ${f.id}`).toBeLessThan(300)
        expect(c.body, `cross not-found ${f.id}`).toMatch(NOT_FOUND)
        expect(c.body, `cross marker ${f.id}`).not.toContain(f.materials)
        const s = await fetchPage(stu, f.id)
        // The admin layout shell streams first, so requireAdmin's redirect travels in a 200 body.
        expect(s.status, `student ${f.id}`).toBe(200)
        expect(s.body, `student redirect ${f.id}`).toMatch(
          /NEXT_REDIRECT;(?:replace|push);\/app\/dashboard;/,
        )
        expect(s.body, `student marker ${f.id}`).not.toContain(f.materials)
      }
    } finally {
      await cross.close()
      await stu.close()
    }
  })

  test('MX: egmont admin receives both sitting pages (control)', async ({ browser }) => {
    const fx = await seedSittings()
    const ctx = await signIn(browser, egmontAdmin)
    try {
      for (const f of [fx.live, fx.cancelled]) {
        const r = await fetchPage(ctx, f.id)
        expect(r.status, `admin ${f.id}`).toBe(200)
        expect(r.body, `admin marker ${f.id}`).toContain(f.materials)
        expect(r.body, `admin not-found ${f.id}`).not.toMatch(NOT_FOUND)
      }
    } finally {
      await ctx.close()
    }
  })
})
