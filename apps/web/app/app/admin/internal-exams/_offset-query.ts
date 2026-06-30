import { adminClient } from '@repo/db/admin'

/**
 * The PostgREST query-builder surface used by the admin internal-exams offset
 * queries (`listInternalExamCodes` / `listInternalExamAttempts`). Shared from one
 * module so the two callers don't each redeclare the identical chain shape — the
 * per-file copies tripped Sonar's copy-paste detector.
 *
 * `lte`/`gt` are only used by the codes query; the attempts query simply never
 * calls them, so the wider surface is harmless there.
 */
export type OffsetChainBuilder = {
  select: {
    (cols: string): OffsetChainBuilder
    (cols: string, opts: { count: 'exact'; head: boolean }): OffsetChainBuilder
  }
  eq: (col: string, val: unknown) => OffsetChainBuilder
  is: (col: string, val: null) => OffsetChainBuilder
  not: (col: string, op: string, val: unknown) => OffsetChainBuilder
  lte: (col: string, val: unknown) => OffsetChainBuilder
  gt: (col: string, val: unknown) => OffsetChainBuilder
  order: (col: string, opts: { ascending: boolean }) => OffsetChainBuilder
  range: (from: number, to: number) => OffsetChainBuilder
}

export type OffsetClient = { from: (table: string) => OffsetChainBuilder }

/**
 * adminClient cast to the offset chain surface. Both callers use the service-role
 * client because cross-row `users` embeds return null under the user-scoped client
 * (tenant_isolation RLS also applies to embedded resources).
 */
export const offsetAdminClient = adminClient as unknown as OffsetClient

type QueryContext = { tag: string; failMessage: string }

/**
 * Runs a `head: true, count: 'exact'` select and returns the row count. Logs the raw
 * error server-side and throws a generic message on failure (count-first because
 * PostgREST returns 416 + a null count for an out-of-range `.range()` request).
 */
export async function runOffsetCount(
  builder: OffsetChainBuilder,
  ctx: QueryContext,
): Promise<number> {
  const { count, error } = (await (builder as unknown as PromiseLike<{
    count: number | null
    error: { message: string } | null
  }>)) ?? { count: null, error: null }
  if (error) {
    console.error(`[${ctx.tag}] count error:`, error.message)
    throw new Error(ctx.failMessage)
  }
  return count ?? 0
}

/**
 * Runs a data select and returns the rows as a typed array. Logs the raw error and
 * throws a generic message on failure; a non-array payload degrades to `[]`. The
 * `Array.isArray` guard pairs with the element-type cast (code-style.md §5).
 */
export async function runOffsetRows<T>(
  builder: OffsetChainBuilder,
  ctx: QueryContext,
): Promise<T[]> {
  const { data, error } = (await (builder as unknown as PromiseLike<{
    data: unknown
    error: { message: string } | null
  }>)) ?? { data: null, error: null }
  if (error) {
    console.error(`[${ctx.tag}] DB error:`, error.message)
    throw new Error(ctx.failMessage)
  }
  return Array.isArray(data) ? (data as T[]) : []
}
