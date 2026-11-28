/**
 * Red Team Spec: Internal Exams > Attempts filters (Vectors NS, NT, NU, #1777)
 *
 * NS attack: a cross-org admin loads the Attempts tab with an egmont sitting id, an egmont group id
 * and an egmont student's name as `sitting`, `group` and `q` (listInternalExamAttempts reads via the
 * service role).
 * NS expected: no egmont attempt row (its sitting link) in any response.
 * NT attack: the egmont admin's `q` carries a PostgREST `or()` breakout
 * (`",full_name.not.is.null,email.ilike."`).
 * NT expected: the value matches literally, so no row.
 * NU attack: the egmont admin's `q` is a bare LIKE wildcard (`%`, `_`, `\`).
 * NU expected: the wildcard matches literally, so no row.
 * CONTROL: the egmont admin's same `sitting`, `group` and plain-name `q` each list the row; the
 * cross-org admin's page renders the Attempts table.
 *
 * Hermetic: throwaway student; marked subject; sitting carries EXAM_SITTING_E2E_PREFIX; group named
 * with E2E_REDTEAM_ATT_GROUP_PREFIX. afterAll soft-deletes code, session, membership, group, then
 * cleanupSittingFixtures (per-step accumulator).
 */

import { type Browser, type BrowserContext, expect, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { insertPassedSession } from '../../lib/integration-support/passed-session'
import { randomCode } from '../helpers/code-gen'
import { getAdminClient } from '../helpers/supabase'
import {
  cleanupSittingFixtures,
  insertEntry,
  insertMarkedSubject,
  insertSittingRow,
  type SittingTrack,
} from './helpers/exam-sitting-seed'
import { upsertUser } from './helpers/seed-core'
import { E2E_REDTEAM_ATT_GROUP_PREFIX } from './helpers/seed-markers'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  seedCrossOrgAdmin,
  seedRedTeamAdmin,
} from './helpers/seed-users'

type Admin = ReturnType<typeof getAdminClient>

const BASE_URL = 'http://localhost:3000'
const PAGE = '/app/admin/internal-exams'
const MY_STUDENT_EMAIL = 'redteam-my-student@lmsplus.local'
const MY_STUDENT_PASSWORD = 'redteam-my-student-2026!'
const MY_SEARCH = 'redteam-my-student'
const MZ_BREAKOUT = 'zz-no-match",full_name.not.is.null,email.ilike."zz'
const TABLE_MARKER = 'Sitting (UTC)'

async function signIn(
  browser: Browser,
  creds: { email: string; password: string; userId: string },
): Promise<BrowserContext> {
  const context = await browser.newContext({ storageState: undefined })
  const page = await context.newPage()
  await page.goto('/')
  await page.getByLabel('Email address').fill(creds.email)
  await page.getByLabel('Password', { exact: true }).fill(creds.password)
  await Promise.all([
    page.waitForURL(/\/(app\/dashboard|consent)(?:\?.*)?$/, { timeout: 30_000 }),
    page.getByRole('button', { name: 'Sign in' }).click(),
  ])
  await context.addCookies([
    { name: CONSENT_COOKIE, value: buildConsentCookieValue(creds.userId), url: BASE_URL },
  ])
  await page.close()
  return context
}

async function attemptsHtml(ctx: BrowserContext, params: Record<string, string>) {
  const qs = new URLSearchParams({ tab: 'attempts', ...params }).toString()
  const res = await ctx.request.get(`${BASE_URL}${PAGE}?${qs}`, { timeout: 90_000 })
  expect(res.status(), `GET ${qs}`).toBe(200)
  return res.text()
}

async function softDelete(
  admin: Admin,
  table: string,
  id: string,
  extra: Record<string, string> = {},
): Promise<void> {
  const { error } = await admin
    .from(table)
    .update({ deleted_at: new Date().toISOString(), ...extra })
    .eq('id', id)
    .is('deleted_at', null)
  if (error) throw new Error(`${table}: ${error.message}`)
}

