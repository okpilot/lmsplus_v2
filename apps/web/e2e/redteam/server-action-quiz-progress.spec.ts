/**
 * Red Team Spec: quiz-progress Server Actions (#1026 PR 2a) — Vectors GQ/GR/GS
 *
 * Surface: saveQuizAnswer, saveQuizPosition, claimQuizSession (actions/quiz-progress.ts) and the
 * deviceId / timeSpentMs forwarded by checkAnswer into check_quiz_answer.
 *
 * GQ (idor): attacker replays each progress Server Action with the victim's sessionId.
 *     CONTROL: the same replays against the attacker's own session land.
 * GR (auth-bypass): after a takeover, checkAnswer replayed with deviceId OMITTED is refused and
 *     carries no grading. CONTROL: the same replay with the active deviceId grades.
 * GS (race): parallel claims from many devices leave exactly one device able to save.
 *     CONTROL: the winning device's save lands.
 *
 * Status: Expected to PASS.
 */

import { type BrowserContext, expect, type Page, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_QA_MARKER } from './helpers/seed-markers'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed-users'

const BASE_URL = 'http://localhost:3000'
const SESSION_PATH = '/app/quiz/session'
const VICTIM_DEVICE = '00000000-0000-4000-8000-0000000000a1'
const ATTACKER_DEVICE = '00000000-0000-4000-8000-0000000000b1'
const NOT_FOUND = 'This session could not be found.'
const TAKEN_OVER = 'open in another tab or device'

type ActionName = 'saveQuizAnswer' | 'saveQuizPosition' | 'claimQuizSession' | 'checkAnswer'
type Captured = { headers: Record<string, string>; ids: Map<string, string> }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

