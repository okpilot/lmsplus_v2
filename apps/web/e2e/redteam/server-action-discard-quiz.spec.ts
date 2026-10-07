/**
 * Red Team Spec: discardQuiz Server Action (actions/discard.ts) — Vectors EF, HT
 *
 * HT (idor): the attacker replays discardQuiz on their own session with a forged
 *     `draftId` naming the victim's quiz_drafts row (and their own) → both drafts survive.
 *     CONTROL: the same call soft-deletes the attacker's own session.
 * EF (privilege-escalation): discardQuiz on the attacker's own active internal_exam /
 *     vfr_rt_exam session → refused with the mode token; the session stays active.
 *     CONTROL: HT's control arm (a mock_exam session is discarded by the same action).
 *
 * Status: Expected to PASS.
 */

import { type BrowserContext, expect, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_DQ_MARKER } from './helpers/seed-markers'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamUsers,
  VICTIM_EMAIL,
} from './helpers/seed-users'

const BASE_URL = 'http://localhost:3000'
const SESSION_PATH = '/app/quiz/session'
const ATTACKER_DEVICE = '00000000-0000-4000-8000-0000000000d1'

type Captured = { headers: Record<string, string>; id: string }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const REFERENCE_RES = [
  /createServerReference\)?\(\s*"([0-9a-f]{40,})"[^"]*?"(\w+)"\s*\)/g,
  /"([0-9a-f]{40,})":\{"name":"(\w+)"\}/g,
]

test.describe('Red Team: discardQuiz Server Action (EF, HT)', () => {
  test.setTimeout(120_000)

  let admin: ReturnType<typeof getAdminClient>
  let orgId: string
  let victimUserId: string
  let attackerUserId: string
  let q1: string
  let q2: string
  let ctx: BrowserContext
  let cap: Captured

  const seedSession = async (opts: { studentId: string; mode: string }) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: opts.studentId,
        mode: opts.mode,
        total_questions: 2,
        time_limit_seconds: 3600,
        config: { question_ids: [q1, q2], e2e_marker: E2E_REDTEAM_DQ_MARKER },
      })
      .select('id')
      .single()
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`seedSession(${opts.mode}): ${error?.message ?? 'bad shape'}`)
    return data.id
  }

  const seedDraft = async (studentId: string) => {
    const { data, error } = await admin
      .from('quiz_drafts')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        question_ids: [q1, q2],
        session_config: { subjectName: E2E_REDTEAM_DQ_MARKER },
      })
      .select('id')
      .single()
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`seedDraft: ${error?.message ?? 'bad shape'}`)
    return data.id
  }

  const draftExists = async (id: string) => {
    const { data, error } = await admin.from('quiz_drafts').select('id').eq('id', id)
    if (error) throw new Error(`draftExists: ${error.message}`)
    return (data?.length ?? 0) === 1
  }

  const readSession = async (id: string) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('id, ended_at, deleted_at')
      .eq('id', id)
      .single()
    if (error || !data) throw new Error(`readSession: ${error?.message}`)
    return data
  }

  const replayHeaders = () => {
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(cap.headers)) {
      if (!['cookie', 'content-length', 'host'].includes(k.toLowerCase())) headers[k] = v
    }
    headers['next-action'] = cap.id
    headers.origin = BASE_URL
    return headers
  }

  const invoke = async (arg: Record<string, unknown>): Promise<string> => {
    const res = await ctx.request.post(`${BASE_URL}${SESSION_PATH}`, {
      headers: replayHeaders(),
      data: JSON.stringify([arg]),
      maxRedirects: 0,
    })
    return res.text()
  }

  test.beforeAll(async ({ browser }) => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    victimUserId = seed.victimUserId
    attackerUserId = seed.attackerUserId
    const { data, error } = await admin
      .from('questions')
      .select('id')
      .eq('organization_id', orgId)
      .eq('question_type', 'multiple_choice')
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('id')
      .limit(2)
    if (error) throw new Error(`beforeAll questions: ${error.message}`)
    if (!Array.isArray(data) || data.length < 2) throw new Error('need 2 active MC questions')
    q1 = data[0]?.id as string
    q2 = data[1]?.id as string

    // Capture the action id + replay headers from the attacker's own session page.
    await cleanupStudentActiveSessions(ATTACKER_EMAIL)
    const sessionId = await seedSession({ studentId: attackerUserId, mode: 'mock_exam' })
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
    await page.goto('/')
    await page.getByLabel('Email address').fill(ATTACKER_EMAIL)
    await page.getByLabel('Password', { exact: true }).fill(ATTACKER_PASSWORD)
    await Promise.all([
      page.waitForURL(/\/(app\/dashboard|consent)(?:\?.*)?$/, { timeout: 15_000 }),
      page.getByRole('button', { name: 'Sign in' }).click(),
    ])
    const ids = new Map<string, string>()
    const scripts: Promise<void>[] = []
    let headers: Record<string, string> | undefined
    page.on('response', (res) => {
      if (!res.url().includes('/_next/') || !res.url().split('?')[0]?.endsWith('.js')) return
      scripts.push(
        res
          .text()
          .then((js) => {
            for (const re of REFERENCE_RES)
              for (const m of js.matchAll(re)) if (m[1] && m[2]) ids.set(m[2], m[1])
          })
          .catch(() => {}),
      )
    })
    page.on('request', (req) => {
      const h = req.headers()
      if (req.method() === 'POST' && h['next-action'] && !headers) headers = h
    })
    await page.goto(`${SESSION_PATH}/${sessionId}`)
    await expect(page.getByText(/Question 1 of 2/)).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => headers !== undefined, { timeout: 10_000 }).toBe(true)
    await Promise.all(scripts)
    await page.close()
    const id = ids.get('discardQuiz')
    if (!headers || !id) throw new Error('discardQuiz action not captured')
    cap = { headers, id }
  })

  test.afterAll(async () => {
    await ctx?.close()
  })

  test.afterEach(async () => {
    const errors: string[] = []
    try {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('config->>e2e_marker', E2E_REDTEAM_DQ_MARKER)
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`soft-delete marker sessions: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.info(`[discard-action] soft-deleted ${data?.length}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      // quiz_drafts is hard-delete by design (no deleted_at column; docs/database.md §3).
      const { data, error } = await admin
        .from('quiz_drafts')
        .delete()
        .eq('session_config->>subjectName', E2E_REDTEAM_DQ_MARKER)
        .select('id')
      if (error) throw new Error(`delete marker drafts: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.info(`[discard-action] deleted ${data?.length} drafts`)
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

  test('HT: a forged draftId never deletes a draft, foreign or own', async () => {
    const victimDraft = await seedDraft(victimUserId)
    const ownDraft = await seedDraft(attackerUserId)
    expect(await draftExists(victimDraft)).toBe(true)
    expect(await draftExists(ownDraft)).toBe(true)

    await cleanupStudentActiveSessions(ATTACKER_EMAIL)
    const s1 = await seedSession({ studentId: attackerUserId, mode: 'mock_exam' })
    const r1 = await invoke({ sessionId: s1, draftId: victimDraft })
    // CONTROL: the action ran and discarded the attacker's own session.
    expect(r1).toContain('"success":true')
    expect((await readSession(s1)).deleted_at).not.toBeNull()
    expect(await draftExists(victimDraft)).toBe(true)

    const s2 = await seedSession({ studentId: attackerUserId, mode: 'mock_exam' })
    const r2 = await invoke({ sessionId: s2, draftId: ownDraft })
    expect(r2).toContain('"success":true')
    expect((await readSession(s2)).deleted_at).not.toBeNull()
    expect(await draftExists(ownDraft)).toBe(true)
    expect(await draftExists(victimDraft)).toBe(true)
  })

  for (const [mode, token] of [
    ['internal_exam', 'cannot_discard_internal_exam'],
    ['vfr_rt_exam', 'cannot_discard_vfr_rt_exam'],
  ] as const) {
    test(`EF: an active ${mode} session cannot be discarded through the action`, async () => {
      await cleanupStudentActiveSessions(ATTACKER_EMAIL)
      const id = await seedSession({ studentId: attackerUserId, mode })
      const before = await readSession(id)
      expect(before.deleted_at).toBeNull()
      expect(before.ended_at).toBeNull()

      const res = await invoke({ sessionId: id })
      expect(res).not.toContain('"success":true')
      expect(res).toContain(token)
      const after = await readSession(id)
      expect(after.deleted_at).toBeNull()
      expect(after.ended_at).toBeNull()
    })
  }
})
