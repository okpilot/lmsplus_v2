/**
 * Red Team Spec: loadVfrRtExamQuestions Server Action (lib/queries/load-vfr-rt-exam-questions.ts).
 *
 * Vectors (attack-surface.md):
 *  - GC  The Server Action payload the VFR RT exam runner receives mid-exam carries no
 *        answer key: no correct_option_id, no dialog_fill canonical/synonym, no diagram
 *        zone -> label map, no explanation. CONTROL: the payload does carry the session's
 *        question text.
 *  - GB  A second student replays the captured Server Action with the victim's sessionId
 *        and receives no question of it. CONTROL: the same replay with the attacker's own
 *        sessionId returns question text, so the replay reaches the action.
 */

import { type BrowserContext, expect, type Page, type Request, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed-users'
import { VFR_RT_POOL_MARKER } from './helpers/seed-vfr-rt-part3'
import {
  cleanupVfrRtPool,
  seedVfrRtPool,
  VFR_RT_DF_ANSWER,
  VFR_RT_SA_ANSWER,
  type VfrRtPool,
} from './helpers/seed-vfr-rt-pool'
import { postServerAction, signInViaForm } from './server-action-capture'

const BASE_URL = 'http://localhost:3000'
const SESSION_PATH = '/app/quiz/session'

/** Substrings that exist only in answer-key or explanation columns of the seeded pool. */
const KEY_MATERIAL = [
  'correct_option_id',
  VFR_RT_DF_ANSWER,
  'S5-XYZ',
  `${VFR_RT_SA_ANSWER}2`,
  '"zone_id"',
  '"canonical',
  'accepted_synonyms',
  'blanks_config',
  ' explanation ',
]

type CapturedAction = { headers: Record<string, string>; body: string }

async function signIn(
  context: BrowserContext,
  creds: { email: string; password: string; userId: string },
) {
  const page = await context.newPage()
  await signInViaForm(page, creds)
  await context.addCookies([
    { name: CONSENT_COOKIE, value: buildConsentCookieValue(creds.userId), url: BASE_URL },
  ])
  return page
}

function isLoadAction(request: Request): boolean {
  return (
    request.method() === 'POST' &&
    request.headers()['next-action'] !== undefined &&
    (request.postData() ?? '').includes('"sessionId"')
  )
}

/** Starts the exam through the UI and returns the load action's request and response body. */
async function startExamCapturingLoad(page: Page): Promise<CapturedAction & { response: string }> {
  let captured: (CapturedAction & { response: string }) | undefined
  await page.route('**/*', async (route) => {
    const request = route.request()
    if (captured || !isLoadAction(request)) return route.fallback()
    const response = await route.fetch()
    const text = await response.text()
    captured = { headers: request.headers(), body: request.postData() ?? '', response: text }
    await route.fulfill({ response, body: text })
  })
  await page.goto('/app/vfr-rt')
  const examMode = page.getByRole('button', { name: 'Practice Exam', exact: true })
  await expect(examMode).toBeEnabled({ timeout: 15_000 })
  await examMode.click()
  await page.getByRole('button', { name: 'Start VFR RT Mock Exam' }).click()
  await page.waitForURL(/\/app\/quiz\/session/, { timeout: 20_000 })
  await expect.poll(() => captured, { timeout: 20_000 }).toBeDefined()
  await page.unroute('**/*')
  return captured as CapturedAction & { response: string }
}

/** Replays the captured Server Action as `context`'s user with a chosen sessionId. */
async function replay(context: BrowserContext, action: CapturedAction, sessionId: string) {
  return postServerAction(context.request, {
    url: `${BASE_URL}${SESSION_PATH}`,
    headers: action.headers,
    id: action.headers['next-action'] ?? '',
    origin: BASE_URL,
    arg: { sessionId },
  })
}

test.describe('Red Team: loadVfrRtExamQuestions Server Action (GB, GC)', () => {
  test.setTimeout(120_000)

  let admin: ReturnType<typeof getAdminClient>
  let pool: VfrRtPool
  let orgId: string
  let victimUserId: string
  let attackerUserId: string
  const createdSessionIds = new Set<string>()

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    victimUserId = seed.victimUserId
    attackerUserId = seed.attackerUserId
    pool = await seedVfrRtPool({ admin, orgId, adminUserId: victimUserId })
  })

  test.afterAll(async () => {
    await cleanupVfrRtPool({ admin, orgId, pool })
  })

  test.afterEach(async () => {
    const errors: string[] = []
    try {
      if (createdSessionIds.size > 0) {
        const { data, error } = await admin
          .from('quiz_sessions')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', Array.from(createdSessionIds))
          .is('deleted_at', null)
          .select('id')
        if (error) throw new Error(`afterEach soft-delete: ${error.message}`)
        if ((data?.length ?? 0) > 0) {
          console.log(`[vfr-rt-load-action] soft-deleted ${data?.length} session(s)`)
        }
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      createdSessionIds.clear()
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

  const activeExamId = async (studentId: string): Promise<string> => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('id')
      .eq('student_id', studentId)
      .eq('mode', 'vfr_rt_exam')
      .is('ended_at', null)
      .is('deleted_at', null)
      .single()
    expect(error).toBeNull()
    if (typeof data?.id !== 'string') throw new Error('activeExamId: session id is not a string')
    const id = data.id
    createdSessionIds.add(id)
    return id
  }

  test('GC + GB: mid-exam payload carries no key, and a foreign sessionId returns nothing', async ({
    browser,
  }) => {
    await cleanupStudentActiveSessions(VICTIM_EMAIL)
    await cleanupStudentActiveSessions(ATTACKER_EMAIL)

    const victimCtx = await browser.newContext({ storageState: undefined })
    const attackerCtx = await browser.newContext({ storageState: undefined })
    try {
      const victimPage = await signIn(victimCtx, {
        email: VICTIM_EMAIL,
        password: VICTIM_PASSWORD,
        userId: victimUserId,
      })
      const action = await startExamCapturingLoad(victimPage)
      const victimSessionId = await activeExamId(victimUserId)
      expect(action.body).toContain(victimSessionId)

      // GC control: the action really served this exam's questions.
      expect(action.response).toContain(VFR_RT_POOL_MARKER)
      // GC: none of the answer-key / explanation material reaches the client.
      for (const token of KEY_MATERIAL) expect(action.response).not.toContain(token)
      expect(action.response).not.toMatch(/"explanation_text":"/)

      // Attacker holds an own active exam in the same org (the control arm's target).
      const attackerApi = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
      const { data: started, error: startErr } = await attackerApi.rpc(
        'start_vfr_rt_exam_session',
        { p_subject_id: pool.subjectId },
      )
      expect(startErr).toBeNull()
      const attackerSessionId = (started as { session_id: string }).session_id
      createdSessionIds.add(attackerSessionId)
      await signIn(attackerCtx, {
        email: ATTACKER_EMAIL,
        password: ATTACKER_PASSWORD,
        userId: attackerUserId,
      })

      // GB control: the replayed action reaches the RPC for the attacker's own session.
      const own = await replay(attackerCtx, action, attackerSessionId)
      expect(own).toContain(VFR_RT_POOL_MARKER)

      // GB: the victim's sessionId yields an error and no question.
      const foreign = await replay(attackerCtx, action, victimSessionId)
      expect(foreign).not.toContain(VFR_RT_POOL_MARKER)
      expect(foreign).toContain('Failed to load questions')
    } finally {
      await victimCtx.close()
      await attackerCtx.close()
    }
  })
})
