/**
 * Red Team Spec: recheckRestoredAnswers Server Action (actions/recheck-answers.ts) — Vectors HG-HK
 *
 * HG (idor): the victim's sessionId → no feedback, victim progress unchanged.
 *     CONTROL: the same call on the attacker's own session grades.
 * HH (answer-oracle): the attacker's own mock_exam → no key, nothing saved.
 *     CONTROL: the same call on a quick_quiz returns the key.
 * HI (auth-bypass): a deviceId other than the session's active device → refused, nothing graded.
 *     CONTROL: the active deviceId grades.
 * HJ (rate-limit): RECHECK_CHUNK + 1 answers → refused whole, nothing graded.
 *     CONTROL: RECHECK_CHUNK answers grade.
 * HK (mass-assignment): an item carrying timeSpentMs, or a question outside the session, is
 *     skipped; stored progress untouched. CONTROL: a valid item in the same batch grades.
 *
 * Status: Expected to PASS.
 */

import { type BrowserContext, expect, test } from '@playwright/test'
import { RECHECK_CHUNK as CHUNK } from '../../app/app/quiz/actions/recheck-answers-schema'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_RC_MARKER } from './helpers/seed-markers'
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
const ATTACKER_DEVICE = '00000000-0000-4000-8000-0000000000d1'
const OTHER_DEVICE = '00000000-0000-4000-8000-0000000000d2'
const VICTIM_DEVICE = '00000000-0000-4000-8000-0000000000d3'
const KEY = 'correctOptionId'
const TAKEN_OVER = 'open in another tab or device'

type Mode = 'quick_quiz' | 'mock_exam'
type Captured = { headers: Record<string, string>; id: string }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

