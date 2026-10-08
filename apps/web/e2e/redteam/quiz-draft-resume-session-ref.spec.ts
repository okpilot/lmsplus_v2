/**
 * Red Team Spec: a forged draft's session reference cannot reach another student's session or a
 * malformed id — Vector HW
 *
 * HW (idor): a legacy/forged quiz_drafts row, seeded by service role, has session_config.sessionId
 *     naming (1) ANOTHER student's ACTIVE quick_quiz, or (2) a non-uuid string. Resume reads the
 *     original session and heals (soft-deletes) it before minting; reaching that step with a
 *     foreign id would park the other student's live quiz. Resume must refuse, leave the foreign
 *     session active, mint nothing and keep the draft.
 *     CONTROL: the same draft re-pointed at the victim's own parked quick_quiz resumes.
 *
 * Status: Expected to PASS.
 */

import { expect, type Page, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { cleanupStudentSavedSessions } from '../helpers/quiz-session-id'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { E2E_REDTEAM_DS_MARKER } from './helpers/seed-markers'
import {
  ATTACKER_EMAIL,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed-users'

const BASE_URL = 'http://localhost:3000'
const SESSION_URL = /\/app\/quiz\/session\/([0-9a-f-]{36})$/

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

test.describe('Red Team: forged draft session reference (HW)', () => {
  test.setTimeout(120_000)

  let admin: ReturnType<typeof getAdminClient>
  let orgId: string
  let victimUserId: string
  let otherUserId: string
  let subjectId: string
  let q1: string
  let q2: string
  const sessionIds = new Set<string>()

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    victimUserId = seed.victimUserId
    otherUserId = seed.attackerUserId
    const { data, error } = await admin
      .from('questions')
      .select('id, subject_id')
      .eq('organization_id', orgId)
      .eq('question_type', 'multiple_choice')
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('id')
      .limit(50)
    if (error) throw new Error(`beforeAll questions: ${error.message}`)
    const rows = (data ?? []) as Array<{ id: string; subject_id: string }>
    const first = rows[0]
    const sameSubject = rows.filter((r) => r.subject_id === first?.subject_id)
    if (!first || sameSubject.length < 2) throw new Error('need 2 active MC questions in a subject')
    q1 = first.id
    q2 = sameSubject[1]?.id as string
    subjectId = first.subject_id
  })

  const clearDrafts = async () => {
    // quiz_drafts is hard-delete by design (docs/database.md §3).
    const { data, error } = await admin
      .from('quiz_drafts')
      .delete()
      .eq('student_id', victimUserId)
      .select('id')
    if (error) throw new Error(`clear drafts: ${error.message}`)
    if ((data?.length ?? 0) > 0) console.info(`[draft-ref] deleted ${data?.length} draft(s)`)
  }

  const clearSessions = async () => {
    if (sessionIds.size === 0) return
    const { data, error } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', [...sessionIds])
      .is('deleted_at', null)
      .select('id')
    if (error) throw new Error(`clear sessions: ${error.message}`)
    if ((data?.length ?? 0) > 0) console.info(`[draft-ref] soft-deleted ${data?.length} session(s)`)
  }

  test.beforeEach(async () => {
    await cleanupStudentSavedSessions(VICTIM_EMAIL)
    await cleanupStudentActiveSessions(VICTIM_EMAIL)
    await cleanupStudentActiveSessions(ATTACKER_EMAIL)
    await clearDrafts()
  })

  test.afterEach(async () => {
    const errors: string[] = []
    try {
      await clearDrafts()
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      await clearSessions()
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      sessionIds.clear()
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

  async function insertSession(fields: Record<string, unknown>): Promise<string> {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        subject_id: subjectId,
        mode: 'quick_quiz',
        total_questions: 2,
        config: { question_ids: [q1, q2], e2e_marker: E2E_REDTEAM_DS_MARKER },
        ...fields,
      } as never)
      .select('id')
      .single()
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`insert session: ${error?.message ?? 'bad shape'}`)
    sessionIds.add(data.id)
    return data.id
  }

  async function forgeDraft(sessionRef: string): Promise<string> {
    const { data, error } = await admin
      .from('quiz_drafts')
      .insert({
        student_id: victimUserId,
        organization_id: orgId,
        session_config: { sessionId: sessionRef, subjectName: E2E_REDTEAM_DS_MARKER },
        question_ids: [q1, q2],
        answers: {},
        current_index: 0,
      })
      .select('id')
      .single()
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`forge draft: ${error?.message ?? 'bad shape'}`)
    return data.id
  }

  async function activeSessionIds(studentId: string): Promise<string[]> {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('id')
      .eq('student_id', studentId)
      .is('ended_at', null)
      .is('deleted_at', null)
    if (error) throw new Error(`read active sessions: ${error.message}`)
    return (data ?? []).map((r) => r.id as string)
  }

  async function draftExists(draftId: string): Promise<boolean> {
    const { data, error } = await admin.from('quiz_drafts').select('id').eq('id', draftId)
    if (error) throw new Error(`read draft: ${error.message}`)
    return (data?.length ?? 0) === 1
  }

  async function repoint(draftId: string, sessionRef: string): Promise<void> {
    const { data, error } = await admin
      .from('quiz_drafts')
      .update({ session_config: { sessionId: sessionRef, subjectName: E2E_REDTEAM_DS_MARKER } })
      .eq('id', draftId)
      .select('id')
    if (error) throw new Error(`repoint draft: ${error.message}`)
    expect(data).toHaveLength(1)
  }

  async function openSavedQuizzes(page: Page): Promise<void> {
    await page.goto('/app/quiz')
    await page.getByRole('tab', { name: /Saved Quizzes/ }).click()
  }

  async function signInVictim(page: Page): Promise<void> {
    await page.goto('/')
    await page.getByLabel('Email address').fill(VICTIM_EMAIL)
    await page.getByLabel('Password', { exact: true }).fill(VICTIM_PASSWORD)
    await Promise.all([
      page.waitForURL(/\/(app\/dashboard|consent)(?:\?.*)?$/, { timeout: 15_000 }),
      page.getByRole('button', { name: 'Sign in' }).click(),
    ])
  }

  async function resumeControl(page: Page, draftId: string): Promise<void> {
    const parkedId = await insertSession({
      student_id: victimUserId,
      deleted_at: new Date().toISOString(),
    })
    await repoint(draftId, parkedId)
    await openSavedQuizzes(page)
    await Promise.all([
      page.waitForURL(SESSION_URL, { timeout: 20_000 }),
      page.getByRole('button', { name: 'Resume', exact: true }).first().click(),
    ])
    const newSessionId = SESSION_URL.exec(page.url())?.[1] as string
    sessionIds.add(newSessionId)
    expect(await activeSessionIds(victimUserId)).toEqual([newSessionId])
  }

  test('HW: resume refuses a draft naming another student’s active quiz and leaves it active', async ({
    browser,
  }) => {
    const foreignId = await insertSession({ student_id: otherUserId })
    const draftId = await forgeDraft(foreignId)

    // Non-vacuous: the other student's quiz is live; the victim has none.
    expect(await activeSessionIds(otherUserId)).toEqual([foreignId])
    expect(await activeSessionIds(victimUserId)).toEqual([])

    const ctx = await browser.newContext({ storageState: undefined })
    await ctx.addCookies([
      { name: CONSENT_COOKIE, value: buildConsentCookieValue(victimUserId), url: BASE_URL },
    ])
    try {
      const page = await ctx.newPage()
      await signInVictim(page)
      await openSavedQuizzes(page)
      await page.getByRole('button', { name: 'Resume', exact: true }).first().click()
      await expect(
        page.getByText(/original session for this saved quiz is unavailable/i),
      ).toBeVisible({ timeout: 15_000 })
      expect(page.url()).not.toMatch(SESSION_URL)

      expect(await activeSessionIds(otherUserId)).toEqual([foreignId])
      expect(await activeSessionIds(victimUserId)).toEqual([])
      expect(await draftExists(draftId)).toBe(true)

      // CONTROL: re-pointed at the victim's own parked quick_quiz, resume mints.
      await resumeControl(page, draftId)
      expect(await activeSessionIds(otherUserId)).toEqual([foreignId])
    } finally {
      await ctx.close()
    }
  })

  test('HW: resume refuses a draft whose session reference is not a uuid', async ({ browser }) => {
    const draftId = await forgeDraft('not-a-uuid')
    expect(await draftExists(draftId)).toBe(true)
    expect(await activeSessionIds(victimUserId)).toEqual([])

    const ctx = await browser.newContext({ storageState: undefined })
    await ctx.addCookies([
      { name: CONSENT_COOKIE, value: buildConsentCookieValue(victimUserId), url: BASE_URL },
    ])
    try {
      const page = await ctx.newPage()
      await signInVictim(page)
      await openSavedQuizzes(page)
      await page.getByRole('button', { name: 'Resume', exact: true }).first().click()
      await expect(page.getByText(/missing its session reference/i)).toBeVisible({
        timeout: 15_000,
      })
      expect(page.url()).not.toMatch(SESSION_URL)
      expect(await activeSessionIds(victimUserId)).toEqual([])
      expect(await draftExists(draftId)).toBe(true)

      // CONTROL: the same draft with a valid own-session reference resumes.
      await resumeControl(page, draftId)
    } finally {
      await ctx.close()
    }
  })
})
