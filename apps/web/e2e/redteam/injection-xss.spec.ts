/**
 * Red Team Spec: OWASP A05 — XSS in cross-user rendering (issue #108)
 *
 * An admin authors malicious markup in student-visible fields (full_name,
 * question_text, explanation_text). Defense expectation: React's default JSX
 * escaping closes plain-text fields; react-markdown drops raw HTML and
 * sanitizes link protocols. This spec catches future refactors that introduce
 * dangerouslySetInnerHTML or unsafe markdown configurations.
 */

import { expect, type Locator, type Page, test } from '@playwright/test'
import {
  ADMIN_TEST_EMAIL,
  ADMIN_TEST_PASSWORD,
  ensureAdminTestUser,
} from '../helpers/admin-supabase'
import { ensureTestUser, getAdminClient, TEST_EMAIL, TEST_PASSWORD } from '../helpers/supabase'
import { XSS_PAYLOADS } from './helpers/payloads'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_XSS_MARKER as MARKER } from './helpers/seed-markers'

type Field = 'question_text' | 'explanation_text'

async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
}

async function assertSanitized(page: Page, scope: Locator): Promise<void> {
  // Liveness check first: if seeded content was silently dropped (e.g.
  // sanitizer too aggressive, payload broke React's render), every other
  // assertion below would pass vacuously. The MARKER prefix is in every
  // seeded field, so it must be visible in the rendered DOM.
  await expect(scope).toContainText(MARKER)
  await expect(scope.locator('script')).toHaveCount(0)

  // Walk actual DOM attributes — NOT the serialized outerHTML. A payload
  // rendered safely as escaped text (e.g. `&lt;img onerror=...&gt;`) still
  // contains "onerror=" in the text node; an outerHTML regex would false-
  // fail on safe content. We only fail on real element attributes.
  const hasUnsafeAttribute = await scope.locator('*').evaluateAll((nodes) =>
    nodes.some((node) => {
      const el = node as Element
      const attrNames = el.getAttributeNames()
      const hasInlineHandler = attrNames.some((name) => /^on\w+/i.test(name))
      const hasUnsafeUrl = ['href', 'src'].some((name) => {
        const value = el.getAttribute(name)
        if (!value) return false
        const normalized = value.trim().toLowerCase()
        return (
          normalized.startsWith('javascript:') ||
          normalized.startsWith('vbscript:') ||
          normalized.startsWith('data:')
        )
      })
      return hasInlineHandler || hasUnsafeUrl
    }),
  )
  expect(
    hasUnsafeAttribute,
    'found unsafe inline handler or javascript:/vbscript:/data: URL in DOM attribute within scope',
  ).toBe(false)

  const pwned = await page.evaluate(() => (window as { __pwned?: boolean }).__pwned === true)
  expect(pwned).toBe(false)
}

async function discardSession(sessionId: string): Promise<void> {
  const { data, error } = await getAdminClient()
    .from('quiz_sessions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', sessionId)
    .is('deleted_at', null)
    .select('id')
  if (error) throw new Error(`discardSession: ${error.message}`)
  if ((data?.length ?? 0) > 0) console.log(`[injection-xss] discarded ${data?.length} session(s)`)
}

async function pickSubjectAndTopic(orgId: string): Promise<{ subjectId: string; topicId: string }> {
  const { data, error } = await getAdminClient()
    .from('questions')
    .select('subject_id, topic_id')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .not('topic_id', 'is', null)
    .limit(1)
  if (error) throw new Error(`pickSubjectAndTopic: ${error.message}`)
  if (!data?.length) throw new Error('no seeded active question with topic in org')
  return { subjectId: data[0].subject_id as string, topicId: data[0].topic_id as string }
}

type SeedArgs = {
  orgId: string
  subjectId: string
  topicId: string
  authorId: string
  field: Field
  payload: { name: string; value: string }
}

