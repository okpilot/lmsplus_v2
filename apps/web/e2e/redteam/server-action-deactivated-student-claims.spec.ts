/**
 * Red Team Spec — Vector IB (#1412 PR B): deactivated student replays a Server Action with a
 * still-unexpired access token.
 *
 * Server Actions identify the caller with getClaims() via verifySessionUser(), which checks the
 * JWT signature + expiry locally and never asks Auth whether the user is banned. A student
 * deactivated the way toggle-student-status does it (Auth ban + users.deleted_at) therefore
 * reaches the action body for the rest of the token lifetime. The guard that must hold is the
 * RPC's active-user gate: finishQuizSession → finish_quiz_session raises
 * user_not_found_or_inactive, the session stays open and ungraded.
 *
 * The action body running (a `"success":false` RSC payload without the SIGN_IN message, not a proxy
 * redirect) pins that the banned token passes verifySessionUser; the unchanged session pins the RPC gate.
 * CONTROL: the same cookies, after the student is restored, finish and grade the session.
 *
 * Status: Expected to PASS.
 */

import { type BrowserContext, expect, test } from '@playwright/test'
import { SIGN_IN } from '../../app/app/quiz/actions/progress-error-messages'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_QF_MARKER } from './helpers/seed-markers'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed-users'
import { postServerAction, signInViaForm, watchServerActions } from './server-action-capture'

const BASE_URL = 'http://localhost:3000'
const SESSION_PATH = '/app/quiz/session'
const DEVICE = '00000000-0000-4000-8000-0000000000b1'
const BAN = '876000h'

type Captured = { headers: Record<string, string>; id: string }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

test.describe('Red Team: deactivated student Server Action replay (IB)', () => {
  test.setTimeout(120_000)

  let admin: ReturnType<typeof getAdminClient>
  let orgId: string
  let studentId: string
  let q1: string
  let q2: string
  let q1Key: string
  let ctx: BrowserContext
  let cap: Captured
  let deactivated = false

  const claimedSession = async () => {
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
    const id = data.id
    const client = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    const claim = await client.rpc('claim_quiz_session', { p_session_id: id, p_device_id: DEVICE })
    expect(claim.error).toBeNull()
    const save = await client.rpc('save_quiz_answer', {
      p_session_id: id,
      p_question_id: q1,
      p_answer: { selected_option_id: q1Key },
      p_time_spent_ms: 1000,
      p_device_id: DEVICE,
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

  const setDeactivated = async (on: boolean) => {
    const { error: banErr } = await admin.auth.admin.updateUserById(studentId, {
      ban_duration: on ? BAN : 'none',
    })
    if (banErr) throw new Error(`ban(${on}): ${banErr.message}`)
    const { data, error } = await admin
      .from('users')
      .update({ deleted_at: on ? new Date().toISOString() : null })
      .eq('id', studentId)
      .select('id')
    if (error) throw new Error(`users.deleted_at(${on}): ${error.message}`)
    if ((data?.length ?? 0) === 0) throw new Error(`users.deleted_at(${on}): 0 rows`)
    deactivated = on
  }

  const invoke = (sessionId: string) =>
    postServerAction(ctx.request, {
      url: `${BASE_URL}${SESSION_PATH}`,
      headers: cap.headers,
      id: cap.id,
      origin: BASE_URL,
      arg: { sessionId, deviceId: DEVICE },
    })

  test.beforeAll(async ({ browser }) => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    studentId = seed.attackerUserId
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

    await cleanupStudentActiveSessions(ATTACKER_EMAIL)
    const sessionId = await claimedSession()
    ctx = await browser.newContext({ storageState: undefined })
    await ctx.addCookies([
      { name: CONSENT_COOKIE, value: buildConsentCookieValue(studentId), url: BASE_URL },
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
    await cleanupStudentActiveSessions(ATTACKER_EMAIL)
  })

  test.afterEach(async () => {
    const errors: string[] = []
    try {
      if (deactivated) await setDeactivated(false)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      deactivated = false
    }
    try {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('config->>e2e_marker', E2E_REDTEAM_QF_MARKER)
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`soft-delete marker rows: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.info(`[deactivated-action] soft-deleted ${data?.length}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      await cleanupStudentActiveSessions(ATTACKER_EMAIL)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  test('IB: a banned, soft-deleted student cannot finish a session through the action', async () => {
    await cleanupStudentActiveSessions(ATTACKER_EMAIL)
    const sessionId = await claimedSession()
    expect((await readSession(sessionId)).ended_at).toBeNull()

    await setDeactivated(true)
    const refused = await invoke(sessionId)
    expect(refused).toContain('"success":false')
    expect(refused).not.toContain(SIGN_IN)
    expect(refused).not.toContain('"success":true')
    const held = await readSession(sessionId)
    expect(held.ended_at).toBeNull()
    expect(held.correct_count).toBe(0)

    // CONTROL: same cookies, student restored → the session is finished and graded.
    await setDeactivated(false)
    const own = await invoke(sessionId)
    expect(own).toContain('"success":true')
    const after = await readSession(sessionId)
    expect(after.ended_at).not.toBeNull()
    expect(after.correct_count).toBe(1)
  })
})
