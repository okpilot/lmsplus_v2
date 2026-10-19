/**
 * Red Team Spec: toggleFlag Server Action during an active internal_exam (actions/flag.ts) — Vector IS
 *
 * toggleFlag reads the exam gate and the existing flag concurrently (#1550). With the attacker's
 * own internal_exam active, a replayed toggleFlag must write nothing in either direction:
 *   - question NOT flagged → no flag row becomes active;
 *   - question flagged     → the flag stays active.
 * CONTROL: once the exam is gone, the same replay unflags, then flags, the same question.
 *
 * flagged_questions has no text column for a marker: the spec snapshots the attacker's
 * (student_id, question_id) row before each test and restores it after.
 *
 * Status: Expected to PASS.
 */

import { type Browser, type BrowserContext, expect, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_IS_MARKER } from './helpers/seed-markers'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed-users'
import { postServerAction, signInViaForm, watchServerActions } from './server-action-capture'

const BASE_URL = 'http://localhost:3000'
const SESSION_PATH = '/app/quiz/session'
const ATTACKER_DEVICE = '00000000-0000-4000-8000-0000000000e5'

type Captured = { headers: Record<string, string>; id: string }
type FlagSnapshot = { deleted_at: string | null; flagged_at: string } | null

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

test.describe('Red Team: toggleFlag during an active internal_exam (IS)', () => {
  test.setTimeout(120_000)

  let admin: ReturnType<typeof getAdminClient>
  let orgId: string
  let attackerUserId: string
  let q1: string
  let q2: string
  let ctx: BrowserContext
  let cap: Captured
  let snapshot: FlagSnapshot | undefined

  const seedSession = async (mode: string) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: attackerUserId,
        mode,
        total_questions: 2,
        time_limit_seconds: 3600,
        config: { question_ids: [q1, q2], e2e_marker: E2E_REDTEAM_IS_MARKER },
      })
      .select('id')
      .single()
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`seedSession(${mode}): ${error?.message ?? 'bad shape'}`)
    return data.id
  }

  const readFlag = async (): Promise<FlagSnapshot> => {
    const { data, error } = await admin
      .from('flagged_questions')
      .select('deleted_at, flagged_at')
      .eq('student_id', attackerUserId)
      .eq('question_id', q1)
      .maybeSingle()
    if (error) throw new Error(`readFlag: ${error.message}`)
    return data
  }

  const isActiveFlag = async () => {
    const row = await readFlag()
    return row !== null && row.deleted_at === null
  }

  const setFlag = async (active: boolean) => {
    const { error } = await admin.from('flagged_questions').upsert(
      {
        student_id: attackerUserId,
        question_id: q1,
        deleted_at: active ? null : new Date().toISOString(),
      },
      { onConflict: 'student_id,question_id' },
    )
    if (error) throw new Error(`setFlag(${active}): ${error.message}`)
  }

  const invoke = (arg: Record<string, unknown>) =>
    postServerAction(ctx.request, {
      url: `${BASE_URL}${SESSION_PATH}`,
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
      .order('id', { ascending: false })
      .limit(2)
    if (error) throw new Error(`beforeAll questions: ${error.message}`)
    const [a, b] = (data ?? []).map((r) => r.id)
    if (typeof a !== 'string' || !a || typeof b !== 'string' || !b)
      throw new Error('need 2 active MC questions with string ids')
    return [a, b]
  }

  /** Opens the attacker's own session page and reads the toggleFlag action id off it. */
  const captureToggleFlag = async (browser: Browser) => {
    await cleanupStudentActiveSessions(ATTACKER_EMAIL)
    const sessionId = await seedSession('mock_exam')
    const client = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    const claim = await client.rpc('claim_quiz_session', {
      p_session_id: sessionId,
      p_device_id: ATTACKER_DEVICE,
    })
    expect(claim.error).toBeNull()
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
    const id = ids.get('toggleFlag')
    const headers = watch.headers()
    if (!headers || !id) throw new Error('toggleFlag action not captured')
    cap = { headers, id }
  }

  test.beforeAll(async ({ browser }) => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    attackerUserId = seed.attackerUserId
    ;[q1, q2] = await loadQuestionIds()
    await captureToggleFlag(browser)
    await cleanupStudentActiveSessions(ATTACKER_EMAIL)
  })

  const softDeleteMarkerSessions = async () => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('config->>e2e_marker', E2E_REDTEAM_IS_MARKER)
      .is('deleted_at', null)
      .select('id')
    if (error) throw new Error(`soft-delete marker sessions: ${error.message}`)
    if ((data?.length ?? 0) > 0) console.info(`[toggle-flag-exam] soft-deleted ${data?.length}`)
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

  test.beforeEach(async () => {
    snapshot = await readFlag()
  })

  test.afterEach(async () => {
    const errors: string[] = []
    try {
      await softDeleteMarkerSessions()
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      // undefined: beforeEach never read the row, so there is nothing to restore.
      if (snapshot !== undefined) await restoreFlag(snapshot)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      snapshot = undefined
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  /** No prior row: soft-delete any row the test created (never hard-delete, never insert). */
  const restoreFlag = async (prior: FlagSnapshot) => {
    if (prior === null) {
      const { data, error } = await admin
        .from('flagged_questions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('student_id', attackerUserId)
        .eq('question_id', q1)
        .is('deleted_at', null)
        .select('question_id')
      if (error) throw new Error(`restore flag: ${error.message}`)
      if ((data?.length ?? 0) > 0)
        console.info(`[toggle-flag-exam] restore soft-deleted ${data?.length}`)
      return
    }
    const { error } = await admin.from('flagged_questions').upsert(
      {
        student_id: attackerUserId,
        question_id: q1,
        deleted_at: prior.deleted_at,
        ...(prior.flagged_at ? { flagged_at: prior.flagged_at } : {}),
      },
      { onConflict: 'student_id,question_id' },
    )
    if (error) throw new Error(`restore flag: ${error.message}`)
  }

  test('IS: an active internal_exam blocks toggleFlag in both directions', async () => {
    const examId = await seedSession('internal_exam')
    const { data: exam, error: examErr } = await admin
      .from('quiz_sessions')
      .select('mode, ended_at, deleted_at')
      .eq('id', examId)
      .single()
    expect(examErr).toBeNull()
    expect(exam).toMatchObject({ mode: 'internal_exam', ended_at: null, deleted_at: null })

    await setFlag(false)
    expect(await isActiveFlag()).toBe(false)
    const flagRes = await invoke({ questionId: q1 })
    expect(flagRes).not.toContain('"success":true')
    expect(flagRes).toContain('cannot_flag_internal_exam')
    expect(await isActiveFlag()).toBe(false)

    await setFlag(true)
    expect(await isActiveFlag()).toBe(true)
    const unflagRes = await invoke({ questionId: q1 })
    expect(unflagRes).not.toContain('"success":true')
    expect(unflagRes).toContain('cannot_flag_internal_exam')
    expect(await isActiveFlag()).toBe(true)

    // CONTROL: with the exam gone the same replay unflags, then flags.
    await cleanupStudentActiveSessions(ATTACKER_EMAIL)
    const unflagged = await invoke({ questionId: q1 })
    expect(unflagged).toContain('"success":true')
    expect(unflagged).toContain('"flagged":false')
    expect(await isActiveFlag()).toBe(false)
    const flagged = await invoke({ questionId: q1 })
    expect(flagged).toContain('"success":true')
    expect(flagged).toContain('"flagged":true')
    expect(await isActiveFlag()).toBe(true)
  })
})
