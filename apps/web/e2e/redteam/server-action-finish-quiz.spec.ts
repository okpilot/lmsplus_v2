/**
 * Red Team Spec: finishQuizSession Server Action (actions/finish.ts, #1026 PR 2d) — Vector HO
 *
 * HO (idor): the attacker replays finishQuizSession with the victim's sessionId (and the
 *     victim's deviceId) → refused; the victim session stays open and ungraded. An
 *     unauthenticated replay is refused too.
 *     CONTROL: the same call on the attacker's own session ends and grades it.
 *
 * Status: Expected to PASS.
 */

import { type BrowserContext, expect, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_QF_MARKER } from './helpers/seed-markers'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed-users'
import { postServerAction, signInViaForm, watchServerActions } from './server-action-capture'

const BASE_URL = 'http://localhost:3000'
const SESSION_PATH = '/app/quiz/session'
const ATTACKER_DEVICE = '00000000-0000-4000-8000-0000000000e1'
const VICTIM_DEVICE = '00000000-0000-4000-8000-0000000000e2'

type Captured = { headers: Record<string, string>; id: string }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

test.describe('Red Team: finishQuizSession Server Action (HO)', () => {
  test.setTimeout(120_000)

  let admin: ReturnType<typeof getAdminClient>
  let orgId: string
  let victimUserId: string
  let attackerUserId: string
  let q1: string
  let q2: string
  let q1Key: string
  let ctx: BrowserContext
  let cap: Captured

  const seedSession = async (studentId: string) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode: 'mock_exam',
        total_questions: 2,
        time_limit_seconds: 3600,
        config: { question_ids: [q1, q2], e2e_marker: E2E_REDTEAM_QF_MARKER },
      })
      .select('id')
      .single()
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`seedSession: ${error?.message ?? 'bad shape'}`)
    return data.id
  }

  /** Session owned by `email`, q1 saved with its key, claimed by `device`. */
  const claimedSession = async (opts: {
    studentId: string
    email: string
    password: string
    device: string
  }) => {
    const id = await seedSession(opts.studentId)
    const client = await createAuthenticatedClient(opts.email, opts.password)
    const claim = await client.rpc('claim_quiz_session', {
      p_session_id: id,
      p_device_id: opts.device,
    })
    expect(claim.error).toBeNull()
    const save = await client.rpc('save_quiz_answer', {
      p_session_id: id,
      p_question_id: q1,
      p_answer: { selected_option_id: q1Key },
      p_time_spent_ms: 1000,
      p_device_id: opts.device,
    })
    expect(save.error).toBeNull()
    return id
  }

  const readSession = async (id: string) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('id, ended_at, correct_count')
      .eq('id', id)
      .single()
    if (error || !data) throw new Error(`readSession: ${error?.message}`)
    return data
  }

  const countAnswers = async (id: string) => {
    const { count, error } = await admin
      .from('quiz_session_answers')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', id)
    if (error) throw new Error(`countAnswers: ${error.message}`)
    return count ?? 0
  }

  const invoke = (arg: Record<string, unknown>) =>
    postServerAction(ctx.request, {
      url: `${BASE_URL}${SESSION_PATH}`,
      headers: cap.headers,
      id: cap.id,
      origin: BASE_URL,
      arg,
    })

  test.beforeAll(async ({ browser }) => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    victimUserId = seed.victimUserId
    attackerUserId = seed.attackerUserId
    const { data, error } = await admin
      .from('questions')
      .select('id, correct_option_id')
      .eq('organization_id', orgId)
      .eq('question_type', 'multiple_choice')
      .eq('status', 'active')
      .is('deleted_at', null)
      .not('correct_option_id', 'is', null)
      .order('id')
      .limit(2)
    if (error) throw new Error(`beforeAll questions: ${error.message}`)
    if (!Array.isArray(data) || data.length < 2) throw new Error('need 2 active MC questions')
    const [r1, r2] = data
    if (typeof r1?.id !== 'string' || !r1.id || typeof r2?.id !== 'string' || !r2.id)
      throw new Error('questions rows lack string ids')
    if (typeof r1.correct_option_id !== 'string' || !r1.correct_option_id)
      throw new Error('first question lacks a string correct_option_id')
    q1 = r1.id
    q2 = r2.id
    q1Key = r1.correct_option_id

    // Capture the action id + replay headers from the attacker's own session page.
    await cleanupStudentActiveSessions(ATTACKER_EMAIL)
    const sessionId = await claimedSession({
      studentId: attackerUserId,
      email: ATTACKER_EMAIL,
      password: ATTACKER_PASSWORD,
      device: ATTACKER_DEVICE,
    })
    ctx = await browser.newContext({ storageState: undefined })
    await ctx.addCookies([
      { name: CONSENT_COOKIE, value: buildConsentCookieValue(attackerUserId), url: BASE_URL },
    ])
    const page = await ctx.newPage()
    await signInViaForm(page, { email: ATTACKER_EMAIL, password: ATTACKER_PASSWORD })
    const watch = watchServerActions(page)
    await page.goto(`${SESSION_PATH}/${sessionId}`)
    await expect(page.getByText(/Question 1 of 2/)).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => watch.headers() !== undefined, { timeout: 10_000 }).toBe(true)
    const ids = await watch.settle()
    await page.close()
    const id = ids.get('finishQuizSession')
    const headers = watch.headers()
    if (!headers || !id) throw new Error('finishQuizSession action not captured')
    cap = { headers, id }
  })

  test.afterAll(async () => {
    await ctx?.close()
  })

  test.afterEach(async () => {
    const errors: string[] = []
    try {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('config->>e2e_marker', E2E_REDTEAM_QF_MARKER)
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`soft-delete marker rows: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.info(`[finish-action] soft-deleted ${data?.length}`)
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

  test('HO: the victim session id cannot be finished through the action', async ({
    playwright,
  }) => {
    await cleanupStudentActiveSessions(VICTIM_EMAIL)
    const victimId = await claimedSession({
      studentId: victimUserId,
      email: VICTIM_EMAIL,
      password: VICTIM_PASSWORD,
      device: VICTIM_DEVICE,
    })
    expect((await readSession(victimId)).ended_at).toBeNull()

    const foreign = await invoke({ sessionId: victimId, deviceId: VICTIM_DEVICE })
    expect(foreign).not.toContain('"success":true')
    expect(foreign).toContain('"success":false')
    expect((await readSession(victimId)).ended_at).toBeNull()
    expect(await countAnswers(victimId)).toBe(0)

    // Unauthenticated replay: no cookies at all.
    const anon = await playwright.request.newContext()
    try {
      const text = await postServerAction(anon, {
        url: `${BASE_URL}${SESSION_PATH}`,
        headers: cap.headers,
        id: cap.id,
        origin: BASE_URL,
        arg: { sessionId: victimId, deviceId: VICTIM_DEVICE },
      })
      expect(text).not.toContain('"success":true')
    } finally {
      await anon.dispose()
    }
    expect((await readSession(victimId)).ended_at).toBeNull()
    expect(await countAnswers(victimId)).toBe(0)

    // CONTROL: the attacker's own session is finished and graded by the same call.
    await cleanupStudentActiveSessions(VICTIM_EMAIL)
    await cleanupStudentActiveSessions(ATTACKER_EMAIL)
    const ownId = await claimedSession({
      studentId: attackerUserId,
      email: ATTACKER_EMAIL,
      password: ATTACKER_PASSWORD,
      device: ATTACKER_DEVICE,
    })
    const own = await invoke({ sessionId: ownId, deviceId: ATTACKER_DEVICE })
    expect(own).toContain('"success":true')
    const after = await readSession(ownId)
    expect(after.ended_at).not.toBeNull()
    expect(after.correct_count).toBe(1)
    expect(await countAnswers(ownId)).toBe(1)
  })
})