async function seedXssQuestion(args: SeedArgs): Promise<string> {
  const admin = getAdminClient()
  const { data: bank, error: bankError } = await admin
    .from('question_banks')
    .select('id')
    .eq('organization_id', args.orgId)
    .is('deleted_at', null)
    .limit(1)
    .single()
  if (bankError || !bank) throw new Error(`seedXssQuestion bank: ${bankError?.message}`)

  const tag = `${MARKER} ${args.field} ${args.payload.name} ${Date.now()}`
  const v = args.payload.value
  const { data, error } = await admin
    .from('questions')
    .insert({
      organization_id: args.orgId,
      bank_id: bank.id,
      subject_id: args.subjectId,
      topic_id: args.topicId,
      question_number: tag.slice(0, 60),
      // Inert branch must NOT contain MARKER — assertSanitized's liveness
      // check is scoped to `main`, so a MARKER in the inert question_text
      // would let the explanation_text test pass even if the feedback
      // panel never renders. The question_number still carries `tag`
      // (and therefore MARKER) for cleanup queries to target.
      question_text: args.field === 'question_text' ? `${tag}\n\n${v}` : 'inert',
      correct_option_id: 'a',
      options: [
        { id: 'a', text: 'opt-a', correct: true },
        { id: 'b', text: 'opt-b', correct: false },
      ],
      explanation_text: args.field === 'explanation_text' ? `${tag}\n\n${v}` : 'inert',
      difficulty: 'medium',
      status: 'active',
      created_by: args.authorId,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seedXssQuestion: ${error?.message}`)
  return data.id as string
}

async function cleanupXssQuestions(): Promise<void> {
  const { data, error } = await getAdminClient()
    .from('questions')
    .update({ deleted_at: new Date().toISOString() })
    .like('question_number', `${MARKER}%`)
    .is('deleted_at', null)
    .select('id')
  if (error) throw new Error(`cleanupXssQuestions: ${error.message}`)
  if ((data?.length ?? 0) > 0) console.log(`[injection-xss] deleted ${data?.length} question(s)`)
}

async function startStudentSessionFor(
  qid: string,
  subjectId: string,
  topicId: string,
): Promise<{ sessionId: string; questionIds: string[] }> {
  const c = await createAuthenticatedClient(TEST_EMAIL, TEST_PASSWORD)
  const { data: sessionId, error } = await c.rpc('start_quiz_session', {
    p_mode: 'quick_quiz',
    p_subject_id: subjectId,
    p_topic_id: topicId,
    p_question_ids: [qid],
  })
  expect(error).toBeNull()
  // Explicit guard, not a bare `as string` cast: if a future change weakens the
  // expect above, a null/non-string sessionId would otherwise propagate silently
  // into seedSessionHandoff and surface as a misleading redirect-to-/app/quiz
  // (looks like a UI bug, not a missing-RPC-return bug). (#636)
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error(
      `startStudentSessionFor: start_quiz_session returned non-string sessionId: ${typeof sessionId}`,
    )
  }
  return { sessionId, questionIds: [qid] }
}

// The /app/quiz/session page reads its session from sessionStorage (handoff
// set by the Start Quiz click on /app/quiz). Calling start_quiz_session via
// RPC creates the DB row but the UI does not hydrate from the server, so we
// inject the handoff payload directly to bypass the UI flow.
async function seedSessionHandoff(
  page: Page,
  userId: string,
  sessionId: string,
  questionIds: string[],
): Promise<void> {
  await page.evaluate(
    ({ userId, sessionId, questionIds }) => {
      sessionStorage.setItem(
        `quiz-session:${userId}`,
        JSON.stringify({ userId, sessionId, questionIds, mode: 'study' }),
      )
    },
    { userId, sessionId, questionIds },
  )
}

test.describe('Red Team: OWASP A05 — XSS in cross-user rendering', () => {
  let studentUserId: string
  let adminUserId: string
  let orgId: string
  let originalFullName: string
  let activeSessionId: string | null = null

  test.beforeAll(async () => {
    const adminSeed = await ensureAdminTestUser()
    adminUserId = adminSeed.userId
    const seeded = await ensureTestUser()
    studentUserId = seeded.userId
    orgId = seeded.orgId
    const admin = getAdminClient()
    const { data, error: fullNameErr } = await admin
      .from('users')
      .select('full_name')
      .eq('id', studentUserId)
      .single()
    if (fullNameErr) throw new Error(`beforeAll: full_name lookup failed: ${fullNameErr.message}`)
    originalFullName = data?.full_name ?? 'E2E Test Student'
  })

  test.afterEach(async () => {
    // Run all three teardown steps independently. If one fails, the others
    // still run — otherwise a single failure leaves shared seed state behind
    // for downstream specs (code-style.md §7 hermiticity).
    const errors: string[] = []
    try {
      const admin = getAdminClient()
      const { data, error } = await admin
        .from('users')
        .update({ full_name: originalFullName })
        .eq('id', studentUserId)
        .select('id')
      if (error) throw new Error(`restore full_name: ${error.message}`)
      if ((data?.length ?? 0) > 0) {
        console.log(`[injection-xss] restored full_name for ${data?.length} user(s)`)
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    try {
      if (activeSessionId) {
        await discardSession(activeSessionId)
      }
    } catch (e) {
      errors.push(`discardSession: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      // finally is load-bearing: a throw above must still reset state so
      // the next test's bootStudentSession opens a clean session.
      activeSessionId = null
    }
    try {
      await cleanupXssQuestions()
    } catch (e) {
      errors.push(`cleanupXssQuestions: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  async function bootStudentSession(
    field: Field,
    payload: { name: string; value: string },
  ): Promise<{ sessionId: string; questionIds: string[] }> {
    // Defense in depth: if the previous afterEach somehow left a session
    // tracked, discard it before opening a new one.
    if (activeSessionId) {
      await discardSession(activeSessionId)
      activeSessionId = null
    }
    const { subjectId, topicId } = await pickSubjectAndTopic(orgId)
    const qid = await seedXssQuestion({
      orgId,
      subjectId,
      topicId,
      authorId: adminUserId,
      field,
      payload,
    })
    const session = await startStudentSessionFor(qid, subjectId, topicId)
    activeSessionId = session.sessionId
    return session
  }

  for (const payload of XSS_PAYLOADS) {
    test(`admin students table escapes student full_name payload ${payload.name}`, async ({
      page,
    }) => {
      const admin = getAdminClient()
      const { error } = await admin
        .from('users')
        .update({ full_name: `${MARKER} ${payload.value}` })
        .eq('id', studentUserId)
      expect(error).toBeNull()
      await loginAs(page, ADMIN_TEST_EMAIL, ADMIN_TEST_PASSWORD)
      await page.goto(`/app/admin/students?search=${encodeURIComponent(MARKER)}`)
      await expect(page.getByRole('heading', { name: 'Student Management' })).toBeVisible()
      const tbody = page.locator('tbody').first()
      await expect(tbody.locator('tr').first()).toBeVisible({ timeout: 10_000 })
      await assertSanitized(page, tbody)
    })

    test(`student quiz session sanitizes question_text payload ${payload.name}`, async ({
      page,
    }) => {
      const { sessionId, questionIds } = await bootStudentSession('question_text', payload)
      await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
      await seedSessionHandoff(page, studentUserId, sessionId, questionIds)
      await page.goto('/app/quiz/session')
      await expect(page.getByText(/Question 1/)).toBeVisible({ timeout: 15_000 })
      await assertSanitized(page, page.locator('main'))
    })

    test(`feedback panel sanitizes explanation_text payload ${payload.name}`, async ({ page }) => {
      const { sessionId, questionIds } = await bootStudentSession('explanation_text', payload)
      await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
      await seedSessionHandoff(page, studentUserId, sessionId, questionIds)
      await page.goto('/app/quiz/session')
      await expect(page.getByText(/Question 1/)).toBeVisible({ timeout: 15_000 })
      const answerBtns = page.locator('button:has(span.rounded-full)')
      await answerBtns.first().waitFor({ state: 'visible', timeout: 10_000 })
      await answerBtns.first().click()
      await page.getByRole('button', { name: 'Submit Answer' }).first().click()
      // Use exact-match regex; bare /Next/ also matches "Open Next.js Dev Tools" in dev mode.
      await expect(page.getByRole('button', { name: /^Next\s*›$/ })).toBeVisible({
        timeout: 10_000,
      })
      await assertSanitized(page, page.locator('main'))
    })
  }
})
