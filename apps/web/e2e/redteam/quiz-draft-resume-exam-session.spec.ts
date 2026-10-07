/**
 * Red Team Spec: a forged draft cannot turn resume into a way to hide a graded exam — Vector EV
 *
 * EV (privilege-escalation): the app no longer writes quiz_drafts (#1026 PR 3). A legacy/forged
 *     draft row, seeded by service role (any writer: resume must not trust the row), has
 *     session_config.sessionId naming the student's own FINISHED internal_exam; the student clicks Resume. Resume
 *     soft-deletes the draft's original session before minting a new one; reaching that step would
 *     hide the graded result. Resume must refuse, leave the exam row untouched, mint nothing and
 *     keep the draft.
 *     CONTROL: the same draft re-pointed (by service role) at a parked quick_quiz
 *     resumes into a new session.
 *
 * Status: Expected to PASS.
 */

import { expect, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { cleanupStudentSavedSessions } from '../helpers/quiz-session-id'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { E2E_REDTEAM_DS_MARKER } from './helpers/seed-markers'
import { seedRedTeamUsers, VICTIM_EMAIL, VICTIM_PASSWORD } from './helpers/seed-users'

const BASE_URL = 'http://localhost:3000'
const SESSION_URL = /\/app\/quiz\/session\/([0-9a-f-]{36})$/

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

test.describe('Red Team: forged draft resume against a graded exam (EV)', () => {
  test.setTimeout(120_000)

  let admin: ReturnType<typeof getAdminClient>
  let orgId: string
  let victimUserId: string
  let subjectId: string
  let q1: string
  let q2: string
  const examIds = new Set<string>()

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
    if ((data?.length ?? 0) > 0) console.info(`[draft-exam] deleted ${data?.length} draft(s)`)
  }

  const clearExams = async () => {
    if (examIds.size === 0) return
    const { data, error } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', [...examIds])
      .is('deleted_at', null)
      .select('id')
    if (error) throw new Error(`clear exams: ${error.message}`)
    if ((data?.length ?? 0) > 0) console.info(`[draft-exam] soft-deleted ${data?.length} exam(s)`)
  }

  test.beforeEach(async () => {
    // A saved session renders its own Resume button ahead of the draft card.
    await cleanupStudentSavedSessions(VICTIM_EMAIL)
    await cleanupStudentActiveSessions(VICTIM_EMAIL)
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
      await clearExams()
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      examIds.clear()
    }
    try {
      await cleanupStudentActiveSessions(VICTIM_EMAIL)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  async function insertSession(fields: Record<string, unknown>): Promise<string> {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: victimUserId,
        subject_id: subjectId,
        total_questions: 2,
        config: { question_ids: [q1, q2], e2e_marker: E2E_REDTEAM_DS_MARKER },
        ...fields,
      } as never)
      .select('id')
      .single()
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`insert session: ${error?.message ?? 'bad shape'}`)
    return data.id
  }

  async function activeSessionIds(): Promise<string[]> {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('id')
      .eq('student_id', victimUserId)
      .is('ended_at', null)
      .is('deleted_at', null)
    if (error) throw new Error(`read active sessions: ${error.message}`)
    return (data ?? []).map((r) => r.id as string)
  }

  test('EV: resume refuses a forged draft naming a finished internal exam and leaves it intact', async ({
    browser,
  }) => {
    const examId = await insertSession({
      mode: 'internal_exam',
      ended_at: new Date().toISOString(),
      correct_count: 0,
      score_percentage: 0,
    })
    examIds.add(examId)

    const { data: draft, error: draftErr } = await admin
      .from('quiz_drafts')
      .insert({
        student_id: victimUserId,
        organization_id: orgId,
        session_config: { sessionId: examId, subjectName: E2E_REDTEAM_DS_MARKER },
        question_ids: [q1, q2],
        answers: {},
        current_index: 0,
      })
      .select('id')
      .single()
    if (draftErr || !isRecord(draft) || typeof draft.id !== 'string')
      throw new Error(`forge draft: ${draftErr?.message ?? 'bad shape'}`)

    // Non-vacuous: the graded exam exists, is finished and is not soft-deleted.
    const { data: examBefore, error: ebErr } = await admin
      .from('quiz_sessions')
      .select('ended_at, deleted_at')
      .eq('id', examId)
      .single()
    if (ebErr || !examBefore) throw new Error(`read exam before: ${ebErr?.message}`)
    expect(examBefore.ended_at).not.toBeNull()
    expect(examBefore.deleted_at).toBeNull()
    expect(await activeSessionIds()).toEqual([])

    const ctx = await browser.newContext({ storageState: undefined })
    await ctx.addCookies([
      { name: CONSENT_COOKIE, value: buildConsentCookieValue(victimUserId), url: BASE_URL },
    ])
    try {
      const page = await ctx.newPage()
      await page.goto('/')
      await page.getByLabel('Email address').fill(VICTIM_EMAIL)
      await page.getByLabel('Password', { exact: true }).fill(VICTIM_PASSWORD)
      await Promise.all([
        page.waitForURL(/\/(app\/dashboard|consent)(?:\?.*)?$/, { timeout: 15_000 }),
        page.getByRole('button', { name: 'Sign in' }).click(),
      ])
      await page.goto('/app/quiz')
      await page.getByRole('tab', { name: /Saved Quizzes/ }).click()
      const resume = page.getByRole('button', { name: 'Resume', exact: true }).first()
      await resume.click()
      await expect(page.getByText(/can.t be resumed/i)).toBeVisible({ timeout: 15_000 })
      expect(page.url()).not.toMatch(SESSION_URL)

      // EV: the graded exam is untouched, nothing was minted, the draft is kept.
      const { data: examAfter, error: eaErr } = await admin
        .from('quiz_sessions')
        .select('ended_at, deleted_at')
        .eq('id', examId)
        .single()
      if (eaErr || !examAfter) throw new Error(`read exam after: ${eaErr?.message}`)
      expect(examAfter.deleted_at).toBeNull()
      expect(examAfter.ended_at).toBe(examBefore.ended_at)
      expect(await activeSessionIds()).toEqual([])
      const { data: kept, error: kErr } = await admin
        .from('quiz_drafts')
        .select('id')
        .eq('id', draft.id)
      if (kErr) throw new Error(`read draft: ${kErr.message}`)
      expect(kept).toHaveLength(1)

      // CONTROL: the same draft is re-pointed at a parked quick_quiz; resume now mints.
      const parkedId = await insertSession({
        mode: 'quick_quiz',
        deleted_at: new Date().toISOString(),
      })
      const { data: repointed, error: rpErr } = await admin
        .from('quiz_drafts')
        .update({ session_config: { sessionId: parkedId, subjectName: E2E_REDTEAM_DS_MARKER } })
        .eq('id', draft.id)
        .select('id')
      if (rpErr) throw new Error(`repoint draft: ${rpErr.message}`)
      expect(repointed).toHaveLength(1)
      await page.reload()
      await page.getByRole('tab', { name: /Saved Quizzes/ }).click()
      await Promise.all([
        page.waitForURL(SESSION_URL, { timeout: 20_000 }),
        page.getByRole('button', { name: 'Resume', exact: true }).first().click(),
      ])
      const newSessionId = SESSION_URL.exec(page.url())?.[1] as string
      expect(await activeSessionIds()).toEqual([newSessionId])
    } finally {
      await ctx.close()
    }
  })
})
