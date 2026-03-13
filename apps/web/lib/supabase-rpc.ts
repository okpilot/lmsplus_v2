import type { createServerSupabaseClient } from '@repo/db/server'

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>
type RpcFn = (
  fn: string,
  args: Record<string, unknown>,
) => { then: (fn: (v: { data: unknown; error: { message: string } | null }) => void) => void }

/**
 * Typed wrapper for Supabase RPC calls.
 * Works around generated types resolving to `never` for .rpc() chains.
 */
export async function rpc<TResult>(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: TResult | null; error: { message: string } | null }> {
  const { data, error } = await (supabase as unknown as { rpc: RpcFn }).rpc(fn, args)
  return { data: data as TResult | null, error }
}

type UpsertFn = (
  values: Record<string, unknown>,
  opts?: { onConflict?: string },
) => Promise<{ data: unknown; error: { message: string } | null }>

/**
 * Typed wrapper for Supabase upsert on tables with `never` row types.
 * Throws if the upsert returns a DB error, so callers can rely on try/catch
 * rather than silently dropping failed writes.
 */
export async function upsert(
  supabase: SupabaseClient,
  table: string,
  values: Record<string, unknown>,
  opts?: { onConflict?: string },
) {
  const client = supabase as unknown as {
    from: (t: string) => { upsert: UpsertFn }
  }
  const { error } = await client.from(table).upsert(values, opts)
  if (error) throw new Error(`[upsert:${table}] ${error.message}`)
}
