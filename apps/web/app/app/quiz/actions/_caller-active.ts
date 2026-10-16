import type { createServerSupabaseClient } from '@repo/db/server'

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

/**
 * 'active' when the caller can see their own users row. users_select hides deactivated
 * accounts (`deleted_at IS NULL`), so no visible row ('inactive') means RLS refuses the
 * caller's writes silently (0 rows, no error). A failed lookup is 'error' and is logged.
 */
export async function callerStatus(
  supabase: ServerSupabaseClient,
  userId: string,
  tag: string,
): Promise<'active' | 'inactive' | 'error'> {
  const { data, error } = await supabase.from('users').select('id').eq('id', userId).maybeSingle()
  if (error) {
    console.error(`[${tag}] Caller lookup error:`, error.message, error.code)
    return 'error'
  }
  return data === null ? 'inactive' : 'active'
}

/**
 * Resolves a write that changed zero rows: `whenActive` for an active caller (the row
 * was already gone), `whenInactive` when RLS refused a deactivated caller's write,
 * `whenError` (default `whenInactive`) when the caller lookup itself failed.
 */
export async function resolveZeroRowWrite<T, F, E = F>(
  supabase: ServerSupabaseClient,
  opts: { userId: string; tag: string; whenActive: T; whenInactive: F; whenError?: E },
): Promise<T | F | E> {
  const status = await callerStatus(supabase, opts.userId, opts.tag)
  if (status === 'active') return opts.whenActive
  if (status === 'error') return 'whenError' in opts ? (opts.whenError as E) : opts.whenInactive
  console.error(`[${opts.tag}] Write refused: caller not active`)
  return opts.whenInactive
}
