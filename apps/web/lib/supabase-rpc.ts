import type { createServerSupabaseClient } from '@repo/db/server'
import { fetchAllRows, POSTGREST_MAX_ROWS, toPageResult } from '@/lib/supabase-paginate'

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

// Wider than RpcFn above: the paged path needs `.rpc()` to also accept a third
// `{ count, head }` options argument (for the count-only call) and to return a chainable
// `.order().range()` builder (for the page calls) — RpcFn's plain-thenable shape can't
// express either. Scoped to the getCount/getPage closures in fetchAllRpcRows below.
type RpcChain = {
  order: (col: string, opts: { ascending: boolean; nullsFirst: boolean }) => RpcChain
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>
}
type ChainableRpcFn = {
  rpc: {
    (
      fn: string,
      args: Record<string, unknown>,
      opts: { count: 'exact'; head: true },
    ): PromiseLike<{ count: number | null; error: { message: string } | null }>
    (fn: string, args: Record<string, unknown>): RpcChain
  }
}

/**
 * Count-only probe for the paged fallback.
 *
 * A null count (a count-only response with no parseable Content-Range) must never reach
 * fetchAllRows, which coerces it to 0. This probe runs ONLY because the first unpaged call
 * came back at the cap, so "0 rows" there would skip the paging loop and discard a full
 * page as a successful empty result. An error is returned as-is, so a real count-query
 * failure surfaces its own message rather than being relabelled as a missing count.
 */
async function fetchExactCount(
  client: ChainableRpcFn,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ count: number | null; error: { message: string } | null }> {
  const { count, error } = await client.rpc(fn, args, { count: 'exact', head: true })
  if (error) return { count: null, error }
  if (count === null) {
    return { count: null, error: { message: `${fn}: count query returned no exact count` } }
  }
  return { count, error: null }
}

/**
 * Fetch ALL rows from a set-returning RPC that would otherwise silently truncate at
 * PostgREST's `max_rows` cap (`POSTGREST_MAX_ROWS`) — e.g. an answer-key RPC returning one row per
 * blank/slot/zone across a whole session.
 *
 * Unlike every other `fetchAllRows` caller, this tries ONE unpaged call first instead of
 * always counting-then-paging: the overwhelmingly common case is well under the cap, and
 * a single call keeps the first request's `(fn, args)` shape identical to the pre-paging
 * call site (existing tests assert on it directly). Only when that call returns EXACTLY
 * `POSTGREST_MAX_ROWS` rows — indistinguishable from a truncated result — do we fall back to
 * counting + paging via `fetchAllRows`.
 *
 * The exactly-`POSTGREST_MAX_ROWS` result is DISCARDED rather than reused as page 0: the first call
 * carries no `ORDER BY`, so splicing its rows with ordered, ranged pages could duplicate or
 * drop rows. A legitimate exactly-at-cap result therefore costs one wasteful but CORRECT
 * extra round trip — an acceptable trade for keeping the common path a single request.
 *
 * The first call's payload goes through toPageResult for the same reason its pages do:
 * silently coercing a non-array to [] hands the caller a SUCCESSFUL report with no answer
 * keys — the silent-wrong-result class this helper exists to close. A set-returning RPC
 * serializes an empty result as [], never null or a scalar, so anything else is a contract
 * breach worth surfacing.
 */
export async function fetchAllRpcRows<T>(opts: {
  supabase: SupabaseClient
  fn: string
  args: Record<string, unknown>
  orderColumns: string[]
}): Promise<{ data: T[]; error: { message: string } | null }> {
  const { supabase, fn, args, orderColumns } = opts
  const { data, error } = await rpc<T[]>(supabase, fn, args)
  if (error) return { data: [], error }
  const first = toPageResult<T>(data, null, fn)
  if (first.error) return { data: [], error: first.error }
  const rows = first.data ?? []
  if (rows.length < POSTGREST_MAX_ROWS) return { data: rows, error: null }

  const client = supabase as unknown as ChainableRpcFn
  return fetchAllRows<T>(
    () => fetchExactCount(client, fn, args),
    async (from, to) => {
      let query: RpcChain = client.rpc(fn, args)
      for (const column of orderColumns) {
        query = query.order(column, { ascending: true, nullsFirst: true })
      }
      const { data: pageData, error: pageError } = await query.range(from, to)
      return toPageResult<T>(pageData, pageError, fn)
    },
  )
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
