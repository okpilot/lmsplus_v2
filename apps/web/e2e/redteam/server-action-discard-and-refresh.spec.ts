/**
 * Red Team Spec: discardQuizAndRefresh Server Action (actions/discard-and-refresh.ts) — Vectors IQ, IR
 *
 * IQ (idor): the attacker replays discardQuizAndRefresh with the victim's active session id →
 *     refused; the victim's session stays active.
 * IR (privilege-escalation): discardQuizAndRefresh on the attacker's own active internal_exam /
 *     vfr_rt_exam session → refused with the mode token; the session stays active.
 * CONTROL: the banner's Discard click (the captured request) soft-deletes the attacker's own
 *     mock_exam session, and a replay soft-deletes a second one.
 *
 * Status: Expected to PASS.
 */

import { type Browser, type BrowserContext, expect, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { E2E_REDTEAM_IQ_MARKER } from './helpers/seed-markers'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamUsers,
  VICTIM_EMAIL,
} from './helpers/seed-users'
import { postServerAction, signInViaForm, watchServerActions } from './server-action-capture'

const BASE_URL = 'http://localhost:3000'
const QUIZ_PATH = '/app/quiz'

type Captured = { headers: Record<string, string>; id: string }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

test.describe('Red Team: discardQuizAndRefresh Server Action (IQ, IR)', () => {
  test.setTimeout(120_000)

  let admin: ReturnType<typeof getAdminClient>
  let orgId: string
  let victimUserId: string
  let attackerUserId: string
  let q1: string
  let q2: string
  let ctx: BrowserContext
  let cap: Captured

  const seedSession = async (opts: { studentId: string; mode: string }) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: opts.studentId,
        mode: opts.mode,
        total_questions: 2,
        time_limit_seconds: 3600,
        config: { question_ids: [q1, q2], e2e_marker: E2E_REDTEAM_IQ_MARKER },
      })
      .select('id')
      .single()
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`seedSession(${opts.mode}): ${error?.message ?? 'bad shape'}`)
    return data.id
  }

  const readSession = async (id: string) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('id, ended_at, deleted_at')
      .eq('id', id)
      .single()
    if (error || !data) throw new Error(`readSession: ${error?.message}`)
    return data
  }

  const invoke = (arg: Record<string, unknown>) =>
    postServerAction(ctx.request, {
      url: `${BASE_URL}${QUIZ_PATH}`,
      headers: cap.headers,
      id: cap.id,
      origin: BASE_URL,
      arg,
    })

  const loadQuestionIds = async (): Promise<[string, string]> => {
    const { data, error } = await admin
      .from('questions')
      .select('id')
      .eq('organization_id', orgId)
      .eq('question_type', 'multiple_choice')
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('id')
      .limit(2)
    if (error) throw new Error(`beforeAll questions: ${error.message}`)
    const [a, b] = (data ?? []).map((r) => r.id)
    if (typeof a !== 'string' || !a || typeof b !== 'string' || !b)
      throw new Error('need 2 active MC questions with string ids')
    return [a, b]
  }

  /** Discards the attacker's own mock_exam through the banner and captures that request. */
  const captureViaBanner = async (browser: Browser) => {
    await cleanupStudentActiveSessions(ATTACKER_EMAIL)
    const own = await seedSession({ studentId: attackerUserId, mode: 'mock_exam' })
    ctx = await browser.newContext({ storageState: undefined })
    await ctx.addCookies([
      { name: CONSENT_COOKIE, value: buildConsentCookieValue(attackerUserId), url: BASE_URL },
    ])
    const page = await ctx.newPage()
    await signInViaForm(page, { email: ATTACKER_EMAIL, password: ATTACKER_PASSWORD })
    const watch = watchServerActions(page)
    await page.goto(QUIZ_PATH)
    await page.getByRole('button', { name: 'Discard' }).first().click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Discard' }).click()
    await expect.poll(() => watch.headers() !== undefined, { timeout: 15_000 }).toBe(true)
    // CONTROL: the banner's own request discarded the attacker's session.
    await expect
      .poll(async () => (await readSession(own)).deleted_at !== null, { timeout: 15_000 })
      .toBe(true)
    const ids = await watch.settle()
    await page.close()
    const id = ids.get('discardQuizAndRefresh')
    const headers = watch.headers()
    if (!headers || !id) throw new Error('discardQuizAndRefresh action not captured')
    expect(headers['next-action']).toBe(id)
    cap = { headers, id }
  }

  test.beforeAll(async ({ browser }) => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    victimUserId = seed.victimUserId
    attackerUserId = seed.attackerUserId
    ;[q1, q2] = await loadQuestionIds()
    await captureViaBanner(browser)
  })

  const softDeleteMarkerSessions = async () => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('config->>e2e_marker', E2E_REDTEAM_IQ_MARKER)
      .is('deleted_at', null)
      .select('id')
    if (error) throw new Error(`soft-delete marker sessions: ${error.message}`)
    if ((data?.length ?? 0) > 0) console.info(`[discard-refresh] soft-deleted ${data?.length}`)
  }

  // A failed beforeAll skips every afterEach; the session it seeded must not outlive the file.
  test.afterAll(async () => {
    const errors: string[] = []
    try {
      await softDeleteMarkerSessions()
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      await ctx?.close()
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  test.afterEach(async () => {
    const errors: string[] = []
    try {
      await softDeleteMarkerSessions()
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

  test('IQ: a victim session id is not discarded through the action', async () => {
    await cleanupStudentActiveSessions(VICTIM_EMAIL)
    await cleanupStudentActiveSessions(ATTACKER_EMAIL)
    const victim = await seedSession({ studentId: victimUserId, mode: 'mock_exam' })
    const before = await readSession(victim)
    expect(before.deleted_at).toBeNull()
    expect(before.ended_at).toBeNull()

    const res = await invoke({ sessionId: victim })
    expect(res).not.toContain('"success":true')
    expect(res).toContain('Session not found or already discarded')
    const after = await readSession(victim)
    expect(after.deleted_at).toBeNull()
    expect(after.ended_at).toBeNull()

    // CONTROL: the same replay discards the attacker's own session.
    const own = await seedSession({ studentId: attackerUserId, mode: 'mock_exam' })
    const ownRes = await invoke({ sessionId: own })
    expect(ownRes).toContain('"success":true')
    expect((await readSession(own)).deleted_at).not.toBeNull()
  })

  for (const [mode, token] of [
    ['internal_exam', 'cannot_discard_internal_exam'],
    ['vfr_rt_exam', 'cannot_discard_vfr_rt_exam'],
  ] as const) {
    test(`IR: an active ${mode} session cannot be discarded through the action`, async () => {
      await cleanupStudentActiveSessions(ATTACKER_EMAIL)
      const id = await seedSession({ studentId: attackerUserId, mode })
      const before = await readSession(id)
      expect(before.deleted_at).toBeNull()
      expect(before.ended_at).toBeNull()

      const res = await invoke({ sessionId: id })
      expect(res).not.toContain('"success":true')
      expect(res).toContain(token)
      const after = await readSession(id)
      expect(after.deleted_at).toBeNull()
      expect(after.ended_at).toBeNull()
    })
  }
})
