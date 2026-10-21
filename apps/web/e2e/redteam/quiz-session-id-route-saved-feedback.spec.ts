/**
 * Red Team Spec: `/app/quiz/session/<id>` restored feedback on a SAVED session (#1549 PR2) — Vector JN
 *
 * JN (soft-delete-bypass): a saved (soft-deleted) quick_quiz loaded by id by its owner carries
 *     no answer key in the server payload; `get_restored_feedback` refuses the saved row.
 *     CONTROL: the same session while open carries the key in the server payload.
 *
 * Status: Expected to PASS.
 */

import { type Browser, type BrowserContext, expect, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_QR_MARKER } from './helpers/seed-markers'
import { seedRedTeamUsers, VICTIM_EMAIL, VICTIM_PASSWORD } from './helpers/seed-users'

const BASE_URL = 'http://localhost:3000'
const DEVICE = '00000000-0000-4000-8000-0000000000d1'
const KEY_TOKENS = ['isCorrect', 'correctOptionId', 'correct_option_id']

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

test.describe('Red Team: saved session restored feedback (JN)', () => {
  test.setTimeout(120_000)

  let admin: ReturnType<typeof getAdminClient>
  let orgId: string
  let victimUserId: string
  let subjectId: string
  let q1: string
  let q2: string

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    victimUserId = seed.victimUserId
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
  })

  test.afterEach(async () => {
    const errors: string[] = []
    try {
      // A saved row counts toward the 20-row saved cap: un-save it (stays soft-deleted).
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ saved_at: null, deleted_at: new Date().toISOString() })
        .eq('config->>e2e_marker', E2E_REDTEAM_QR_MARKER)
        .eq('student_id', victimUserId)
        .not('saved_at', 'is', null)
        .select('id')
      if (error) throw new Error(`unsave marker rows: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.info(`[qs-saved-feedback] unsaved ${data?.length}`)
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
      if ((data?.length ?? 0) > 0) console.info(`[qs-saved-feedback] soft-deleted ${data?.length}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      await cleanupStudentActiveSessions(VICTIM_EMAIL)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  test('JN: a saved quick_quiz loaded by id carries no answer key', async ({ browser }) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: victimUserId,
        mode: 'quick_quiz',
        subject_id: subjectId,
        total_questions: 2,
        config: { question_ids: [q1, q2], e2e_marker: E2E_REDTEAM_QR_MARKER },
      })
      .select('id')
      .single()
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`seed: ${error?.message ?? 'bad shape'}`)
    const sessionId = data.id

    const victim = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
    const save = await victim.rpc('save_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: q1,
      p_answer: { selected_option_id: 'b' },
      p_time_spent_ms: 1000,
      p_device_id: DEVICE,
    })
    expect(save.error).toBeNull()

    const ctx = await signedInContext(browser, {
      id: victimUserId,
      email: VICTIM_EMAIL,
      password: VICTIM_PASSWORD,
    })
    try {
      const url = `${BASE_URL}/app/quiz/session/${sessionId}`

      // CONTROL: open practice session — the server payload carries the restored key.
      const open = await ctx.request.get(url, { maxRedirects: 0 })
      expect(open.status()).toBe(200)
      const openBody = await open.text()
      expect(openBody).toMatch(/selectedOptionId\\?":\\?"b/)
      expect(openBody).toContain('correctOptionId')
      const openRpc = await victim.rpc('get_restored_feedback', { p_session_id: sessionId })
      expect(openRpc.error).toBeNull()
      const { data: keyRow, error: keyErr } = await admin
        .from('questions')
        .select('correct_option_id')
        .eq('id', q1)
        .single()
      if (keyErr || !isRecord(keyRow) || typeof keyRow.correct_option_id !== 'string')
        throw new Error(`q1 key: ${keyErr?.message ?? 'bad shape'}`)
      const key = keyRow.correct_option_id
      const feedback = isRecord(openRpc.data) ? openRpc.data.feedback : null
      if (!Array.isArray(feedback)) throw new Error('get_restored_feedback: no feedback array')
      expect(feedback).toHaveLength(1)
      expect(feedback[0]).toMatchObject({
        question_id: q1,
        question_type: 'multiple_choice',
        correct_option_id: key,
        is_correct: key === 'b',
      })

      const saved = await victim.rpc('save_quiz_for_later', {
        p_session_id: sessionId,
        p_device_id: DEVICE,
      })
      expect(saved.error).toBeNull()
      const { data: row, error: rowErr } = await admin
        .from('quiz_sessions')
        .select('saved_at, deleted_at')
        .eq('id', sessionId)
        .single()
      expect(rowErr).toBeNull()
      expect(row?.saved_at).not.toBeNull()

      // JN: the saved row's payload carries none of the key.
      const res = await ctx.request.get(url, { maxRedirects: 0 })
      expect(res.status()).toBe(200)
      const body = await res.text()
      // The saved entry renders for its owner (no redirect); it carries no question payload.
      expect(body).toContain(sessionId)
      for (const t of KEY_TOKENS) expect(body, t).not.toContain(t)

      const rpc = await victim.rpc('get_restored_feedback', { p_session_id: sessionId })
      expect(rpc.data).toBeNull()
      expect(rpc.error?.message).toBe('session_not_found')
    } finally {
      await ctx.close()
    }
  })
})
