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
) => Promise<unknown>

/**
 * Typed wrapper for Supabase upsert on tables with `never` row types.
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
  await client.from(table).upsert(values, opts)
}
