import { createClient } from '@supabase/supabase-js'
import type { getAdminClient } from './supabase'

/**
 * Find an auth user by email, paging through the full admin list. The admin API
 * returns 50 users/page by default; the e2e and red-team specs accumulate
 * users across runs, so a single unpaginated listUsers() would miss
 * any email past page 1 — the caller would then re-create it and hit an
 * "already registered" error. Pages until the email is found or exhausted.
 */
const AUTH_USERS_PER_PAGE = 200
/** An API returning full pages forever would otherwise hang the spec's beforeAll. */
const MAX_AUTH_USER_PAGES = 50

export async function findAuthUserByEmail(admin: ReturnType<typeof getAdminClient>, email: string) {
  for (let page = 1; page <= MAX_AUTH_USER_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: AUTH_USERS_PER_PAGE })
    if (error) throw new Error(`Could not list users: ${error.message}`)
    const match = data.users.find((u) => u.email === email)
    if (match) return match
    if (data.users.length < AUTH_USERS_PER_PAGE) return undefined
  }
  throw new Error(
    `No short page after ${MAX_AUTH_USER_PAGES} listUsers pages — possible API paging bug`,
  )
}

/**
 * True if the password signs in, false on invalid_credentials; anything else
 * (429, 5xx, network) throws. Probing avoids a reset, which revokes every
 * session of the account (#1146).
 */
export async function passwordAuthenticates(email: string, password: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!anonKey) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required for E2E tests')
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (!error) return true
  if (error.code === 'invalid_credentials') return false
  throw new Error(`passwordAuthenticates: ${error.message}`)
}
