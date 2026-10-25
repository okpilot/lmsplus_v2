/**
 * Red Team Spec — `GET /auth/signout` (#1608, Decision 153).
 *
 *   JW  forced logout of an ACTIVE student: a cross-site top-level GET (SameSite=Lax sends the
 *       cookies) to /auth/signout must not end an active session.
 *       CONTROL: the same request after deactivation (Auth ban + users.deleted_at, as
 *       toggle-student-status does it) clears every sb- cookie.
 *   JX  a deactivated student's live session hits an /app document without following redirects
 *       or running JS: the response carries the /auth/signout redirect and no full_name.
 *       CONTROL: the same request while active renders full_name and no sign-out redirect.
 *
 * Hermetic (code-style.md §7): dedicated throwaway student (E2E_REDTEAM_JW_STUDENT_EMAIL); the only
 * mutation is the ban + users.deleted_at, reverted in afterEach. No rows seeded.
 *
 * Status: Expected to PASS.
 */

import { type Browser, type BrowserContext, expect, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { getAdminClient } from '../helpers/supabase'
import { getEgmontOrgId, upsertUser } from './helpers/seed-core'
import {
  E2E_REDTEAM_JW_MARKER,
  E2E_REDTEAM_JW_STUDENT_EMAIL,
  E2E_REDTEAM_JW_STUDENT_PASSWORD,
} from './helpers/seed-markers'

const BASE_URL = 'http://localhost:3000'
const BAN = '876000h'
const SB_PREFIX = 'sb-'
const SIGNOUT_TARGET = '/auth/signout?reason=inactive'
const SHELL_MARKER = `Red Team ${E2E_REDTEAM_JW_STUDENT_EMAIL.split('@')[0]}`

type Admin = ReturnType<typeof getAdminClient>

async function signIn(browser: Browser, userId: string): Promise<BrowserContext> {
  const context = await browser.newContext({ storageState: undefined })
  const page = await context.newPage()
  await page.goto('/')
  await page.getByLabel('Email address').fill(E2E_REDTEAM_JW_STUDENT_EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(E2E_REDTEAM_JW_STUDENT_PASSWORD)
  await Promise.all([
    page.waitForURL(/\/(app\/dashboard|consent)(?:\?.*)?$/, { timeout: 30_000 }),
    page.getByRole('button', { name: 'Sign in' }).click(),
  ])
  await context.addCookies([
    { name: CONSENT_COOKIE, value: buildConsentCookieValue(userId), url: BASE_URL },
  ])
  await page.close()
  return context
}

async function sbCookies(context: BrowserContext): Promise<string[]> {
  return (await context.cookies(BASE_URL))
    .filter((c) => c.name.startsWith(SB_PREFIX))
    .map((c) => c.name)
}

async function getSignout(context: BrowserContext) {
  const res = await context.request.get('/auth/signout?reason=inactive', {
    maxRedirects: 0,
    timeout: 90_000,
    headers: { 'Sec-Fetch-Site': 'cross-site', Referer: 'https://evil.example/' },
  })
  return { status: res.status(), location: new URL(res.headers().location ?? '', BASE_URL) }
}

async function getDocument(context: BrowserContext, path: string) {
  const res = await context.request.get(path, { maxRedirects: 0, timeout: 90_000 })
  return { status: res.status(), body: await res.text(), location: res.headers().location ?? '' }
}

test.describe(`Red Team: /auth/signout deactivation route (JW, JX) ${E2E_REDTEAM_JW_MARKER}`, () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 })

  let admin: Admin
  let studentId = ''
  let deactivated = false

  const setDeactivated = async (on: boolean) => {
    if (on) deactivated = true
    const errors: string[] = []
    const ban = await admin.auth.admin.updateUserById(studentId, {
      ban_duration: on ? BAN : 'none',
    })
    if (ban.error) errors.push(`ban(${on}): ${ban.error.message}`)
    const { data, error } = await admin
      .from('users')
      .update({ deleted_at: on ? new Date().toISOString() : null })
      .eq('id', studentId)
      .select('id')
    if (error) errors.push(`users.deleted_at(${on}): ${error.message}`)
    else if ((data?.length ?? 0) === 0) errors.push(`users.deleted_at(${on}): 0 rows`)
    if (errors.length > 0) throw new Error(errors.join('; '))
    if (!on) deactivated = false
  }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const orgId = await getEgmontOrgId(admin)
    studentId = await upsertUser(
      admin,
      E2E_REDTEAM_JW_STUDENT_EMAIL,
      E2E_REDTEAM_JW_STUDENT_PASSWORD,
      orgId,
    )
    await setDeactivated(false)
  })

  test.afterEach(async () => {
    if (deactivated) await setDeactivated(false)
  })

  test('JW: a cross-site GET /auth/signout does not end an active session; it does end a deactivated one', async ({
    browser,
  }) => {
    const context = await signIn(browser, studentId)
    try {
      expect(await sbCookies(context), 'precondition: signed in').not.toEqual([])

      const active = await getSignout(context)
      expect(active.status).toBe(307)
      expect(active.location.pathname).toBe('/app/dashboard')
      expect(active.location.searchParams.get('error')).toBeNull()
      expect(await sbCookies(context), 'active session cookies kept').not.toEqual([])
      const shell = await getDocument(context, '/app/dashboard')
      expect(shell.status, `active shell -> ${shell.location}`).toBe(200)
      expect(shell.body, 'active session still renders the shell').toContain(SHELL_MARKER)

      await setDeactivated(true)
      const inactive = await getSignout(context)
      expect(inactive.status).toBe(307)
      expect(inactive.location.pathname).toBe('/')
      expect(inactive.location.searchParams.get('error')).toBe('account_inactive')
      expect(await sbCookies(context), 'control: deactivated session cookies cleared').toEqual([])
    } finally {
      await context.close()
    }
  })

  test('JX: a deactivated live session fetching an /app document without following redirects is sent to /auth/signout', async ({
    browser,
  }) => {
    const context = await signIn(browser, studentId)
    try {
      const control = await getDocument(context, '/app/dashboard')
      expect(control.status, `control -> ${control.location}`).toBe(200)
      expect(control.body, 'control: active caller receives the shell').toContain(SHELL_MARKER)
      expect(control.body, 'control: active caller is not sent to sign-out').not.toContain(
        SIGNOUT_TARGET,
      )

      await setDeactivated(true)
      const res = await getDocument(context, '/app/dashboard')
      const redirected = res.body.includes(SIGNOUT_TARGET) || res.location.includes(SIGNOUT_TARGET)
      expect(redirected, `deactivated -> status ${res.status}`).toBe(true)
      expect(res.body, 'deactivated caller receives no shell name').not.toContain(SHELL_MARKER)
    } finally {
      await context.close()
    }
  })
})
