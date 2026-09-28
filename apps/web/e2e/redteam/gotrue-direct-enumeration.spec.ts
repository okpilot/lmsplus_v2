/**
 * Red Team Spec — Vector FW (MEDIUM): account enumeration through the Auth API
 * directly, around the app's neutral forgot-password flow (Vector FV).
 *
 * Attack: an unauthenticated caller holding the public anon key calls GoTrue's
 *         `/auth/v1/otp` (`create_user: false`) and `/auth/v1/recover` itself,
 *         never touching `requestRecoveryCode`.
 * Defense that SHOULD hold: a registered and an unregistered email get the same
 *         status and body from both endpoints.
 */

import { type APIRequestContext, expect, test } from '@playwright/test'
import { readUserId } from '../helpers/recovery-code'
import { ensureLoginTestUser, LOGIN_TEST_EMAIL } from '../helpers/supabase'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
// Never provisioned; `create_user: false` and `/recover` create no row for it.
const UNKNOWN_EMAIL = 'e2e-redteam-fw-unknown@lmsplus.local'

type Probe = { status: number; body: string }

async function authPost(
  request: APIRequestContext,
  path: string,
  data: Record<string, unknown>,
): Promise<Probe> {
  const res = await request.post(`${SUPABASE_URL}/auth/v1/${path}`, {
    headers: { apikey: ANON_KEY, 'content-type': 'application/json' },
    data,
  })
  return { status: res.status(), body: await res.text() }
}

/** Two back-to-back `/recover` calls; the second lands inside GoTrue's `max_frequency`. */
async function recoverTwice(request: APIRequestContext, email: string): Promise<Probe> {
  await authPost(request, 'recover', { email })
  return authPost(request, 'recover', { email })
}

test.describe('Vector FW — Auth API account enumeration', () => {
  test.beforeAll(async () => {
    expect(SUPABASE_URL).toMatch(/^http:\/\/(localhost|127\.0\.0\.1):54321/)
    expect(ANON_KEY).not.toBe('')
    await ensureLoginTestUser()
  })

  test.skip('/otp without sign-up answers a registered and an unregistered email the same', async ({
    request,
  }) => {
    expect(await readUserId(LOGIN_TEST_EMAIL)).toMatch(/^[0-9a-f-]{36}$/)

    const known = await authPost(request, 'otp', { email: LOGIN_TEST_EMAIL, create_user: false })
    const unknown = await authPost(request, 'otp', { email: UNKNOWN_EMAIL, create_user: false })

    expect(known.status).toBe(200)
    expect(unknown).toEqual(known)
  })

  test.skip('a repeated /recover answers a registered and an unregistered email the same', async ({
    request,
  }) => {
    expect(await readUserId(LOGIN_TEST_EMAIL)).toMatch(/^[0-9a-f-]{36}$/)

    const known = await recoverTwice(request, LOGIN_TEST_EMAIL)
    const unknown = await recoverTwice(request, UNKNOWN_EMAIL)

    expect(unknown.status).toBe(200)
    expect(known).toEqual(unknown)
  })
})
