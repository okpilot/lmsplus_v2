/**
 * Red Team Spec: resuming a legacy quiz_drafts row seeds a new session on the server (#1026 PR 3) —
 * Vector HC
 *
 * HC (input-injection): a legacy/forged quiz_drafts row, seeded by service role (any writer: the
 *     resume guards must not trust the row), carries an answer for a question outside the draft, a malformed
 *     answer and an out-of-range position; the student then resumes it through the UI. Only the valid in-session
 *     answer reaches quiz_session_progress, the position is clamped, the draft is deleted.
 *     CONTROL: the valid in-session answer IS seeded into the new session.
 *
 * Status: Expected to PASS.
 */

import { expect, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { E2E_REDTEAM_DS_MARKER } from './helpers/seed-markers'
import { seedRedTeamUsers, VICTIM_EMAIL, VICTIM_PASSWORD } from './helpers/seed-users'

const BASE_URL = 'http://localhost:3000'
const SESSION_URL = /\/app\/quiz\/session\/([0-9a-f-]{36})$/

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

test.describe('Red Team: legacy draft resume seeding (HC)', () => {
  test.setTimeout(120_000)

  let admin: ReturnType<typeof getAdminClient>
  let orgId: string
  let victimUserId: string
  let subjectId: string
  let q1: string
  let q2: string
  let outsider: string

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
    const sameSubject = rows.filter((r) => r.subject_id === first?.subject_id)
    if (!first || sameSubject.length < 3) throw new Error('need 3 active MC questions in a subject')
    q1 = first.id
    q2 = sameSubject[1]?.id as string
    outsider = sameSubject[2]?.id as string
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
    if ((data?.length ?? 0) > 0) console.info(`[draft-seed] deleted ${data?.length} draft(s)`)
  }

  test.beforeEach(async () => {
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
      await cleanupStudentActiveSessions(VICTIM_EMAIL)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  test('HC: a forged draft seeds only its valid in-session answer and a clamped position', async ({
    browser,
  }) => {
    // The draft's original session: a parked quick_quiz (soft-deleted), as the pre-PR save left it.
    const { data: parked, error: parkErr } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: victimUserId,
        mode: 'quick_quiz',
        subject_id: subjectId,
        total_questions: 2,
        config: { question_ids: [q1, q2], e2e_marker: E2E_REDTEAM_DS_MARKER },
        deleted_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (parkErr || !isRecord(parked) || typeof parked.id !== 'string')
      throw new Error(`park session: ${parkErr?.message ?? 'bad shape'}`)

    const { data: draft, error: draftErr } = await admin
      .from('quiz_drafts')
      .insert({
        student_id: victimUserId,
        organization_id: orgId,
        session_config: { sessionId: parked.id, subjectName: E2E_REDTEAM_DS_MARKER },
        question_ids: [q1, q2],
        answers: {
          [q1]: { selectedOptionId: 'b', responseTimeMs: 1234, isCorrect: true },
          [q2]: { selectedOptionId: 'z', responseTimeMs: 5 },
          [outsider]: { selectedOptionId: 'a', responseTimeMs: 5 },
        },
        current_index: 99,
      })
      .select('id')
      .single()
    if (draftErr || !isRecord(draft) || typeof draft.id !== 'string')
      throw new Error(`forge draft: ${draftErr?.message ?? 'bad shape'}`)

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
      const { data: before, error: bErr } = await admin
        .from('quiz_drafts')
        .select('id')
        .eq('id', draft.id)
      if (bErr) throw new Error(`read draft before resume: ${bErr.message}`)
      expect(before).toHaveLength(1)
      await page.getByRole('button', { name: 'Resume', exact: true }).first().click()
      await page.waitForURL(SESSION_URL, { timeout: 20_000 })
      const newSessionId = SESSION_URL.exec(page.url())?.[1] as string
      expect(newSessionId).not.toBe(parked.id)

      const { data: session, error: sErr } = await admin
        .from('quiz_sessions')
        .select('student_id, mode, current_index, config, ended_at, deleted_at')
        .eq('id', newSessionId)
        .single()
      if (sErr || !session) throw new Error(`read new session: ${sErr?.message}`)
      expect(session.student_id).toBe(victimUserId)
      expect(session.mode).toBe('quick_quiz')
      expect(session.ended_at).toBeNull()
      expect(session.deleted_at).toBeNull()
      expect((session.config as { question_ids?: unknown }).question_ids).toEqual([q1, q2])
      expect(session.current_index).toBe(1)

      const { data: progress, error: pErr } = await admin
        .from('quiz_session_progress')
        .select('question_id, answer')
        .eq('session_id', newSessionId)
        .not('answer', 'is', null)
      if (pErr) throw new Error(`read progress: ${pErr.message}`)
      // CONTROL + HC: exactly the valid in-session answer, with no forged field.
      expect(progress).toEqual([{ question_id: q1, answer: { selected_option_id: 'b' } }])

      const { data: outsiderRows, error: oErr } = await admin
        .from('quiz_session_progress')
        .select('question_id')
        .eq('session_id', newSessionId)
        .eq('question_id', outsider)
      if (oErr) throw new Error(`read outsider: ${oErr.message}`)
      expect(outsiderRows).toEqual([])

      const { data: left, error: lErr } = await admin
        .from('quiz_drafts')
        .select('id')
        .eq('id', draft.id)
      if (lErr) throw new Error(`read draft: ${lErr.message}`)
      expect(left).toEqual([])
    } finally {
      await ctx.close()
    }
  })
})
