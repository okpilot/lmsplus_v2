import { createServerSupabaseClient } from '@repo/db/server'
import { cache } from 'react'
import { verifySessionUser } from '@/lib/auth/verify-session-user'

/** The caller's verified identity, memoized per server request (React `cache()`). */
export const getSessionUser = cache(async () =>
  verifySessionUser(await createServerSupabaseClient()),
)
