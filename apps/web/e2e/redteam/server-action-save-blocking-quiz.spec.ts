/**
 * Red Team Spec: saveBlockingQuizForLater Server Action (actions/save-blocking-quiz.ts) — Vectors IT, IU
 *
 * IT (rate-limit): at the saved-quiz cap, the action refuses before claiming — the quiz stays on
 *     the device that held it. CONTROL: one row under the cap, the same call parks the quiz.
 * IU (idor): the attacker invokes the action with the victim's open sessionId → refused, the
 *     victim's row is unchanged. CONTROL: the same call on the attacker's own quiz parks it.
 *
 * Status: Expected to PASS.
 */

import { type Browser, type BrowserContext, expect, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { getAdminClient } from '../helpers/supabase'
import { clearOpenSessions } from './helpers/clear-open-sessions'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_SB_MARKER } from './helpers/seed-markers'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed-users'
import { postServerAction, signInViaForm, watchServerActions } from './server-action-capture'

const BASE_URL = 'http://localhost:3000'
const SAVED_CAP = 20
const SAVED_QUIZ_LIMIT = 'You can keep up to 20 saved quizzes.'
const DEVICE_A = '00000000-0000-4000-8000-0000000000e1'
const DEVICE_B = '00000000-0000-4000-8000-0000000000e2'
const DEVICE_V = '00000000-0000-4000-8000-0000000000e3'

type Captured = { headers: Record<string, string>; id: string }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

