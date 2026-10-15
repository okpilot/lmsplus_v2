import type { createServerSupabaseClient } from '@repo/db/server'

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

/**
 * True when the caller can see their own users row. users_select hides deactivated
 * accounts (`deleted_at IS NULL`), so no visible row means RLS refuses the caller's
 * writes silently (0 rows, no error). A lookup error fails closed (false) and is logged.
 */
export async function isCallerActive(
  supabase: ServerSupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase.from('users').select('id').eq('id', userId).maybeSingle()
  if (error) {
    console.error('[isCallerActive] Caller lookup error:', error.message, error.code)
    return false
  }
  return data !== null
}

/**
 * Resolves a write that changed zero rows: `whenActive` for an active caller (the row
 * was already gone), `whenInactive` when RLS refused a deactivated caller's write.
 */
export async function resolveZeroRowWrite<T, F>(
  supabase: ServerSupabaseClient,
  opts: { userId: string; tag: string; whenActive: T; whenInactive: F },
): Promise<T | F> {
  if (await isCallerActive(supabase, opts.userId)) return opts.whenActive
  console.error(`[${opts.tag}] Write refused: caller not active`)
  return opts.whenInactive
}
