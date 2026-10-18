/**
 * Red-team: admin render gate after the proxy role check was removed (#1536).
 *
 * Vector IL — partial-render bypass of `app/app/admin/layout.tsx`. A client
 * soft-navigation RSC request carries `Next-Router-State-Tree`; Next renders only
 * the segments below the deepest layout that tree claims is mounted. A forged
 * tree claiming the admin layout is mounted makes the page's own
 * `requireAdmin()` the sole gate. Control arms: the forged request omits the
 * `/app` shell (proves the layouts were skipped) and an admin's forged request
 * still carries the page marker (proves the page rendered on that path).
 *
 * Vector IM — a soft-deleted admin with a live token. `requireAdmin()`'s
 * `deleted_at IS NULL` profile read is the only render gate left. Control arm:
 * the same session receives admin markup before the soft-delete.
 */
import { type Browser, type BrowserContext, expect, test } from '@playwright/test'
import { buildConsentCookieValue } from '../../lib/consent/check-consent'
import { CONSENT_COOKIE } from '../../lib/consent/versions'
import { getAdminClient } from '../helpers/supabase'
import { getEgmontOrgId, upsertUser } from './helpers/seed-core'
import {
  E2E_REDTEAM_IM_SOFTDEL_ADMIN_EMAIL,
  E2E_REDTEAM_IM_SOFTDEL_ADMIN_PASSWORD,
} from './helpers/seed-markers'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamAdmin,
  seedRedTeamInstructor,
  seedRedTeamUsers,
} from './helpers/seed-users'

const BASE_URL = 'http://localhost:3000'
const VICTIM_FULL_NAME = 'Red Team redteam-victim'
const ATTACKER_SHELL_NAME = 'Red Team redteam-attacker'

type Credentials = { email: string; password: string; userId: string }
type Target = { path: string; marker: string; mountedFrom: string[] }

