/**
 * Red Team Spec: resuming a forged quiz_drafts row costs at most one seed write per draft question
 * (#1026 PR 3) — Vector HF
 *
 * HF (rate-limit): a legacy/forged quiz_drafts row seeded by service role, standing in for a
 *     pre-REVOKE student write (the answers JSONB has no size cap), carries JUNK_KEYS answers keyed
 *     by random uuids outside the draft's questions; the student then resumes it once through the UI. Seeding must not issue one
 *     save_quiz_answer round-trip per junk key: the resume completes inside RESUME_BUDGET_MS.
 *     CONTROL: the one valid in-session answer IS seeded into the new session.
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
const JUNK_KEYS = 10_000
const RESUME_BUDGET_MS = 15_000

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

test.describe('Red Team: draft resume seed fan-out (HF)', () => {
  test.setTimeout(300_000)

  let admin: ReturnType<typeof getAdminClient>
  let orgId: string
  let victimUserId: string
  let subjectId: string
  let q1: string
  let q2: string

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
    if ((data?.length ?? 0) > 0) console.info(`[draft-fanout] deleted ${data?.length} draft(s)`)
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

  test('HF: junk draft answers outside the draft questions do not each cost a seed write', async ({
    browser,
  }) => {
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

    const answers: Record<string, unknown> = { [q1]: { selectedOptionId: 'b', responseTimeMs: 5 } }
    for (let i = 0; i < JUNK_KEYS; i++) {
      answers[crypto.randomUUID()] = { selectedOptionId: 'a', responseTimeMs: 5 }
    }
    const { data: draft, error: draftErr } = await admin
      .from('quiz_drafts')
      .insert({
        student_id: victimUserId,
        organization_id: orgId,
        session_config: { sessionId: parked.id, subjectName: E2E_REDTEAM_DS_MARKER },
        question_ids: [q1, q2],
        answers,
        current_index: 0,
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
      const started = Date.now()
      await page.getByRole('button', { name: 'Resume', exact: true }).first().click()
      await page.waitForURL(SESSION_URL, { timeout: 260_000 })
      const elapsed = Date.now() - started
      console.info(`[draft-fanout] resume with ${JUNK_KEYS} junk keys took ${elapsed} ms`)
      const newSessionId = SESSION_URL.exec(page.url())?.[1] as string
      expect(newSessionId).not.toBe(parked.id)

      // CONTROL: the seed loop ran — the valid in-session answer reached the new session.
      const { data: progress, error: pErr } = await admin
        .from('quiz_session_progress')
        .select('question_id, answer')
        .eq('session_id', newSessionId)
        .not('answer', 'is', null)
      if (pErr) throw new Error(`read progress: ${pErr.message}`)
      expect(progress).toEqual([{ question_id: q1, answer: { selected_option_id: 'b' } }])

      expect(elapsed).toBeLessThan(RESUME_BUDGET_MS)
    } finally {
      await ctx.close()
    }
  })
})
