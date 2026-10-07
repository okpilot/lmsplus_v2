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

const BASE_URL = 'http://localhost:3000'
const SESSION_PATH = '/app/quiz/session'
const ATTACKER_DEVICE = '00000000-0000-4000-8000-0000000000e1'
const VICTIM_DEVICE = '00000000-0000-4000-8000-0000000000e2'

type Captured = { headers: Record<string, string>; id: string }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const REFERENCE_RES = [
  /createServerReference\)?\(\s*"([0-9a-f]{40,})"[^"]*?"(\w+)"\s*\)/g,
  /"([0-9a-f]{40,})":\{"name":"(\w+)"\}/g,
]

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

  const replayHeaders = () => {
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(cap.headers)) {
      if (!['cookie', 'content-length', 'host'].includes(k.toLowerCase())) headers[k] = v
    }
    headers['next-action'] = cap.id
    headers.origin = BASE_URL
    return headers
  }

  const invoke = async (arg: Record<string, unknown>): Promise<string> => {
    const res = await ctx.request.post(`${BASE_URL}${SESSION_PATH}`, {
      headers: replayHeaders(),
      data: JSON.stringify([arg]),
      maxRedirects: 0,
    })
    return res.text()
  }

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
    q1 = data[0]?.id as string
    q2 = data[1]?.id as string
    q1Key = data[0]?.correct_option_id as string

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
    await page.goto('/')
    await page.getByLabel('Email address').fill(ATTACKER_EMAIL)
    await page.getByLabel('Password', { exact: true }).fill(ATTACKER_PASSWORD)
    await Promise.all([
      page.waitForURL(/\/(app\/dashboard|consent)(?:\?.*)?$/, { timeout: 15_000 }),
      page.getByRole('button', { name: 'Sign in' }).click(),
    ])
    const ids = new Map<string, string>()
    const scripts: Promise<void>[] = []
    let headers: Record<string, string> | undefined
    page.on('response', (res) => {
      if (!res.url().includes('/_next/') || !res.url().split('?')[0]?.endsWith('.js')) return
      scripts.push(
        res
          .text()
          .then((js) => {
            for (const re of REFERENCE_RES)
              for (const m of js.matchAll(re)) if (m[1] && m[2]) ids.set(m[2], m[1])
          })
          .catch(() => {}),
      )
    })
    page.on('request', (req) => {
      const h = req.headers()
      if (req.method() === 'POST' && h['next-action'] && !headers) headers = h
    })
    await page.goto(`${SESSION_PATH}/${sessionId}`)
    await expect(page.getByText(/Question 1 of 2/)).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => headers !== undefined, { timeout: 10_000 }).toBe(true)
    await Promise.all(scripts)
    await page.close()
    const id = ids.get('finishQuizSession')
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
      const res = await anon.post(`${BASE_URL}${SESSION_PATH}`, {
        headers: replayHeaders(),
        data: JSON.stringify([{ sessionId: victimId, deviceId: VICTIM_DEVICE }]),
        maxRedirects: 0,
      })
      expect(await res.text()).not.toContain('"success":true')
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