async function signIn(browser: Browser, creds: Credentials): Promise<BrowserContext> {
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

/** FlightRouterState claiming `segments` (under /app/admin) is the mounted page. */
function forgedTree(segments: string[]): string {
  let node: unknown = ['__PAGE__', {}]
  for (const seg of [...segments].reverse()) node = [seg, { children: node }]
  const tree = ['', { children: ['app', { children: ['admin', { children: node }] }] }]
  return encodeURIComponent(JSON.stringify(tree))
}

async function fetchBody(
  context: BrowserContext,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string; location: string }> {
  let res = await context.request.fetch(path, { headers, maxRedirects: 0, timeout: 90_000 })
  const location = res.headers().location ?? ''
  // Next's cache-busting check answers an RSC request lacking a matching `_rsc` with a 307 to the
  // same path plus `_rsc`; follow that one hop only, with the same headers.
  if (res.status() === 307 && new URL(location, BASE_URL).searchParams.has('_rsc')) {
    res = await context.request.fetch(location, { headers, maxRedirects: 0, timeout: 90_000 })
  }
  return { status: res.status(), body: await res.text(), location: res.headers().location ?? '' }
}

function rscHeaders(mountedFrom?: string[]): Record<string, string> {
  const h: Record<string, string> = { RSC: '1' }
  if (mountedFrom) h['Next-Router-State-Tree'] = forgedTree(mountedFrom)
  return h
}

async function softDeleteUser(userId: string): Promise<void> {
  const { data, error } = await getAdminClient()
    .from('users')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', userId)
    .is('deleted_at', null)
    .select('id')
  if (error) throw new Error(`soft-delete ${userId}: ${error.message}`)
  if ((data?.length ?? 0) > 0) console.log(`[admin-render-gate] soft-deleted ${userId}`)
}

test.describe('admin render gate without the proxy role check', () => {
  test.describe.configure({ mode: 'serial', timeout: 600_000 })

  let targets: Target[] = []
  let adminCreds: Credentials
  let victimUserId = ''

  test.beforeAll(async () => {
    const users = await seedRedTeamUsers()
    victimUserId = users.victimUserId
    const { adminUserId } = await seedRedTeamAdmin()
    adminCreds = { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, userId: adminUserId }
    targets = [
      {
        path: '/app/admin/students?search=redteam-victim',
        marker: VICTIM_FULL_NAME,
        mountedFrom: ['syllabus'],
      },
      {
        path: `/app/admin/dashboard/students/${victimUserId}`,
        marker: VICTIM_FULL_NAME,
        mountedFrom: ['dashboard'],
      },
      { path: '/app/admin/questions', marker: 'Question Editor', mountedFrom: ['syllabus'] },
      { path: '/app/admin/syllabus', marker: 'Syllabus Manager', mountedFrom: ['questions'] },
      { path: '/app/admin/exam-config', marker: 'Exam Configuration', mountedFrom: ['syllabus'] },
      { path: '/app/admin/internal-exams', marker: 'Internal Exams', mountedFrom: ['syllabus'] },
    ]
  })

  test('IL: a non-admin never receives admin page output, including via a forged router state tree that skips the admin layout', async ({
    browser,
  }) => {
    const { attackerUserId } = await seedRedTeamUsers()
    const instructor = await seedRedTeamInstructor()
    const adminCtx = await signIn(browser, adminCreds)
    const studentCtx = await signIn(browser, {
      email: ATTACKER_EMAIL,
      password: ATTACKER_PASSWORD,
      userId: attackerUserId,
    })
    const instructorCtx = await signIn(browser, {
      email: instructor.email,
      password: instructor.password,
      userId: instructor.instructorUserId,
    })
    try {
      for (const t of targets) {
        // Control: the admin's forged partial-render request still renders the page.
        const adminForged = await fetchBody(adminCtx, t.path, rscHeaders(t.mountedFrom))
        expect(adminForged.status, `admin forged RSC ${t.path} -> ${adminForged.location}`).toBe(
          200,
        )
        expect(adminForged.body, `control: admin forged RSC ${t.path} carries marker`).toContain(
          t.marker,
        )

        // Control: the forged tree skips the /app shell; the unforged RSC request renders it.
        const studentFull = await fetchBody(studentCtx, t.path, rscHeaders())
        expect(studentFull.body, `control: full RSC ${t.path} renders the /app shell`).toContain(
          ATTACKER_SHELL_NAME,
        )
        const studentForged = await fetchBody(studentCtx, t.path, rscHeaders(t.mountedFrom))
        expect(studentForged.body, `control: forged RSC ${t.path} skips the layouts`).not.toContain(
          ATTACKER_SHELL_NAME,
        )

        const studentHtml = await fetchBody(studentCtx, t.path)
        for (const [label, res] of [
          ['html', studentHtml],
          ['rsc', studentFull],
          ['forged rsc', studentForged],
        ] as const) {
          expect(res.body, `student ${label} ${t.path} must not carry admin markup`).not.toContain(
            t.marker,
          )
          expect(res.body, `student ${label} ${t.path} carries the requireAdmin redirect`).toMatch(
            /NEXT_REDIRECT;(?:replace|push);\/app\/dashboard;/,
          )
        }

        const instructorForged = await fetchBody(instructorCtx, t.path, rscHeaders(t.mountedFrom))
        expect(instructorForged.body, `instructor forged RSC ${t.path}`).not.toContain(t.marker)
      }
    } finally {
      await adminCtx.close()
      await studentCtx.close()
      await instructorCtx.close()
    }
  })

  test.describe('IM: soft-deleted admin with a live token', () => {
    let throwawayAdminId = ''

    test.afterEach(async () => {
      if (!throwawayAdminId) return
      try {
        await softDeleteUser(throwawayAdminId)
      } finally {
        throwawayAdminId = ''
      }
    })

    test('IM: a soft-deleted admin loses admin page output on the next request', async ({
      browser,
    }) => {
      const admin = getAdminClient()
      const orgId = await getEgmontOrgId(admin)
      throwawayAdminId = await upsertUser(
        admin,
        E2E_REDTEAM_IM_SOFTDEL_ADMIN_EMAIL,
        E2E_REDTEAM_IM_SOFTDEL_ADMIN_PASSWORD,
        orgId,
        'admin',
      )
      // Revive a row a previous run left soft-deleted, so the control arm is reachable.
      const { data: revived, error: reviveError } = await admin
        .from('users')
        .update({ deleted_at: null })
        .eq('id', throwawayAdminId)
        .select('id')
      if (reviveError) throw new Error(`revive throwaway admin: ${reviveError.message}`)
      if (!revived?.length) throw new Error('revive throwaway admin: no row updated')

      const ctx = await signIn(browser, {
        email: E2E_REDTEAM_IM_SOFTDEL_ADMIN_EMAIL,
        password: E2E_REDTEAM_IM_SOFTDEL_ADMIN_PASSWORD,
        userId: throwawayAdminId,
      })
      try {
        const sample = targets.slice(0, 3)
        for (const t of sample) {
          const before = await fetchBody(ctx, t.path, rscHeaders(t.mountedFrom))
          expect(before.body, `control: active admin forged RSC ${t.path}`).toContain(t.marker)
        }
        await softDeleteUser(throwawayAdminId)
        for (const t of sample) {
          for (const headers of [{}, rscHeaders(), rscHeaders(t.mountedFrom)]) {
            const after = await fetchBody(ctx, t.path, headers)
            const label = `soft-deleted admin ${t.path} ${JSON.stringify(Object.keys(headers))}`
            expect(after.status, label).toBe(200)
            expect(after.body, label).toMatch(/NEXT_REDIRECT;(?:replace|push);\/app\/dashboard;/)
            expect(
              after.body,
              `soft-deleted admin ${t.path} ${JSON.stringify(Object.keys(headers))}`,
            ).not.toContain(t.marker)
          }
        }
      } finally {
        await ctx.close()
      }
    })
  })
})
