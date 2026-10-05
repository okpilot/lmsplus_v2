/**
 * Red Team Spec: the quiz session read path `/app/quiz/session/<id>` (#1026 PR 3) — Vectors HA/HB
 *
 * HA (idor): the attacker requests the victim's session URL.
 *     CONTROL: the victim's own request renders the session.
 * HB (answer-oracle): a mock_exam loaded by id carries the saved answer but no correctness, and the
 *     browser runs no re-check. CONTROL: the same load of a quick_quiz re-checks the saved answer.
 *
 * Status: Expected to PASS.
 */

import { type Browser, type BrowserContext, expect, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_QR_MARKER } from './helpers/seed-markers'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed-users'

const BASE_URL = 'http://localhost:3000'
const KEY_TOKENS = ['isCorrect', 'correctOptionId', 'correct_option_id']

type Mode = 'quick_quiz' | 'mock_exam'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

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

test.describe('Red Team: quiz session read path by id (HA, HB)', () => {
  test.setTimeout(120_000)

  let admin: ReturnType<typeof getAdminClient>
  let orgId: string
  let victimUserId: string
  let attackerUserId: string
  let subjectId: string
  let q1: string
  let q2: string

  const seedSession = async (mode: Mode) => {
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
      })
      .select('id')
      .single()
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`seedSession(${mode}): ${error?.message ?? 'bad shape'}`)
    return data.id
  }

  const readSession = async (id: string) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('active_device_id, current_index, deleted_at, ended_at')
      .eq('id', id)
      .single()
    if (error || !data) throw new Error(`readSession: ${error?.message}`)
    return data
  }

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
      .not('correct_option_id', 'is', null)
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
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('config->>e2e_marker', E2E_REDTEAM_QR_MARKER)
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`soft-delete marker rows: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.info(`[qs-id-route] soft-deleted ${data?.length}`)
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

  test('HA: a foreign session id redirects away and renders none of the session', async ({
    browser,
  }) => {
    const sessionId = await seedSession('quick_quiz')
    const before = await readSession(sessionId)
    const url = `${BASE_URL}/app/quiz/session/${sessionId}`
    const victimCtx = await signedInContext(browser, {
      id: victimUserId,
      email: VICTIM_EMAIL,
      password: VICTIM_PASSWORD,
    })
    const attackerCtx = await signedInContext(browser, {
      id: attackerUserId,
      email: ATTACKER_EMAIL,
      password: ATTACKER_PASSWORD,
    })
    try {
      // CONTROL: the owner's request renders the session and its question ids.
      const own = await victimCtx.request.get(url, { maxRedirects: 0 })
      expect(own.status()).toBe(200)
      const ownBody = await own.text()
      expect(ownBody).toContain(q1)
      expect(ownBody).toContain(q2)

      // HA: the attacker's request is redirected to the quiz page and carries none of it.
      const foreign = await attackerCtx.request.get(url, { maxRedirects: 0 })
      const foreignBody = await foreign.text()
      // loading.tsx streams the shell first, so the redirect may arrive in the body instead of a 3xx.
      const redirected =
        /\/app\/quiz$/.test(foreign.headers().location ?? '') ||
        /NEXT_REDIRECT;[a-z]+;\/app\/quiz;/.test(foreignBody)
      expect(redirected).toBe(true)
      expect(ownBody).not.toMatch(/NEXT_REDIRECT;[a-z]+;\/app\/quiz;/)
      expect(foreignBody).not.toContain(q1)
      expect(foreignBody).not.toContain(q2)

      const page = await attackerCtx.newPage()
      await page.goto(url)
      await page.waitForURL(/\/app\/quiz$/, { timeout: 15_000 })
      expect(await page.content()).not.toContain(q1)
      await page.close()

      expect(await readSession(sessionId)).toEqual(before)
    } finally {
      await victimCtx.close()
      await attackerCtx.close()
    }
  })

  for (const mode of ['mock_exam', 'quick_quiz'] as const) {
    const title =
      mode === 'mock_exam'
        ? 'HB: a mock_exam loaded by id carries the saved answer and no correctness or re-check'
        : 'HB CONTROL: a quick_quiz loaded by id re-checks the saved answer'
    test(title, async ({ browser }) => {
      const sessionId = await seedSession(mode)
      const victim = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
      const save = await victim.rpc('save_quiz_answer', {
        p_session_id: sessionId,
        p_question_id: q1,
        p_answer: { selected_option_id: 'b' },
        p_time_spent_ms: 1000,
        p_device_id: '00000000-0000-4000-8000-0000000000c1',
      })
      expect(save.error).toBeNull()

      const ctx = await signedInContext(browser, {
        id: victimUserId,
        email: VICTIM_EMAIL,
        password: VICTIM_PASSWORD,
      })
      try {
        const url = `${BASE_URL}/app/quiz/session/${sessionId}`
        const res = await ctx.request.get(url, { maxRedirects: 0 })
        expect(res.status()).toBe(200)
        const body = await res.text()
        // The seed is in the payload scanned below: the saved answer and its question.
        expect(body).toContain(q1)
        expect(body).toMatch(/selectedOptionId\\?":\\?"b/)
        for (const token of KEY_TOKENS) expect(body, token).not.toContain(token)

        const page = await ctx.newPage()
        // An aborted action response may never settle its body, so collect bodies as they arrive.
        const actionBodies: string[] = []
        // checkAnswer from the re-check: q1 and selectedOptionId, no timeSpentMs (saves carry it).
        const requestBodies: string[] = []
        const isRecheck = (b: string) =>
          b.includes(q1) && b.includes('selectedOptionId') && !b.includes('timeSpentMs')
        page.on('request', (r) => {
          if (r.method() === 'POST' && r.headers()['next-action'])
            requestBodies.push(r.postData() ?? '')
        })
        page.on('response', (r) => {
          if (r.request().method() === 'POST' && r.request().headers()['next-action'])
            r.text().then(
              (t) => actionBodies.push(t),
              () => undefined,
            )
        })
        await page.goto(url)
        await expect(page.getByText(/Question 1 of 2/)).toBeVisible({ timeout: 15_000 })
        if (mode === 'quick_quiz') {
          await expect
            .poll(() => actionBodies.some((b) => b.includes('isCorrect')), { timeout: 10_000 })
            .toBe(true)
          expect(requestBodies.some(isRecheck)).toBe(true)
        } else {
          await page.waitForTimeout(3_000)
          expect(requestBodies.some(isRecheck)).toBe(false)
          expect(actionBodies.length).toBeGreaterThan(0)
          for (const b of actionBodies) for (const t of KEY_TOKENS) expect(b, t).not.toContain(t)
        }
        await page.close()
      } finally {
        await ctx.close()
      }
    })
  }
})
