/**
 * Red Team Spec: the refresh-wrapper Server Actions (actions/discard-and-refresh.ts,
 * actions/resume-and-refresh.ts) — Vectors IV, IW, IX
 *
 * IV (idor): discardSavedQuizAndRefresh replayed with the victim's saved session id → refused;
 *     the victim's row stays saved. CONTROL: the replay clears the attacker's own saved marker.
 * IW (idor): deleteDraftAndRefresh replayed with the victim's draft id → the victim's draft
 *     survives. CONTROL: the replay deletes the attacker's own draft.
 * IX (idor): resumeSavedQuizAndRefresh replayed with the victim's saved session id → refused;
 *     the victim's row stays saved. CONTROL: the replay revives the attacker's own saved row.
 *
 * Status: Expected to PASS.
 */

import { type BrowserContext, expect, type Page, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { getAdminClient } from '../helpers/supabase'
import { clearOpenSessions } from './helpers/clear-open-sessions'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_IV_MARKER } from './helpers/seed-markers'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed-users'
import { postServerAction, signInViaForm, watchServerActions } from './server-action-capture'

const BASE_URL = 'http://localhost:3000'
const QUIZ_PATH = '/app/quiz'
const DEVICE = '00000000-0000-4000-8000-0000000000c1'

type Client = Awaited<ReturnType<typeof createAuthenticatedClient>>
type Captured = { url: string; headers: Record<string, string>; ids: Map<string, string> }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

