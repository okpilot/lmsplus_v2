/**
 * Red Team Spec — Vector HZ (#1412): checkAnswer / checkNonMcAnswer run no action-side
 * quiz_sessions membership pre-check; check_quiz_answer (mig 20261002000700) and
 * check_non_mc_answer (mig 20261002000800) are the only session guard.
 *
 * The attacker replays both Server Actions against: a question outside their own active session,
 * the victim's active session (non-MC; MC is GQ), their own ENDED session, their own saved
 * (soft-deleted) session, and their own ACTIVE mock_exam session (mid-exam answer oracle).
 * Every replay must return mapped copy, no grading, no answer key, no saved progress.
 *
 * CONTROL: the same two actions on the attacker's own active quick_quiz session with a member
 * question grade (isCorrect present) and save progress.
 *
 * Status: Expected to PASS.
 */

import { type BrowserContext, expect, type Page, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { E2E_REDTEAM_HZ_MARKER } from './helpers/seed-markers'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamUsers,
  VICTIM_EMAIL,
} from './helpers/seed-users'
import { postServerAction, signInViaForm, watchServerActions } from './server-action-capture'

const BASE_URL = 'http://localhost:3000'
const SESSION_PATH = '/app/quiz/session'
const NOT_FOUND = 'This session could not be found.'
const NO_QUESTION = 'That question is not part of this session.'
const NO_FEATURE = 'This session type does not support saving progress.'

