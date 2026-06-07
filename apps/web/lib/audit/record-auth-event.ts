import type { createServerSupabaseClient } from '@repo/db/server'
import type { Json } from '@repo/db/types'

type AuthEventType =
  | 'user.password_changed'
  | 'user.password_reset'
  | 'user.deactivated'
  | 'user.created'

type RecordAuthEventOpts = {
  eventType: AuthEventType
  resourceId: string
  /** Log-prefix label for the best-effort failure line, e.g. 'toggleStudentStatus'. */
  context: string
  metadata?: Record<string, Json>
}

/**
 * Best-effort audit write via the `record_auth_event` RPC. A failed audit is logged
 * (`[<context>] Audit event failed:`) and swallowed, so the caller's primary mutation
 * is not surfaced as failed because of an audit-log miss.
 *
 * Never throws as long as the Supabase client honours the supabase-js v2 `{ error }`
 * contract (query errors are returned, not thrown) — matching every other `.rpc()`
 * helper in `lib/`; we intentionally do not add a try/catch to diverge from that.
 */
export async function recordAuthEvent(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  { eventType, resourceId, context, metadata }: RecordAuthEventOpts,
): Promise<void> {
  const args = metadata
    ? { p_event_type: eventType, p_resource_id: resourceId, p_metadata: metadata }
    : { p_event_type: eventType, p_resource_id: resourceId }
  const { error } = await supabase.rpc('record_auth_event', args)
  if (error) {
    console.error(`[${context}] Audit event failed:`, error.message)
  }
}
