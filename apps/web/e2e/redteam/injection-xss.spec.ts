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

const MARKER = '[E2E_XSS]'
type Field = 'question_text' | 'explanation_text'

async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/app/dashboard', { timeout: 15_000 })
}

async function assertSanitized(page: Page, scope: Locator): Promise<void> {
  await expect(scope.locator('script')).toHaveCount(0)
  const html = await scope.evaluate((el) => el.outerHTML)
  expect(html).not.toMatch(/\son\w+\s*=/i)
  expect(html).not.toMatch(/(?:href|src)\s*=\s*["']?javascript:/i)
  const pwned = await page.evaluate(() => (window as { __pwned?: boolean }).__pwned === true)
  expect(pwned).toBe(false)
}

async function discardActiveSessions(studentId: string): Promise<void> {
  const { data, error } = await getAdminClient()
    .from('quiz_sessions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('student_id', studentId)
    .is('ended_at', null)
    .is('deleted_at', null)
    .select('id')
  if (error) throw new Error(`discardActiveSessions: ${error.message}`)
  if ((data?.length ?? 0) > 0) console.log(`[injection-xss] discarded ${data?.length} session(s)`)
}

async function pickSubjectAndTopic(orgId: string): Promise<{ subjectId: string; topicId: string }> {
  const { data } = await getAdminClient()
    .from('questions')
    .select('subject_id, topic_id')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .not('topic_id', 'is', null)
    .limit(1)
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
  const tag = `${MARKER} ${args.field} ${args.payload.name} ${Date.now()}`
  const v = args.payload.value
  const { data, error } = await getAdminClient()
    .from('questions')
    .insert({
      organization_id: args.orgId,
      subject_id: args.subjectId,
      topic_id: args.topicId,
      question_number: tag.slice(0, 60),
      question_text: args.field === 'question_text' ? `${tag}\n\n${v}` : `${tag} inert`,
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

async function startStudentSessionFor(qid: string, subjectId: string, topicId: string) {
  const c = await createAuthenticatedClient(TEST_EMAIL, TEST_PASSWORD)
  const { error } = await c.rpc('start_quiz_session', {
    p_mode: 'quick_quiz',
    p_subject_id: subjectId,
    p_topic_id: topicId,
    p_question_ids: [qid],
  })
  expect(error).toBeNull()
}

test.describe('Red Team: OWASP A05 — XSS in cross-user rendering', () => {
  let studentUserId: string
  let orgId: string
  let originalFullName: string

  test.beforeAll(async () => {
    await ensureAdminTestUser()
    const seeded = await ensureTestUser()
    studentUserId = seeded.userId
    orgId = seeded.orgId
    const admin = getAdminClient()
    const { data } = await admin.from('users').select('full_name').eq('id', studentUserId).single()
    originalFullName = (data?.full_name as string) ?? 'E2E Test Student'
  })

  test.afterEach(async () => {
    const admin = getAdminClient()
    await admin.from('users').update({ full_name: originalFullName }).eq('id', studentUserId)
    await discardActiveSessions(studentUserId)
    await cleanupXssQuestions()
  })

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

    async function bootStudentSession(field: Field) {
      const { subjectId, topicId } = await pickSubjectAndTopic(orgId)
      const qid = await seedXssQuestion({
        orgId,
        subjectId,
        topicId,
        authorId: studentUserId,
        field,
        payload,
      })
      await discardActiveSessions(studentUserId)
      await startStudentSessionFor(qid, subjectId, topicId)
    }

    test(`student quiz session sanitizes question_text payload ${payload.name}`, async ({
      page,
    }) => {
      await bootStudentSession('question_text')
      await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
      await page.goto('/app/quiz/session')
      await expect(page.getByText(/Question 1/)).toBeVisible({ timeout: 15_000 })
      await assertSanitized(page, page.locator('main'))
    })

    test(`feedback panel sanitizes explanation_text payload ${payload.name}`, async ({ page }) => {
      await bootStudentSession('explanation_text')
      await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
      await page.goto('/app/quiz/session')
      await expect(page.getByText(/Question 1/)).toBeVisible({ timeout: 15_000 })
      const answerBtns = page.locator('button:has(span.rounded-full)')
      await answerBtns.first().waitFor({ state: 'visible', timeout: 10_000 })
      await answerBtns.first().click()
      await page.getByRole('button', { name: 'Submit Answer' }).first().click()
      await expect(page.getByRole('button', { name: /Next/ })).toBeVisible({ timeout: 10_000 })
      await assertSanitized(page, page.locator('main'))
    })
  }
})