test.describe('Red Team: Attempts tab filters scope (NS, NT, NU)', () => {
  test.setTimeout(240_000)

  let admin: Admin
  let egmont: { adminUserId: string; orgId: string }
  let cross: { adminUserId: string; email: string; password: string }
  let sittingId: string
  let groupId = ''
  let memberId = ''
  let sessionId = ''
  let codeId = ''
  const track: SittingTrack = { sittingIds: [], subjectIds: [], adminId: '' }

  test.beforeAll(async () => {
    admin = getAdminClient()
    egmont = await seedRedTeamAdmin()
    cross = await seedCrossOrgAdmin()
    track.adminId = egmont.adminUserId
    const studentId = await upsertUser(admin, MY_STUDENT_EMAIL, MY_STUDENT_PASSWORD, egmont.orgId)
    const subjectId = await insertMarkedSubject(admin)
    track.subjectIds.push(subjectId)
    const cfg = await admin.from('exam_configs').insert({
      organization_id: egmont.orgId,
      subject_id: subjectId,
      enabled: true,
      total_questions: 10,
      time_limit_seconds: 3600,
      pass_mark: 75,
    })
    if (cfg.error) throw new Error(`exam_configs: ${cfg.error.message}`)
    sittingId = await insertSittingRow(admin, {
      orgId: egmont.orgId,
      adminId: egmont.adminUserId,
      scheduledAt: new Date(Date.now() + 86_400_000),
    })
    track.sittingIds.push(sittingId)
    const entryId = await insertEntry(admin, {
      orgId: egmont.orgId,
      sittingId,
      userId: studentId,
      subjectId,
    })
    sessionId = await insertPassedSession(admin, {
      orgId: egmont.orgId,
      userId: studentId,
      subjectId,
      score: 90,
      endedAt: new Date(Date.now() - 60_000),
    })
    const code = await admin
      .from('internal_exam_codes')
      .insert({
        code: randomCode(),
        organization_id: egmont.orgId,
        issued_by: egmont.adminUserId,
        sitting_entry_id: entryId,
        student_id: studentId,
        subject_id: subjectId,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        consumed_at: new Date().toISOString(),
        consumed_session_id: sessionId,
      })
      .select('id')
      .single()
    if (code.error || !code.data) throw new Error(`code: ${code.error?.message}`)
    codeId = code.data.id
    const group = await admin
      .from('student_groups')
      .insert({
        organization_id: egmont.orgId,
        name: `${E2E_REDTEAM_ATT_GROUP_PREFIX}${crypto.randomUUID().slice(0, 8)}`,
        created_by: egmont.adminUserId,
      })
      .select('id')
      .single()
    if (group.error || !group.data) throw new Error(`group: ${group.error?.message}`)
    groupId = group.data.id
    const member = await admin
      .from('student_group_members')
      .insert({
        organization_id: egmont.orgId,
        group_id: groupId,
        user_id: studentId,
        added_by: egmont.adminUserId,
      })
      .select('id')
      .single()
    if (member.error || !member.data) throw new Error(`member: ${member.error?.message}`)
    memberId = member.data.id
  })

  test.afterAll(async () => {
    const errors: string[] = []
    const by = { deleted_by: egmont.adminUserId }
    const steps: [string, () => Promise<void>][] = [
      [
        'code',
        () => (codeId ? softDelete(admin, 'internal_exam_codes', codeId) : Promise.resolve()),
      ],
      [
        'session',
        () => (sessionId ? softDelete(admin, 'quiz_sessions', sessionId) : Promise.resolve()),
      ],
      [
        'member',
        () =>
          memberId ? softDelete(admin, 'student_group_members', memberId, by) : Promise.resolve(),
      ],
      [
        'group',
        () => (groupId ? softDelete(admin, 'student_groups', groupId, by) : Promise.resolve()),
      ],
      ['sitting fixtures', () => cleanupSittingFixtures(admin, track)],
    ]
    for (const [label, run] of steps) {
      try {
        await run()
      } catch (e) {
        errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (errors.length > 0) throw new Error(`NS afterAll: ${errors.join('; ')}`)
  })

  test('NS: a cross-org admin cannot list an egmont attempt by sitting, group or search', async ({
    browser,
  }) => {
    const rowLink = `href="${PAGE}/sittings/${sittingId}"`
    const egmontCtx = await signIn(browser, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      userId: egmont.adminUserId,
    })
    const crossCtx = await signIn(browser, {
      email: cross.email,
      password: cross.password,
      userId: cross.adminUserId,
    })
    try {
      const probes: Record<string, string>[] = [
        { sitting: sittingId },
        { group: groupId },
        { q: MY_SEARCH },
      ]
      for (const params of probes) {
        // CONTROL: the owning admin sees the row through the same filter.
        expect(await attemptsHtml(egmontCtx, params), `egmont ${JSON.stringify(params)}`).toContain(
          rowLink,
        )
        const html = await attemptsHtml(crossCtx, params)
        expect(html, `cross ${JSON.stringify(params)} renders the table`).toContain(TABLE_MARKER)
        expect(html, `cross ${JSON.stringify(params)}`).not.toContain(rowLink)
      }
    } finally {
      await egmontCtx.close()
      await crossCtx.close()
    }
  })

  test('NT: a search value cannot break out of the PostgREST or() filter', async ({ browser }) => {
    const rowLink = `href="${PAGE}/sittings/${sittingId}"`
    const ctx = await signIn(browser, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      userId: egmont.adminUserId,
    })
    try {
      // CONTROL: the plain name matches inside the same sitting filter.
      expect(await attemptsHtml(ctx, { sitting: sittingId, q: MY_SEARCH })).toContain(rowLink)
      const html = await attemptsHtml(ctx, { sitting: sittingId, q: MZ_BREAKOUT })
      expect(html).toContain('No attempts match these filters.')
      expect(html).not.toContain(rowLink)
    } finally {
      await ctx.close()
    }
  })

  test('NU: a LIKE wildcard in search matches literally', async ({ browser }) => {
    const rowLink = `href="${PAGE}/sittings/${sittingId}"`
    const ctx = await signIn(browser, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      userId: egmont.adminUserId,
    })
    try {
      // CONTROL: the plain name matches inside the same sitting filter.
      expect(await attemptsHtml(ctx, { sitting: sittingId, q: MY_SEARCH })).toContain(rowLink)
      for (const q of ['%', '_', '\\']) {
        const html = await attemptsHtml(ctx, { sitting: sittingId, q })
        expect(html, `q=${q}`).toContain('No attempts match these filters.')
        expect(html, `q=${q}`).not.toContain(rowLink)
      }
    } finally {
      await ctx.close()
    }
  })
})