test.describe('Red Team: recheckRestoredAnswers (HG, HH, HI, HJ, HK)', () => {
  test.setTimeout(120_000)

  let admin: ReturnType<typeof getAdminClient>
  let orgId: string
  let victimUserId: string
  let attackerUserId: string
  let subjectId: string
  let q1: string
  let q2: string
  let q3: string
  let ctx: BrowserContext
  let cap: Captured

  const seedSession = async (studentId: string, mode: Mode) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode,
        subject_id: subjectId,
        total_questions: 2,
        time_limit_seconds: mode === 'mock_exam' ? 3600 : null,
        config: { question_ids: [q1, q2], e2e_marker: E2E_REDTEAM_RC_MARKER },
      })
      .select('id')
      .single()
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`seedSession(${mode}): ${error?.message ?? 'bad shape'}`)
    return data.id
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

  const invoke = (arg: Record<string, unknown>) =>
    postServerAction(ctx.request, {
      url: `${BASE_URL}${SESSION_PATH}`,
      headers: cap.headers,
      id: cap.id,
      origin: BASE_URL,
      arg,
    })

  const attackerClient = () => createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)

  /** Attacker's own quick_quiz, q1 saved as 'b', claimed by ATTACKER_DEVICE. */
  const ownClaimedSession = async () => {
    const id = await seedSession(attackerUserId, 'quick_quiz')
    const client = await attackerClient()
    const save = await client.rpc('save_quiz_answer', {
      p_session_id: id,
      p_question_id: q1,
      p_answer: { selected_option_id: 'b' },
      p_time_spent_ms: 1000,
      p_device_id: ATTACKER_DEVICE,
    })
    expect(save.error).toBeNull()
    const claim = await client.rpc('claim_quiz_session', {
      p_session_id: id,
      p_device_id: ATTACKER_DEVICE,
    })
    expect(claim.error).toBeNull()
    return id
  }

  test.beforeAll(async ({ browser }) => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    victimUserId = seed.victimUserId
    attackerUserId = seed.attackerUserId
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
    // Other specs leave stray questions in other subjects; pick a subject that has three.
    const bySubject = new Map<string, string[]>()
    for (const r of rows)
      bySubject.set(r.subject_id, [...(bySubject.get(r.subject_id) ?? []), r.id])
    const picked = [...bySubject.entries()].find(([, ids]) => ids.length >= 3)
    if (!picked) throw new Error('need 3 active MC questions in one subject')
    const [pickedSubject, [first, second, third]] = picked
    if (typeof first !== 'string' || typeof second !== 'string' || typeof third !== 'string')
      throw new Error('picked subject lacks three string question ids')
    q1 = first
    q2 = second
    q3 = third
    subjectId = pickedSubject

    // Capture the action id + replay headers from the attacker's own restored-session page.
    await cleanupStudentActiveSessions(ATTACKER_EMAIL)
    const sessionId = await ownClaimedSession()
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
    const id = ids.get('recheckRestoredAnswers')
    const headers = watch.headers()
    if (!headers || !id) throw new Error('recheckRestoredAnswers action not captured')
    cap = { headers, id }
  })

  test.afterAll(async () => {
    await ctx?.close()
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
        .eq('config->>e2e_marker', E2E_REDTEAM_RC_MARKER)
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`soft-delete marker rows: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.info(`[recheck] soft-deleted ${data?.length}`)
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

  test('HG: the victim session id returns no feedback and changes no victim progress', async () => {
    const victimSessionId = await seedSession(victimUserId, 'quick_quiz')
    const victim = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
    const save = await victim.rpc('save_quiz_answer', {
      p_session_id: victimSessionId,
      p_question_id: q1,
      p_answer: { selected_option_id: 'a' },
      p_time_spent_ms: 1000,
      p_device_id: VICTIM_DEVICE,
    })
    expect(save.error).toBeNull()
    const before = await readProgress(victimSessionId)
    expect(before).toEqual([
      { question_id: q1, answer: { selected_option_id: 'a' }, time_spent_ms: 1000 },
    ])

    const answers = [
      { questionId: q1, selectedOptionId: 'c' },
      { questionId: q2, selectedOptionId: 'd' },
    ]
    const foreign = await invoke({ sessionId: victimSessionId, deviceId: VICTIM_DEVICE, answers })
    expect(foreign).toContain('"feedback":{}')
    expect(foreign).not.toContain(KEY)
    expect(await readProgress(victimSessionId)).toEqual(before)

    // CONTROL: the same call on the attacker's own session grades.
    await cleanupStudentActiveSessions(VICTIM_EMAIL)
    const own = await ownClaimedSession()
    const ok = await invoke({ sessionId: own, deviceId: ATTACKER_DEVICE, answers })
    expect(ok).toContain(KEY)
    expect(ok).toContain(q2)
  })

  test("HH: the attacker's own mock_exam yields no answer key and saves nothing", async () => {
    const examId = await seedSession(attackerUserId, 'mock_exam')
    const answers = [{ questionId: q1, selectedOptionId: 'a' }]
    const exam = await invoke({ sessionId: examId, deviceId: ATTACKER_DEVICE, answers })
    expect(exam).toContain('"done":true')
    expect(exam).not.toContain(KEY)
    expect(exam).not.toContain('isCorrect')
    expect(await readProgress(examId)).toEqual([])

    // CONTROL: the same call on a quick_quiz returns the key.
    await cleanupStudentActiveSessions(ATTACKER_EMAIL)
    const quiz = await ownClaimedSession()
    expect(await invoke({ sessionId: quiz, deviceId: ATTACKER_DEVICE, answers })).toContain(KEY)
  })

  test('HI: a device other than the active one gets no grading and saves nothing', async () => {
    const sessionId = await ownClaimedSession()
    const before = await readProgress(sessionId)
    expect(before).toHaveLength(1)
    const answers = [{ questionId: q2, selectedOptionId: 'a' }]
    const stale = await invoke({ sessionId, deviceId: OTHER_DEVICE, answers })
    expect(stale).toContain(TAKEN_OVER)
    expect(stale).not.toContain(KEY)
    expect(await readProgress(sessionId)).toEqual(before)

    // CONTROL: the active device grades and saves.
    expect(await invoke({ sessionId, deviceId: ATTACKER_DEVICE, answers })).toContain(KEY)
    expect((await readProgress(sessionId)).map((r) => r.question_id)).toContain(q2)
  })

  test('HJ: a batch over the per-call cap is refused whole', async () => {
    const sessionId = await ownClaimedSession()
    const item = { questionId: q2, selectedOptionId: 'a' }
    const over = await invoke({
      sessionId,
      deviceId: ATTACKER_DEVICE,
      answers: Array.from({ length: CHUNK + 1 }, () => item),
    })
    expect(over).toContain('Invalid input')
    expect(over).not.toContain(KEY)
    expect((await readProgress(sessionId)).map((r) => r.question_id)).not.toContain(q2)

    // CONTROL: exactly the cap grades.
    const at = await invoke({
      sessionId,
      deviceId: ATTACKER_DEVICE,
      answers: Array.from({ length: CHUNK }, () => item),
    })
    expect(at).toContain(KEY)
    expect((await readProgress(sessionId)).map((r) => r.question_id)).toContain(q2)
  })

  test('HK: an item with timeSpentMs or outside the session is skipped', async () => {
    const sessionId = await ownClaimedSession()
    const before = await readProgress(sessionId)
    expect(before).toEqual([
      { question_id: q1, answer: { selected_option_id: 'b' }, time_spent_ms: 1000 },
    ])
    const body = await invoke({
      sessionId,
      deviceId: ATTACKER_DEVICE,
      answers: [
        { questionId: q1, selectedOptionId: 'c', timeSpentMs: 86_400_000 },
        { questionId: q3, selectedOptionId: 'a' },
        { questionId: q2, selectedOptionId: 'd' },
      ],
    })
    // CONTROL: the valid item in the same batch grades.
    expect(body).toContain(KEY)
    expect(body).toContain(q2)
    expect(body).not.toContain(q1)
    expect(body).not.toContain(q3)
    const after = await readProgress(sessionId)
    expect(after.find((r) => r.question_id === q1)).toEqual(before[0])
    expect(after.map((r) => r.question_id)).not.toContain(q3)
  })
})