test.describe('Red Team: saveBlockingQuizForLater Server Action (IT, IU)', () => {
  test.setTimeout(120_000)

  let admin: ReturnType<typeof getAdminClient>
  let orgId: string
  let attackerId: string
  let victimId: string
  let questionIds: string[]
  let ctx: BrowserContext
  let cap: Captured

  const insertOpen = async (studentId: string, deviceId: string | null) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode: 'quick_quiz',
        total_questions: questionIds.length,
        config: { question_ids: questionIds, e2e_marker: E2E_REDTEAM_SB_MARKER },
        active_device_id: deviceId,
      })
      .select('id')
      .single()
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`insertOpen: ${error?.message ?? 'bad shape'}`)
    return data.id
  }

  const savedCount = async (): Promise<number> => {
    const { count, error } = await admin
      .from('quiz_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', attackerId)
      .not('saved_at', 'is', null)
    if (error) throw new Error(`savedCount: ${error.message}`)
    return count ?? 0
  }

  const fillSavedTo = async (target: number): Promise<void> => {
    const missing = target - (await savedCount())
    if (missing < 0) throw new Error(`fillSavedTo: ${target - missing} saved rows already`)
    if (missing === 0) return
    const now = new Date().toISOString()
    const rows = Array.from({ length: missing }, () => ({
      organization_id: orgId,
      student_id: attackerId,
      mode: 'quick_quiz',
      total_questions: questionIds.length,
      config: { question_ids: questionIds, e2e_marker: E2E_REDTEAM_SB_MARKER },
      deleted_at: now,
      saved_at: now,
    }))
    const { error } = await admin.from('quiz_sessions').insert(rows)
    if (error) throw new Error(`fillSavedTo: ${error.message}`)
  }

  const unsaveOne = async (): Promise<void> => {
    const { data: pick, error: pickErr } = await admin
      .from('quiz_sessions')
      .select('id')
      .eq('config->>e2e_marker', E2E_REDTEAM_SB_MARKER)
      .eq('student_id', attackerId)
      .not('saved_at', 'is', null)
      .limit(1)
      .single()
    if (pickErr || !pick) throw new Error(`unsaveOne pick: ${pickErr?.message}`)
    const { data, error } = await admin
      .from('quiz_sessions')
      .update({ saved_at: null })
      .eq('id', pick.id)
      .select('id')
    if (error || data?.length !== 1) throw new Error(`unsaveOne: ${error?.message ?? 'no row'}`)
  }

  const readRow = async (sessionId: string) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('deleted_at, saved_at, ended_at, active_device_id')
      .eq('id', sessionId)
      .single()
    if (error || !data) throw new Error(`readRow: ${error?.message}`)
    return data
  }

  const invoke = (arg: Record<string, unknown>) =>
    postServerAction(ctx.request, {
      url: `${BASE_URL}/app/quiz`,
      headers: cap.headers,
      id: cap.id,
      origin: BASE_URL,
      arg,
    })

  /** Opens the attacker's own session (an action POST fires), then the quiz page for the id. */
  const captureAction = async (browser: Browser) => {
    await clearOpenSessions(admin, attackerId, 'save-blocking')
    const sessionId = await insertOpen(attackerId, null)
    const client = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    const claim = await client.rpc('claim_quiz_session', {
      p_session_id: sessionId,
      p_device_id: DEVICE_A,
    })
    expect(claim.error).toBeNull()
    ctx = await browser.newContext({ storageState: undefined })
    await ctx.addCookies([
      { name: CONSENT_COOKIE, value: buildConsentCookieValue(attackerId), url: BASE_URL },
    ])
    const page = await ctx.newPage()
    await signInViaForm(page, { email: ATTACKER_EMAIL, password: ATTACKER_PASSWORD })
    const watch = watchServerActions(page)
    await page.goto(`/app/quiz/session/${sessionId}`)
    await expect(page.getByText(/Question 1 of 2/)).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => watch.headers() !== undefined, { timeout: 10_000 }).toBe(true)
    await page.goto('/app/quiz')
    await expect(page.getByRole('heading', { name: 'Quiz' })).toBeVisible({ timeout: 15_000 })
    const ids = await watch.settle()
    await page.close()
    const id = ids.get('saveBlockingQuizForLater')
    const headers = watch.headers()
    if (!headers || !id) throw new Error('saveBlockingQuizForLater action not captured')
    cap = { headers, id }
  }

  test.beforeAll(async ({ browser }) => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    attackerId = seed.attackerUserId
    victimId = seed.victimUserId
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
    if (!Array.isArray(data) || data.length < 2) throw new Error('need 2 active MC questions')
    questionIds = data.map((q) => q.id as string)
    await captureAction(browser)
  })

  test.afterAll(async () => {
    await ctx?.close()
  })

  test.beforeEach(async () => {
    await clearOpenSessions(admin, attackerId, 'save-blocking')
    await clearOpenSessions(admin, victimId, 'save-blocking')
  })

  test.afterEach(async () => {
    const errors: string[] = []
    try {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ saved_at: null })
        .eq('config->>e2e_marker', E2E_REDTEAM_SB_MARKER)
        .not('saved_at', 'is', null)
        .select('id')
      if (error) throw new Error(`unsave: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.info(`[save-blocking] unsaved ${data?.length}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('config->>e2e_marker', E2E_REDTEAM_SB_MARKER)
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`soft-delete: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.info(`[save-blocking] soft-deleted ${data?.length}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  test('IT: at the saved-quiz cap the action refuses before claiming the quiz', async () => {
    await fillSavedTo(SAVED_CAP)
    expect(await savedCount()).toBe(SAVED_CAP)
    const sessionId = await insertOpen(attackerId, DEVICE_B)
    expect((await readRow(sessionId)).active_device_id).toBe(DEVICE_B)

    const res = await invoke({ sessionId, deviceId: DEVICE_A })
    expect(res).not.toContain('"success":true')
    expect(res).toContain(SAVED_QUIZ_LIMIT)
    expect(await readRow(sessionId)).toEqual({
      deleted_at: null,
      saved_at: null,
      ended_at: null,
      active_device_id: DEVICE_B,
    })
    expect(await savedCount()).toBe(SAVED_CAP)

    // CONTROL: one under the cap, the same call claims and parks the quiz.
    await unsaveOne()
    expect(await savedCount()).toBe(SAVED_CAP - 1)
    const ok = await invoke({ sessionId, deviceId: DEVICE_A })
    expect(ok).toContain('"success":true')
    const parked = await readRow(sessionId)
    expect(parked.saved_at).not.toBeNull()
    expect(parked.deleted_at).not.toBeNull()
    expect(parked.active_device_id).toBeNull()
    expect(await savedCount()).toBe(SAVED_CAP)
  })

  test("IU: the action on the victim's session is refused and leaves it untouched", async () => {
    expect(await savedCount()).toBeLessThan(SAVED_CAP)
    const victimSession = await insertOpen(victimId, DEVICE_V)
    const before = await readRow(victimSession)
    expect(before).toEqual({
      deleted_at: null,
      saved_at: null,
      ended_at: null,
      active_device_id: DEVICE_V,
    })

    const res = await invoke({ sessionId: victimSession, deviceId: DEVICE_A })
    expect(res).not.toContain('"success":true')
    expect(await readRow(victimSession)).toEqual(before)

    // CONTROL: the same call on the attacker's own open quiz parks it.
    const own = await insertOpen(attackerId, DEVICE_B)
    const ok = await invoke({ sessionId: own, deviceId: DEVICE_A })
    expect(ok).toContain('"success":true')
    const parked = await readRow(own)
    expect(parked.saved_at).not.toBeNull()
    expect(parked.active_device_id).toBeNull()
    expect(await readRow(victimSession)).toEqual(before)
  })
})
