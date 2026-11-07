/**
 * Red Team Spec — Vector LC (MEDIUM): account enumeration by response time on the
 * password grant that login-form.tsx calls directly.
 *
 * Attack: an unauthenticated caller holding the public anon key posts a wrong password to
 *         `/auth/v1/token?grant_type=password` for a candidate email and times the answer.
 * Defense that SHOULD hold: a registered and an unregistered email answer in comparable time.
 *
 * SKIPPED, accepted residual (Decision 220): GoTrue answers an unregistered email before its
 * bcrypt compare. Measured locally: registered median 47 ms, unregistered 3 ms.
 */

import { randomUUID } from 'node:crypto'
import { type APIRequestContext, expect, test } from '@playwright/test'
import { findAuthUserByEmail } from '../helpers/auth-users'
import {
  ensureLoginTestUser,
  getAdminClient,
  LOGIN_TEST_EMAIL,
  LOGIN_TEST_PASSWORD,
} from '../helpers/supabase'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
// Fresh per run; beforeAll asserts it is absent.
const UNKNOWN_EMAIL = `e2e-redteam-lc-unknown-${randomUUID()}@lmsplus.local`
const WRONG_PASSWORD = 'e2e-redteam-lc-wrong-password'
const SAMPLES = 7
const MAX_MEDIAN_RATIO = 3

type Attempt = { ms: number; status: number; code: unknown }

async function passwordGrant(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<Attempt> {
  const startedAt = performance.now()
  const res = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: ANON_KEY, 'content-type': 'application/json' },
    data: { email, password },
  })
  const ms = performance.now() - startedAt
  const body = (await res.json()) as { error_code?: unknown }
  return { ms, status: res.status(), code: body.error_code }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN
}

test.describe('Vector LC — password grant timing enumeration', () => {
  test.beforeAll(async () => {
    expect(SUPABASE_URL).toMatch(/^http:\/\/(localhost|127\.0\.0\.1):54321/)
    expect(ANON_KEY).not.toBe('')
    await ensureLoginTestUser()
    expect(await findAuthUserByEmail(getAdminClient(), UNKNOWN_EMAIL)).toBeUndefined()
  })

  test.skip('a registered and an unregistered email answer a wrong password in comparable time', async ({
    request,
  }) => {
    // Control arm: LOGIN_TEST_EMAIL is registered and signs in.
    const control = await passwordGrant(request, LOGIN_TEST_EMAIL, LOGIN_TEST_PASSWORD)
    expect(control.status).toBe(200)

    const known: Attempt[] = []
    const unknown: Attempt[] = []
    for (let i = 0; i < SAMPLES; i++) {
      known.push(await passwordGrant(request, LOGIN_TEST_EMAIL, WRONG_PASSWORD))
      unknown.push(await passwordGrant(request, UNKNOWN_EMAIL, WRONG_PASSWORD))
    }

    // Status and error code match, so time is the only channel measured below.
    for (const attempt of [...known, ...unknown]) {
      expect({ status: attempt.status, code: attempt.code }).toEqual({
        status: 400,
        code: 'invalid_credentials',
      })
    }

    const knownMedian = median(known.map((a) => a.ms))
    const unknownMedian = median(unknown.map((a) => a.ms))
    // Either direction is a channel.
    expect(
      Math.max(knownMedian, unknownMedian) / Math.min(knownMedian, unknownMedian),
    ).toBeLessThan(MAX_MEDIAN_RATIO)
  })
})
