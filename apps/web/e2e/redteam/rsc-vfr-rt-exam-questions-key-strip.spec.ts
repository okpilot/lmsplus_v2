/**
 * Red Team Spec: VFR RT exam questions delivered as RSC props of /app/quiz/session/<id>.
 *
 * Vectors (attack-surface.md):
 *  - GC  The server-rendered session page (document + RSC flight payload) carries no answer
 *        key mid-exam: no correct_option_id, no dialog_fill canonical/synonym, no diagram
 *        zone -> label map, no explanation. CONTROL: the payload does carry the session's
 *        question text and the serialized question props.
 *  - IN  A second student requesting the victim's exam session page (document + RSC flight)
 *        receives none of its questions. CONTROL: the victim's own request carries them.
 */

import { type BrowserContext, expect, type Page, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
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
import { signInViaForm } from './server-action-capture'

const BASE_URL = 'http://localhost:3000'

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

/** Starts the exam through the UI. */
async function startExam(page: Page) {
  await page.goto('/app/vfr-rt')
  const examMode = page.getByRole('button', { name: 'Practice Exam', exact: true })
  await expect(examMode).toBeEnabled({ timeout: 15_000 })
  await examMode.click()
  await page.getByRole('button', { name: 'Start VFR RT Mock Exam' }).click()
  await page.waitForURL(/\/app\/quiz\/session/, { timeout: 20_000 })
}

/** Flight data inside HTML is escaped inside self.__next_f.push strings. */
function normalise(body: string): string {
  return body.replaceAll('\\"', '"').replaceAll('\\\\', '\\')
}

test.describe('Red Team: VFR RT exam session page RSC payload (GC)', () => {
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
          console.log(`[vfr-rt-rsc] soft-deleted ${data?.length} session(s)`)
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

  test('GC: mid-exam session page document and flight payload carry no answer key', async ({
    browser,
  }) => {
    await cleanupStudentActiveSessions(VICTIM_EMAIL)
    const victimCtx = await browser.newContext({ storageState: undefined })
    try {
      const victimPage = await signIn(victimCtx, {
        email: VICTIM_EMAIL,
        password: VICTIM_PASSWORD,
        userId: victimUserId,
      })
      await startExam(victimPage)
      const sessionId = await activeExamId(victimUserId)
      const url = `/app/quiz/session/${sessionId}`

      const doc = await victimCtx.request.get(url)
      expect(doc.ok()).toBe(true)
      const flight = await victimCtx.request.get(url, { headers: { RSC: '1' } })
      expect(flight.ok()).toBe(true)

      const bodies = {
        document: normalise(await doc.text()),
        flight: normalise(await flight.text()),
      }
      for (const [name, body] of Object.entries(bodies)) {
        // Controls: the page really serialised this exam's questions.
        expect(body, `${name} control: pool marker`).toContain(VFR_RT_POOL_MARKER)
        expect(body, `${name} control: question props`).toContain('"question_type":"')
        for (const token of KEY_MATERIAL)
          expect(body, `${name} leaks ${token}`).not.toContain(token)
        expect(body, `${name} explanation`).not.toMatch(/"explanation_text":"/)
      }
    } finally {
      await victimCtx.close()
    }
  })

  test('IN: a foreign student gets none of the victim exam questions from the session page', async ({
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
      await startExam(victimPage)
      const sessionId = await activeExamId(victimUserId)
      const url = `/app/quiz/session/${sessionId}`

      // Control: the owner's flight payload carries the exam's questions.
      const own = await victimCtx.request.get(url, { headers: { RSC: '1' } })
      expect(own.ok()).toBe(true)
      expect(normalise(await own.text()), 'control: owner payload').toContain(VFR_RT_POOL_MARKER)

      await signIn(attackerCtx, {
        email: ATTACKER_EMAIL,
        password: ATTACKER_PASSWORD,
        userId: attackerUserId,
      })
      const doc = await attackerCtx.request.get(url)
      const flight = await attackerCtx.request.get(url, { headers: { RSC: '1' } })
      const bodies = {
        document: normalise(await doc.text()),
        flight: normalise(await flight.text()),
      }
      for (const [name, body] of Object.entries(bodies)) {
        expect(body.length, `${name} non-empty`).toBeGreaterThan(0)
        expect(body, `${name} leaks victim question`).not.toContain(VFR_RT_POOL_MARKER)
        expect(body, `${name} leaks question props`).not.toContain('"question_type":"')
      }

      // The victim's session is untouched by the foreign read.
      const { data, error } = await admin
        .from('quiz_sessions')
        .select('student_id, ended_at, deleted_at')
        .eq('id', sessionId)
        .single()
      expect(error).toBeNull()
      expect(data).toEqual({ student_id: victimUserId, ended_at: null, deleted_at: null })
    } finally {
      await attackerCtx.close()
      await victimCtx.close()
    }
  })
})