// Client-bundle action references: production `createServerReference("<id>", …, "<name>")`,
// dev (turbopack) `/* __next_internal_action_entry_do_not_use__ [{"<id>":{"name":"<name>"}}…`.
const REFERENCE_RES = [
  /createServerReference\)?\(\s*"([0-9a-f]{40,})"[^"]*?"(\w+)"\s*\)/g,
  /"([0-9a-f]{40,})":\{"name":"(\w+)"\}/g,
]

async function signIn(context: BrowserContext, creds: { email: string; password: string }) {
  const page = await context.newPage()
  await page.goto('/')
  await page.getByLabel('Email address').fill(creds.email)
  await page.getByLabel('Password', { exact: true }).fill(creds.password)
  await Promise.all([
    page.waitForURL(/\/(app\/dashboard|consent)(?:\?.*)?$/, { timeout: 15_000 }),
    page.getByRole('button', { name: 'Sign in' }).click(),
  ])
  return page
}

/** Starts a quiz through the UI, answers Q1, moves to Q2; returns action ids + replay headers. */
async function startQuizCapturing(page: Page): Promise<Captured> {
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
  await page.goto('/app/quiz')
  await expect(page.getByRole('heading', { name: 'Quiz' })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Study', exact: true }).click()
  const trigger = page.locator('[data-testid="subject-trigger"]')
  await trigger.waitFor({ state: 'visible' })
  await trigger.click()
  await page.locator('[data-testid="subject-option"]').first().click()
  await page.getByRole('button', { name: 'All' }).click()
  await page.getByRole('button', { name: 'Start Quiz' }).click()
  await page.waitForURL(`**${SESSION_PATH}`, { timeout: 15_000 })
  await expect(page.getByText(/Question 1 of \d+/)).toBeVisible({ timeout: 15_000 })
  const answers = page.locator('button:has(span.rounded-full)')
  await answers.first().click()
  await page.getByRole('button', { name: 'Submit Answer' }).first().click()
  const next = page.getByRole('button', { name: 'Next ›' })
  await next.waitFor({ state: 'visible', timeout: 10_000 })
  await next.click()
  await expect(page.getByText(/Question 2 of \d+/)).toBeVisible()
  await Promise.all(scripts)
  if (!headers) throw new Error('no Server Action request observed')
  return { headers, ids }
}

async function invoke(
  context: BrowserContext,
  cap: Captured,
  name: ActionName,
  arg: Record<string, unknown>,
): Promise<string> {
  const id = cap.ids.get(name)
  if (!id) throw new Error(`action id for ${name} not found`)
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(cap.headers)) {
    if (!['cookie', 'content-length', 'host'].includes(k.toLowerCase())) headers[k] = v
  }
  headers['next-action'] = id
  headers.origin = BASE_URL
  const res = await context.request.post(`${BASE_URL}${SESSION_PATH}`, {
    headers,
    data: JSON.stringify([arg]),
    maxRedirects: 0,
  })
  return res.text()
}

test.describe('Red Team: quiz-progress Server Actions (GQ, GR, GS)', () => {
  test.setTimeout(120_000)

  let admin: ReturnType<typeof getAdminClient>
  let orgId: string
  let victimUserId: string
  let attackerUserId: string
  let q1: string
  let q2: string

  const seedVictimSession = async () => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: victimUserId,
        mode: 'quick_quiz',
        total_questions: 2,
        config: { question_ids: [q1, q2], e2e_marker: E2E_REDTEAM_QA_MARKER },
      })
      .select('id')
      .single()
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`seedVictimSession: ${error?.message ?? 'bad shape'}`)
    return data.id
  }

  const readSession = async (id: string) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('active_device_id, current_index, pinned_question_ids, config')
      .eq('id', id)
      .single()
    if (error || !data) throw new Error(`readSession: ${error?.message}`)
    return data
  }

  const readProgress = async (id: string) => {
    const { data, error } = await admin
      .from('quiz_session_progress')
      .select('question_id, answer, time_spent_ms')
      .eq('session_id', id)
      .order('question_id')
    if (error) throw new Error(`readProgress: ${error.message}`)
    return data ?? []
  }

  const activeSessionOf = async (studentId: string) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('id, config')
      .eq('student_id', studentId)
      .is('ended_at', null)
      .is('deleted_at', null)
      .single()
    if (error || !data) throw new Error(`activeSessionOf: ${error?.message}`)
    const qids = (data.config as { question_ids?: unknown }).question_ids
    if (!Array.isArray(qids) || qids.length < 2) throw new Error('attacker session lacks questions')
    return { id: data.id as string, questionIds: qids as string[] }
  }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    victimUserId = seed.victimUserId
    attackerUserId = seed.attackerUserId
    const { data, error } = await admin
      .from('questions')
      .select('id')
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
        .eq('config->>e2e_marker', E2E_REDTEAM_QA_MARKER)
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`soft-delete marker rows: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.info(`[qp-actions] soft-deleted ${data?.length}`)
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

  const attackerBrowser = async (browser: import('@playwright/test').Browser) => {
    const ctx = await browser.newContext({ storageState: undefined })
    await ctx.addCookies([
      { name: CONSENT_COOKIE, value: buildConsentCookieValue(attackerUserId), url: BASE_URL },
    ])
    const page = await signIn(ctx, { email: ATTACKER_EMAIL, password: ATTACKER_PASSWORD })
    const cap = await startQuizCapturing(page)
    await page.close()
    return { ctx, cap }
  }

  test('GQ: progress Server Actions replayed on the victim session change nothing', async ({
    browser,
  }) => {
    const victim = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
    const { ctx, cap } = await attackerBrowser(browser)
    try {
      const own = await activeSessionOf(attackerUserId)
      const victimSessionId = await seedVictimSession()

      // Victim state: claimed, one answer, position 1, one pin.
      expect(
        (
          await victim.rpc('claim_quiz_session', {
            p_session_id: victimSessionId,
            p_device_id: VICTIM_DEVICE,
          })
        ).error,
      ).toBeNull()
      expect(
        (
          await victim.rpc('save_quiz_answer', {
            p_session_id: victimSessionId,
            p_question_id: q1,
            p_answer: { selected_option_id: 'a' },
            p_time_spent_ms: 1000,
            p_device_id: VICTIM_DEVICE,
          })
        ).error,
      ).toBeNull()
      expect(
        (
          await victim.rpc('save_quiz_position', {
            p_session_id: victimSessionId,
            p_current_index: 1,
            p_pinned_question_ids: [q2],
            p_device_id: VICTIM_DEVICE,
          })
        ).error,
      ).toBeNull()
      const sessionBefore = await readSession(victimSessionId)
      const progressBefore = await readProgress(victimSessionId)
      expect(sessionBefore.active_device_id).toBe(VICTIM_DEVICE)
      expect(progressBefore).toEqual([
        { question_id: q1, answer: { selected_option_id: 'a' }, time_spent_ms: 1000 },
      ])

      // CONTROL: the replayed actions land on the attacker's own session.
      const [oq1, oq2] = own.questionIds as [string, string]
      expect(
        await invoke(ctx, cap, 'claimQuizSession', {
          sessionId: own.id,
          deviceId: ATTACKER_DEVICE,
        }),
      ).toContain('"success":true')
      expect(
        await invoke(ctx, cap, 'saveQuizAnswer', {
          sessionId: own.id,
          questionId: oq2,
          deviceId: ATTACKER_DEVICE,
          answer: { selectedOptionId: 'c' },
          timeSpentMs: 4321,
        }),
      ).toContain('"success":true')
      expect(
        await invoke(ctx, cap, 'saveQuizPosition', {
          sessionId: own.id,
          deviceId: ATTACKER_DEVICE,
          currentIndex: 1,
          pinnedQuestionIds: [oq1],
        }),
      ).toContain('"success":true')
      const ownAfter = await readSession(own.id)
      expect(ownAfter.active_device_id).toBe(ATTACKER_DEVICE)
      expect(ownAfter.pinned_question_ids).toEqual([oq1])
      const ownRow = (await readProgress(own.id)).find((r) => r.question_id === oq2)
      expect(ownRow?.answer).toEqual({ selected_option_id: 'c' })
      expect(ownRow?.time_spent_ms).toBeGreaterThanOrEqual(4321)

      // GQ: the same actions against the victim session are refused, uniformly.
      const replays: Array<[ActionName, Record<string, unknown>]> = [
        ['claimQuizSession', { sessionId: victimSessionId, deviceId: ATTACKER_DEVICE }],
        [
          'saveQuizAnswer',
          {
            sessionId: victimSessionId,
            questionId: q1,
            deviceId: VICTIM_DEVICE,
            answer: { selectedOptionId: 'b' },
            timeSpentMs: 86_400_000,
          },
        ],
        [
          'saveQuizPosition',
          {
            sessionId: victimSessionId,
            deviceId: VICTIM_DEVICE,
            currentIndex: 0,
            pinnedQuestionIds: [],
            leaving: { questionId: q2, timeSpentMs: 5 },
          },
        ],
      ]
      for (const [name, arg] of replays) {
        const body = await invoke(ctx, cap, name, arg)
        expect(body, name).toContain(NOT_FOUND)
        expect(body, name).not.toContain('"success":true')
      }
      const check = await invoke(ctx, cap, 'checkAnswer', {
        sessionId: victimSessionId,
        questionId: q1,
        selectedOptionId: 'b',
        deviceId: VICTIM_DEVICE,
        timeSpentMs: 1,
      })
      expect(check).toContain('Session not found')
      expect(check).not.toContain('isCorrect')
      expect(check).not.toContain('correctOptionId')

      expect(await readSession(victimSessionId)).toEqual(sessionBefore)
      expect(await readProgress(victimSessionId)).toEqual(progressBefore)
    } finally {
      await ctx.close()
    }
  })

  test('GR: a taken-over tab omitting deviceId gets no grading from checkAnswer', async ({
    browser,
  }) => {
    const { ctx, cap } = await attackerBrowser(browser)
    try {
      const own = await activeSessionOf(attackerUserId)
      const [oq1] = own.questionIds as [string]
      expect(
        await invoke(ctx, cap, 'claimQuizSession', {
          sessionId: own.id,
          deviceId: ATTACKER_DEVICE,
        }),
      ).toContain('"success":true')
      const before = await readProgress(own.id)
      const beforeQ1 = before.find((r) => r.question_id === oq1)

      // GR: no deviceId while another device holds the session → refused, nothing graded or saved.
      const omitted = await invoke(ctx, cap, 'checkAnswer', {
        sessionId: own.id,
        questionId: oq1,
        selectedOptionId: 'd',
      })
      expect(omitted).toContain(TAKEN_OVER)
      expect(omitted).not.toContain('isCorrect')
      expect(omitted).not.toContain('correctOptionId')
      expect((await readProgress(own.id)).find((r) => r.question_id === oq1)).toEqual(beforeQ1)

      // CONTROL: the active device is graded and its answer saved.
      const active = await invoke(ctx, cap, 'checkAnswer', {
        sessionId: own.id,
        questionId: oq1,
        selectedOptionId: 'd',
        deviceId: ATTACKER_DEVICE,
        timeSpentMs: 777,
      })
      expect(active).toContain('isCorrect')
      expect((await readProgress(own.id)).find((r) => r.question_id === oq1)?.answer).toEqual({
        selected_option_id: 'd',
      })
    } finally {
      await ctx.close()
    }
  })

  test('GS: parallel claims leave exactly one device able to save', async () => {
    const victim = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
    const sessionId = await seedVictimSession()
    const devices = Array.from(
      { length: 8 },
      (_, i) => `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`,
    )
    const claims = await Promise.all(
      devices.map((d) =>
        victim.rpc('claim_quiz_session', { p_session_id: sessionId, p_device_id: d }),
      ),
    )
    for (const c of claims) expect(c.error).toBeNull()
    const winner = (await readSession(sessionId)).active_device_id
    expect(devices).toContain(winner)

    const saves = await Promise.all(
      devices.map((d, i) =>
        victim.rpc('save_quiz_answer', {
          p_session_id: sessionId,
          p_question_id: q1,
          p_answer: { selected_option_id: 'abcd'[i % 4] },
          p_time_spent_ms: 100 + i,
          p_device_id: d,
        }),
      ),
    )
    const ok = devices.filter((_, i) => saves[i]?.error === null)
    // CONTROL: the winning device saved.
    expect(ok).toEqual([winner])
    for (const [i, s] of saves.entries()) {
      if (devices[i] !== winner) expect(s.error?.message).toBe('session_taken_over')
    }
    const winnerIdx = devices.indexOf(winner as string)
    expect(await readProgress(sessionId)).toEqual([
      {
        question_id: q1,
        answer: { selected_option_id: 'abcd'[winnerIdx % 4] },
        time_spent_ms: 100 + winnerIdx,
      },
    ])
  })
})
