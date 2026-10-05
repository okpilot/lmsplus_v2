/**
 * Red Team Spec: the quiz session read path `/app/quiz/session/<id>` (#1026 PR 3) — Vectors HD/HE
 *
 * HD (enumeration): the attacker requests the victim's ended, discarded and saved session ids. Each
 *     must answer exactly like a never-issued id: a redirect to /app/quiz, never the report route or
 *     the saved-quiz view. CONTROL: the owner's ended id redirects to its report; the owner's saved
 *     id renders the saved-quiz view.
 * HE (open-redirect): crafted non-uuid ids redirect only to /app/quiz.
 *     CONTROL: the redirect-target extraction captures the owner's report redirect.
 *
 * Status: Expected to PASS.
 */

import { type Browser, type BrowserContext, expect, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { E2E_REDTEAM_QR_MARKER } from './helpers/seed-markers'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed-users'

const BASE_URL = 'http://localhost:3000'
const NEVER_ISSUED_ID = '00000000-0000-4000-8000-00000000dead'
const CRAFTED_IDS = [
  '%2F%2Fevil.example',
  'https%3A%2F%2Fevil.example',
  '..%2F..%2Fadmin',
  `${NEVER_ISSUED_ID}%3Fnext%3D%2F%2Fevil.example`,
  '%5C%5Cevil.example',
]

type Seed = { mode: 'quick_quiz' | 'mock_exam'; state: 'ended' | 'discarded' | 'saved' }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** Every redirect target the response carries: the Location header and streamed NEXT_REDIRECTs. */
function redirectTargets(location: string | undefined, body: string): string[] {
  const out: string[] = []
  if (location) out.push(new URL(location, BASE_URL).toString().replace(BASE_URL, ''))
  for (const m of body.matchAll(/NEXT_REDIRECT;[a-z]+;([^;]+);/g)) out.push(m[1] ?? '')
  return [...new Set(out)]
}

async function fetchRoute(ctx: BrowserContext, id: string) {
  const res = await ctx.request.get(`${BASE_URL}/app/quiz/session/${id}`, { maxRedirects: 0 })
  const body = await res.text()
  return { status: res.status(), body, targets: redirectTargets(res.headers().location, body) }
}

async function signedInContext(
  browser: Browser,
  user: { id: string; email: string; password: string },
): Promise<BrowserContext> {
  const ctx = await browser.newContext({ storageState: undefined })
  await ctx.addCookies([
    { name: CONSENT_COOKIE, value: buildConsentCookieValue(user.id), url: BASE_URL },
  ])
  const page = await ctx.newPage()
  await page.goto('/')
  await page.getByLabel('Email address').fill(user.email)
  await page.getByLabel('Password', { exact: true }).fill(user.password)
  await Promise.all([
    page.waitForURL(/\/(app\/dashboard|consent)(?:\?.*)?$/, { timeout: 15_000 }),
    page.getByRole('button', { name: 'Sign in' }).click(),
  ])
  await page.close()
  return ctx
}

test.describe('Red Team: quiz session id route enumeration and redirects (HD, HE)', () => {
  test.setTimeout(120_000)

  let admin: ReturnType<typeof getAdminClient>
  let orgId: string
  let victimUserId: string
  let attackerUserId: string
  let subjectId: string
  let q1: string
  let q2: string

  const seedSession = async ({ mode, state }: Seed) => {
    const now = new Date().toISOString()
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: victimUserId,
        mode,
        subject_id: subjectId,
        total_questions: 2,
        time_limit_seconds: mode === 'mock_exam' ? 3600 : null,
        config: { question_ids: [q1, q2], e2e_marker: E2E_REDTEAM_QR_MARKER },
        ended_at: state === 'ended' ? now : null,
        deleted_at: state === 'ended' ? null : now,
        saved_at: state === 'saved' ? now : null,
      })
      .select('id')
      .single()
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`seedSession(${mode}/${state}): ${error?.message ?? 'bad shape'}`)
    return data.id
  }

  const victim = () => ({ id: victimUserId, email: VICTIM_EMAIL, password: VICTIM_PASSWORD })
  const attacker = () => ({
    id: attackerUserId,
    email: ATTACKER_EMAIL,
    password: ATTACKER_PASSWORD,
  })

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    victimUserId = seed.victimUserId
    attackerUserId = seed.attackerUserId
    const { data, error } = await admin
      .from('questions')
      .select('id, subject_id')
      .eq('organization_id', orgId)
      .eq('question_type', 'multiple_choice')
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('id')
      .limit(50)
    if (error) throw new Error(`beforeAll questions: ${error.message}`)
    const rows = (data ?? []) as Array<{ id: string; subject_id: string }>
    const first = rows[0]
    const second = rows.find((r) => r.id !== first?.id && r.subject_id === first?.subject_id)
    if (!first || !second) throw new Error('need 2 active MC questions in one subject')
    q1 = first.id
    q2 = second.id
    subjectId = first.subject_id
  })

  test.beforeEach(async () => {
    await cleanupStudentActiveSessions(VICTIM_EMAIL)
    await cleanupStudentActiveSessions(ATTACKER_EMAIL)
  })

  test.afterEach(async () => {
    const errors: string[] = []
    try {
      // Saved rows are already soft-deleted; clear the saved marker so they leave the victim's list.
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ saved_at: null })
        .eq('config->>e2e_marker', E2E_REDTEAM_QR_MARKER)
        .not('saved_at', 'is', null)
        .select('id')
      if (error) throw new Error(`unsave marker rows: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.info(`[qs-id-enum] unsaved ${data?.length}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('config->>e2e_marker', E2E_REDTEAM_QR_MARKER)
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`soft-delete marker rows: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.info(`[qs-id-enum] soft-deleted ${data?.length}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    for (const email of [VICTIM_EMAIL, ATTACKER_EMAIL]) {
      try {
        await cleanupStudentActiveSessions(email)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  test('HD: a foreign ended, discarded or saved id answers like a never-issued id', async ({
    browser,
  }) => {
    const endedId = await seedSession({ mode: 'mock_exam', state: 'ended' })
    const discardedId = await seedSession({ mode: 'quick_quiz', state: 'discarded' })
    const savedId = await seedSession({ mode: 'quick_quiz', state: 'saved' })
    const victimCtx = await signedInContext(browser, victim())
    const attackerCtx = await signedInContext(browser, attacker())
    try {
      // CONTROL: the owner's ended id goes to its report; the owner's saved id renders its view.
      const ownEnded = await fetchRoute(victimCtx, endedId)
      expect(ownEnded.targets).toContain(`/app/quiz/report?session=${endedId}`)
      const ownSaved = await fetchRoute(victimCtx, savedId)
      expect(ownSaved.status).toBe(200)
      expect(ownSaved.targets).toEqual([])
      expect(ownSaved.body).toContain('Saved quiz')

      const baseline = await fetchRoute(attackerCtx, NEVER_ISSUED_ID)
      expect(baseline.targets).toEqual(['/app/quiz'])

      for (const id of [endedId, discardedId, savedId]) {
        const foreign = await fetchRoute(attackerCtx, id)
        expect(foreign.targets, id).toEqual(baseline.targets)
        expect(foreign.status, id).toBe(baseline.status)
        expect(foreign.body, id).not.toContain('report?session=')
        expect(foreign.body, id).not.toContain('Saved quiz')
        expect(foreign.body, id).not.toContain(q1)
      }

      const { data, error } = await admin
        .from('quiz_sessions')
        .select('id, saved_at, deleted_at')
        .eq('id', savedId)
        .single()
      if (error) throw new Error(`read saved row: ${error.message}`)
      expect(data.saved_at).not.toBeNull()
      expect(data.deleted_at).not.toBeNull()
    } finally {
      await victimCtx.close()
      await attackerCtx.close()
    }
  })

  test('HE: a crafted session id redirects only to the quiz page', async ({ browser }) => {
    const endedId = await seedSession({ mode: 'mock_exam', state: 'ended' })
    const ctx = await signedInContext(browser, victim())
    try {
      // CONTROL: the extraction sees a redirect target other than /app/quiz.
      const own = await fetchRoute(ctx, endedId)
      expect(own.targets).toEqual([`/app/quiz/report?session=${endedId}`])

      for (const id of CRAFTED_IDS) {
        const res = await fetchRoute(ctx, id)
        // A crafted id either reaches the page (redirect to /app/quiz) or no route at all (404).
        if (res.status === 404) {
          expect(res.targets, id).toEqual([])
          continue
        }
        expect(res.targets, id).toEqual(['/app/quiz'])
      }

      const page = await ctx.newPage()
      await page.goto(`${BASE_URL}/app/quiz/session/${CRAFTED_IDS[0]}`)
      await page.waitForURL(/\/app\/quiz$/, { timeout: 15_000 })
      expect(new URL(page.url()).host).toBe('localhost:3000')
      await page.close()
    } finally {
      await ctx.close()
    }
  })
})
