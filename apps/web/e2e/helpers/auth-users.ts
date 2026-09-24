import type { getAdminClient } from './supabase'

/**
 * Find an auth user by email, paging through the full admin list. The admin API
 * returns 50 users/page by default; the e2e and red-team specs accumulate
 * users across runs, so a single unpaginated listUsers() would miss
 * any email past page 1 — the caller would then re-create it and hit an
 * "already registered" error. Pages until the email is found or exhausted.
 */
const AUTH_USERS_PER_PAGE = 200

export async function findAuthUserByEmail(admin: ReturnType<typeof getAdminClient>, email: string) {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: AUTH_USERS_PER_PAGE })
    if (error) throw new Error(`Could not list users: ${error.message}`)
    const match = data.users.find((u) => u.email === email)
    if (match) return match
    if (data.users.length < AUTH_USERS_PER_PAGE) return undefined
  }
}
