import type { createServerSupabaseClient } from '@repo/db/server'
import type { Database } from '@repo/db/types'
import { fetchAllRows, POSTGREST_MAX_ROWS, toPageResult } from '@/lib/supabase-paginate'

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>
type Functions = Database['public']['Functions']
type SetofFn = {
  [K in keyof Functions]: Functions[K]['Returns'] extends readonly unknown[] ? K : never
}[keyof Functions]
type RpcArgs<F extends SetofFn> = Functions[F]['Args']
type ArgsField<F extends SetofFn> = [RpcArgs<F>] extends [never]
  ? { args?: undefined }
  : { args: RpcArgs<F> }
type RpcRow<F extends SetofFn> = Functions[F]['Returns'][number]

/**
 * Count-only probe for the paged fallback.
 *
 * A null count (a count-only response with no parseable Content-Range) is never a
 * legitimate "0 rows" — fetchAllRows itself now rejects a null count too, so this check
 * is defence in depth rather than the only guard. It still earns its keep: this probe runs
 * ONLY because the first unpaged call came back at the cap, and its error names the RPC
 * (`${fn}: count query returned no exact count`), where fetchAllRows can only report its own
 * generic message. An error is returned as-is, so a real count-query failure surfaces its
 * own message rather than being relabelled as a missing count.
 */
async function fetchExactCount<F extends SetofFn>(
  supabase: SupabaseClient,
  fn: F,
  args?: RpcArgs<F>,
): Promise<{ count: number | null; error: { message: string } | null }> {
  const { count, error } = await supabase.rpc(fn, args, { count: 'exact', head: true })
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
 * a single call keeps the common path one request. Only when that call returns EXACTLY
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
export async function fetchAllRpcRows<F extends SetofFn>(
  opts: { supabase: SupabaseClient; fn: F; orderColumns: string[] } & ArgsField<F>,
): Promise<{ data: RpcRow<F>[]; error: { message: string } | null }>
export async function fetchAllRpcRows<F extends SetofFn>(opts: {
  supabase: SupabaseClient
  fn: F
  args?: RpcArgs<F>
  orderColumns: string[]
}): Promise<{ data: RpcRow<F>[]; error: { message: string } | null }> {
  const { supabase, fn, args, orderColumns } = opts
  const { data, error } = await supabase.rpc(fn, args)
  if (error) return { data: [], error }
  const first = toPageResult<RpcRow<F>>(data, null, fn)
  if (first.error) return { data: [], error: first.error }
  const rows = first.data ?? []
  if (rows.length < POSTGREST_MAX_ROWS) return { data: rows, error: null }

  return fetchAllRows<RpcRow<F>>(
    () => fetchExactCount(supabase, fn, args),
    async (from, to) => {
      let query = supabase.rpc(fn, args)
      for (const column of orderColumns) {
        query = query.order(column, { ascending: true, nullsFirst: true })
      }
      const { data: pageData, error: pageError } = await query.range(from, to)
      return toPageResult<RpcRow<F>>(pageData, pageError, fn)
    },
  )
}
