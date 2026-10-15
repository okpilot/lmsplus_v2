import { createServerSupabaseClient } from '@repo/db/server'
import { cache } from 'react'
import { verifySessionUser } from '@/lib/auth/verify-session-user'

/** The caller's verified identity, memoized per render; a Server Action re-verifies on every call. */
export const getSessionUser = cache(async () =>
  verifySessionUser(await createServerSupabaseClient()),
)