type ActionName = 'checkAnswer' | 'checkNonMcAnswer'
type Captured = { headers: Record<string, string>; ids: Map<string, string> }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** Starts a quiz through the UI and answers Q1 so the session bundle and one action request load. */
async function captureActions(page: Page): Promise<Captured> {
  const watch = watchServerActions(page)
  await page.goto('/app/quiz')
  await expect(page.getByRole('heading', { name: 'Quiz' })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Study', exact: true }).click()
  const trigger = page.locator('[data-testid="subject-trigger"]')
  await trigger.waitFor({ state: 'visible' })
  await trigger.click()
  await page.locator('[data-testid="subject-option"]').first().click()
  await page.getByRole('button', { name: 'All' }).click()
  await page.getByRole('button', { name: 'Start Quiz' }).click()
  await page.waitForURL(new RegExp(`${SESSION_PATH}/[0-9a-f-]{36}$`), { timeout: 15_000 })
  await expect(page.getByText(/Question 1 of \d+/)).toBeVisible({ timeout: 15_000 })
  await page.locator('button:has(span.rounded-full)').first().click()
  await page.getByRole('button', { name: 'Submit Answer' }).first().click()
  await page.getByRole('button', { name: 'Next ›' }).waitFor({ state: 'visible', timeout: 10_000 })
  const ids = await watch.settle()
  const headers = watch.headers()
  if (!headers) throw new Error('no Server Action request observed')
  for (const name of ['checkAnswer', 'checkNonMcAnswer'] as const)
    if (!ids.has(name)) throw new Error(`action id for ${name} not found in client bundles`)
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
  return postServerAction(context.request, {
    url: `${BASE_URL}${SESSION_PATH}`,
    headers: cap.headers,
    id,
    origin: BASE_URL,
    arg,
  })
}

test.describe('Red Team: check-answer actions rely on the RPC session guard (HZ)', () => {
  test.setTimeout(120_000)

  let admin: ReturnType<typeof getAdminClient>
  let orgId: string
  let attackerUserId: string
  let victimUserId: string
  let mcMember: string
  let mcOutside: string
  let saMember: string
  let saOutside: string
  let saCanonical: string

  const pickQuestions = async (type: string, n: number) => {
    let query = admin
      .from('questions')
      .select('id, correct_option_id, canonical_answer')
      .eq('organization_id', orgId)
      .eq('question_type', type)
      .eq('status', 'active')
      .is('deleted_at', null)
    query =
      type === 'multiple_choice'
        ? query.not('correct_option_id', 'is', null)
        : query.not('canonical_answer', 'is', null)
    const { data, error } = await query.order('id').limit(n)
    if (error) throw new Error(`pickQuestions ${type}: ${error.message}`)
    if (!Array.isArray(data) || data.length < n) throw new Error(`need ${n} active ${type}`)
    return data
  }

  const insertSession = async (opts: {
    studentId: string
    mode: string
    endedAt?: string
    savedAt?: string
  }): Promise<string> => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: opts.studentId,
        mode: opts.mode,
        total_questions: 2,
        config: { question_ids: [mcMember, saMember], e2e_marker: E2E_REDTEAM_HZ_MARKER },
        ended_at: opts.endedAt ?? null,
        deleted_at: opts.savedAt ?? null,
        saved_at: opts.savedAt ?? null,
      })
      .select('id')
      .single()
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`insertSession ${opts.mode}: ${error?.message ?? 'bad shape'}`)
    return data.id
  }

  const progressCount = async (sessionId: string): Promise<number> => {
    const { count, error } = await admin
      .from('quiz_session_progress')
      .select('question_id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
    if (error) throw new Error(`progressCount: ${error.message}`)
    return count ?? 0
  }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    attackerUserId = seed.attackerUserId
    victimUserId = seed.victimUserId
    const mc = await pickQuestions('multiple_choice', 2)
    const sa = await pickQuestions('short_answer', 2)
    const [m1, m2] = mc
    const [s1, s2] = sa
    if (typeof m1?.id !== 'string' || typeof m2?.id !== 'string') throw new Error('mc ids')
    if (typeof s1?.id !== 'string' || typeof s2?.id !== 'string') throw new Error('sa ids')
    if (typeof s1.canonical_answer !== 'string' || s1.canonical_answer.length < 2)
      throw new Error('short_answer canonical missing')
    mcMember = m1.id
    mcOutside = m2.id
    saMember = s1.id
    saOutside = s2.id
    saCanonical = s1.canonical_answer
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
        .eq('config->>e2e_marker', E2E_REDTEAM_HZ_MARKER)
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`soft-delete marker rows: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.info(`[HZ] soft-deleted ${data?.length}`)
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

  test('HZ: answer checks outside an own active practice session grade nothing', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: undefined })
    try {
      await ctx.addCookies([
        { name: CONSENT_COOKIE, value: buildConsentCookieValue(attackerUserId), url: BASE_URL },
      ])
      const page = await ctx.newPage()
      await signInViaForm(page, { email: ATTACKER_EMAIL, password: ATTACKER_PASSWORD })
      const cap = await captureActions(page)
      await page.close()
      await cleanupStudentActiveSessions(ATTACKER_EMAIL)

      const mc = (sessionId: string, questionId: string) =>
        invoke(ctx, cap, 'checkAnswer', { sessionId, questionId, selectedOptionId: 'a' })
      const sa = (sessionId: string, questionId: string) =>
        invoke(ctx, cap, 'checkNonMcAnswer', { sessionId, questionId, responseText: 'zz' })
      const refused = (body: string, copy: string, label: string) => {
        expect(body, label).toContain(copy)
        expect(body, label).not.toContain('isCorrect')
        expect(body, label).not.toContain('correctOptionId')
        expect(body, label).not.toContain(saCanonical)
      }

      // CONTROL: own active quick_quiz, member questions → graded and saved.
      const own = await insertSession({ studentId: attackerUserId, mode: 'quick_quiz' })
      expect(await mc(own, mcMember)).toContain('isCorrect')
      const graded = await sa(own, saMember)
      expect(graded).toContain('isCorrect')
      expect(graded).toContain(saCanonical)
      expect(await progressCount(own)).toBe(2)

      // Non-member question on the own active session.
      refused(await mc(own, mcOutside), NO_QUESTION, 'mc non-member')
      refused(await sa(own, saOutside), NO_QUESTION, 'sa non-member')

      // Victim's active session (non-MC; the MC replay is GQ).
      const victim = await insertSession({ studentId: victimUserId, mode: 'quick_quiz' })
      refused(await sa(victim, saMember), NOT_FOUND, 'sa foreign')
      expect(await progressCount(victim)).toBe(0)

      // Own session, now ended.
      const { data: ended, error: endErr } = await admin
        .from('quiz_sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', own)
        .select('id')
      if (endErr) throw new Error(`end own session: ${endErr.message}`)
      expect(ended).toHaveLength(1)
      refused(await mc(own, mcMember), NOT_FOUND, 'mc ended')
      refused(await sa(own, saMember), NOT_FOUND, 'sa ended')

      // Own saved (soft-deleted) session.
      const saved = await insertSession({
        studentId: attackerUserId,
        mode: 'quick_quiz',
        savedAt: new Date().toISOString(),
      })
      refused(await mc(saved, mcMember), NOT_FOUND, 'mc saved')
      refused(await sa(saved, saMember), NOT_FOUND, 'sa saved')
      expect(await progressCount(saved)).toBe(0)

      // Own ACTIVE mock_exam session — the mid-exam oracle.
      const exam = await insertSession({ studentId: attackerUserId, mode: 'mock_exam' })
      refused(await mc(exam, mcMember), NO_FEATURE, 'mc mock_exam')
      refused(await sa(exam, saMember), NO_FEATURE, 'sa mock_exam')
      expect(await progressCount(exam)).toBe(0)
    } finally {
      await ctx.close()
    }
  })
})