test.describe('Red Team: saved-quiz / draft refresh Server Actions (IV, IW, IX)', () => {
  test.setTimeout(180_000)

  let admin: ReturnType<typeof getAdminClient>
  let attacker: Client
  let victim: Client
  let orgId: string
  let victimUserId: string
  let attackerUserId: string
  let q1: string
  let q2: string
  let ctx: BrowserContext
  let listCap: Captured
  let sessionCap: Captured

  const clearActive = (studentId: string) => clearOpenSessions(admin, studentId, 'saved-refresh')

  const seedSaved = async (studentId: string, client: Client): Promise<string> => {
    await clearActive(studentId)
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode: 'quick_quiz',
        total_questions: 2,
        config: { question_ids: [q1, q2], e2e_marker: E2E_REDTEAM_IV_MARKER },
      })
      .select('id')
      .single()
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`seedSaved: ${error?.message ?? 'bad shape'}`)
    const save = await client.rpc('save_quiz_for_later', {
      p_session_id: data.id,
      p_device_id: DEVICE,
    })
    if (save.error) throw new Error(`seedSaved save: ${save.error.message}`)
    return data.id
  }

  const readRow = async (id: string) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('deleted_at, saved_at, ended_at')
      .eq('id', id)
      .single()
    if (error || !data) throw new Error(`readRow: ${error?.message}`)
    return data
  }

  const savedCount = async (studentId: string): Promise<number> => {
    const { count, error } = await admin
      .from('quiz_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', studentId)
      .not('saved_at', 'is', null)
    if (error) throw new Error(`savedCount: ${error.message}`)
    return count ?? 0
  }

  const seedDraft = async (studentId: string): Promise<string> => {
    const { data, error } = await admin
      .from('quiz_drafts')
      .insert({
        student_id: studentId,
        organization_id: orgId,
        session_config: { subjectName: E2E_REDTEAM_IV_MARKER },
      })
      .select('id')
      .single()
    if (error || typeof data?.id !== 'string') throw new Error(`seedDraft: ${error?.message}`)
    return data.id
  }

  const draftExists = async (id: string): Promise<boolean> => {
    const { data, error } = await admin.from('quiz_drafts').select('id').eq('id', id)
    if (error) throw new Error(`draftExists: ${error.message}`)
    return (data?.length ?? 0) === 1
  }

  const invoke = (cap: Captured, name: string, arg: Record<string, unknown>) => {
    const id = cap.ids.get(name)
    if (!id) throw new Error(`action id for ${name} not captured`)
    return postServerAction(ctx.request, {
      url: cap.url,
      headers: cap.headers,
      id,
      origin: BASE_URL,
      arg,
    })
  }

  const loadQuestionIds = async (): Promise<[string, string]> => {
    const { data, error } = await admin
      .from('questions')
      .select('id')
      .eq('organization_id', orgId)
      .eq('question_type', 'multiple_choice')
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('id')
      .limit(2)
    if (error) throw new Error(`questions: ${error.message}`)
    const [a, b] = (data ?? []).map((r) => r.id)
    if (typeof a !== 'string' || typeof b !== 'string') throw new Error('need 2 MC questions')
    return [a, b]
  }

  /** Deletes the attacker's own saved quiz from the Saved Quizzes list; captures that request. */
  const captureList = async (page: Page): Promise<Captured> => {
    await seedSaved(attackerUserId, attacker)
    const before = await savedCount(attackerUserId)
    const watch = watchServerActions(page)
    await page.goto(QUIZ_PATH)
    await page.getByTestId('tab-saved').click()
    await page.getByTestId('delete-saved-session').first().click()
    await expect.poll(() => watch.headers() !== undefined, { timeout: 15_000 }).toBe(true)
    // CONTROL: the list's own request cleared one of the attacker's saved markers.
    await expect.poll(() => savedCount(attackerUserId), { timeout: 15_000 }).toBe(before - 1)
    const ids = await watch.settle()
    const headers = watch.headers()
    if (!headers) throw new Error('no list Server Action captured')
    expect(headers['next-action']).toBe(ids.get('discardSavedQuizAndRefresh'))
    return { url: `${BASE_URL}${QUIZ_PATH}`, headers, ids }
  }

  /** Resumes the attacker's own saved quiz from its session page; captures that request. */
  const captureSession = async (page: Page): Promise<Captured> => {
    const own = await seedSaved(attackerUserId, attacker)
    const url = `${BASE_URL}/app/quiz/session/${own}`
    const watch = watchServerActions(page)
    await page.goto(url)
    await page.getByRole('button', { name: 'Resume' }).click()
    await expect.poll(() => watch.headers() !== undefined, { timeout: 15_000 }).toBe(true)
    // CONTROL: the page's own request revived the attacker's saved row.
    await expect.poll(async () => (await readRow(own)).saved_at, { timeout: 15_000 }).toBeNull()
    const ids = await watch.settle()
    const headers = watch.headers()
    if (!headers) throw new Error('no session-page Server Action captured')
    expect(headers['next-action']).toBe(ids.get('resumeSavedQuizAndRefresh'))
    return { url, headers, ids }
  }

  test.beforeAll(async ({ browser }) => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    victimUserId = seed.victimUserId
    attackerUserId = seed.attackerUserId
    attacker = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    victim = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
    ;[q1, q2] = await loadQuestionIds()
    ctx = await browser.newContext({ storageState: undefined })
    await ctx.addCookies([
      { name: CONSENT_COOKIE, value: buildConsentCookieValue(attackerUserId), url: BASE_URL },
    ])
    const page = await ctx.newPage()
    page.on('dialog', (d) => void d.accept())
    await signInViaForm(page, { email: ATTACKER_EMAIL, password: ATTACKER_PASSWORD })
    listCap = await captureList(page)
    sessionCap = await captureSession(page)
    await page.close()
  })

  const cleanup = async () => {
    const errors: string[] = []
    try {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ saved_at: null })
        .eq('config->>e2e_marker', E2E_REDTEAM_IV_MARKER)
        .not('saved_at', 'is', null)
        .select('id')
      if (error) throw new Error(`unsave: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.info(`[saved-refresh] unsaved ${data?.length}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('config->>e2e_marker', E2E_REDTEAM_IV_MARKER)
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`soft-delete: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.info(`[saved-refresh] soft-deleted ${data?.length}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    // quiz_drafts is hard-delete by design (docs/database.md §3).
    try {
      const { data, error } = await admin
        .from('quiz_drafts')
        .delete()
        .eq('session_config->>subjectName', E2E_REDTEAM_IV_MARKER)
        .select('id')
      if (error) throw new Error(`drafts: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.info(`[saved-refresh] deleted ${data?.length} draft(s)`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    return errors
  }

  test.afterEach(async () => {
    const errors = await cleanup()
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  // A failed beforeAll skips every afterEach; its seeded rows must not outlive the file.
  test.afterAll(async () => {
    const errors = await cleanup()
    try {
      await ctx?.close()
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
  })

  test('IV: a victim saved quiz is not deleted through discardSavedQuizAndRefresh', async () => {
    const victimSaved = await seedSaved(victimUserId, victim)
    const before = await readRow(victimSaved)
    expect(before.saved_at).not.toBeNull()

    const res = await invoke(listCap, 'discardSavedQuizAndRefresh', { sessionId: victimSaved })
    expect(res).not.toContain('"success":true')
    expect(await readRow(victimSaved)).toEqual(before)

    // CONTROL: the same replay clears the attacker's own saved marker.
    const own = await seedSaved(attackerUserId, attacker)
    expect((await readRow(own)).saved_at).not.toBeNull()
    const ownRes = await invoke(listCap, 'discardSavedQuizAndRefresh', { sessionId: own })
    expect(ownRes).toContain('"success":true')
    expect((await readRow(own)).saved_at).toBeNull()
  })

  test('IW: a victim draft survives deleteDraftAndRefresh', async () => {
    const victimDraft = await seedDraft(victimUserId)
    expect(await draftExists(victimDraft)).toBe(true)

    await invoke(listCap, 'deleteDraftAndRefresh', { draftId: victimDraft })
    expect(await draftExists(victimDraft)).toBe(true)

    // CONTROL: the same replay deletes the attacker's own draft.
    const own = await seedDraft(attackerUserId)
    expect(await draftExists(own)).toBe(true)
    const ownRes = await invoke(listCap, 'deleteDraftAndRefresh', { draftId: own })
    expect(ownRes).toContain('"success":true')
    expect(await draftExists(own)).toBe(false)
  })

  test('IX: a victim saved quiz is not resumed through resumeSavedQuizAndRefresh', async () => {
    const victimSaved = await seedSaved(victimUserId, victim)
    const before = await readRow(victimSaved)
    expect(before.saved_at).not.toBeNull()
    await clearActive(attackerUserId)

    const res = await invoke(sessionCap, 'resumeSavedQuizAndRefresh', {
      sessionId: victimSaved,
      deviceId: DEVICE,
    })
    expect(res).not.toContain('"success":true')
    expect(await readRow(victimSaved)).toEqual(before)

    // CONTROL: the same replay revives the attacker's own saved row.
    const own = await seedSaved(attackerUserId, attacker)
    const ownRes = await invoke(sessionCap, 'resumeSavedQuizAndRefresh', {
      sessionId: own,
      deviceId: DEVICE,
    })
    expect(ownRes).toContain('"success":true')
    expect(await readRow(own)).toEqual({ deleted_at: null, saved_at: null, ended_at: null })
  })
})
