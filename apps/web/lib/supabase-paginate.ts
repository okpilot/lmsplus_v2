/**
 * PostgREST's hard cap on rows in a single response — `max_rows` in
 * supabase/config.toml. Exported so callers that must DETECT truncation
 * (see fetchAllRpcRows in lib/supabase-rpc.ts) test against the same literal
 * this module pages by, rather than keeping a second copy in step by hand.
 */
export const POSTGREST_MAX_ROWS = 1000

type CountResult = { count: number | null; error: { message: string } | null }
type PageResult<T> = { data: T[] | null; error: { message: string } | null }

/**
 * Normalise one `.range()` page into fetchAllRows' getPage contract.
 *
 * Any page fetched inside the paging loop lies within `[0, total)` — the count call
 * already reported rows there — so ANY non-array payload is an inconsistency between
 * the count and the page, `null` included. Erroring is the only safe response:
 * coercing to null makes fetchAllRows (`if (data) all.push(...data)`) SKIP the page
 * and return a short list that looks complete, and passing a truthy non-array through
 * makes that same spread throw a raw TypeError from inside the pager. A genuinely
 * empty page is `[]`, which passes and contributes no rows.
 */
export function toPageResult<T>(
  pageData: unknown,
  pageError: { message: string } | null,
  source: string,
): PageResult<T> {
  if (pageError) return { data: null, error: pageError }
  if (!Array.isArray(pageData)) {
    const got = pageData === null ? 'null' : typeof pageData
    return { data: null, error: { message: `${source}: expected an array, got ${got}` } }
  }
  return { data: pageData as T[], error: null }
}

/**
 * Fetch ALL rows for a query that would otherwise truncate at PostgREST's max_rows cap.
 * Counts first (an out-of-range `.range()` returns PostgREST 416, so we must know the total to
 * never request a page past the end), then pages with `.range()` until every row is read.
 *
 * @param getCount builds a `.select('*', { count: 'exact', head: true })` query for the total.
 * @param getPage  builds the same filtered query with a deterministic total order + `.range(from, to)`.
 * @param pageSize must be <= `POSTGREST_MAX_ROWS` (PostgREST's hard cap); defaults to it.
 * @returns always resolves with a non-null `data` array; on any error (count, page, or invalid
 *   pageSize) `data` is `[]` and `error` is non-null — callers never need to null-guard `.data`.
 */
export async function fetchAllRows<T>(
  getCount: () => PromiseLike<CountResult>,
  getPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = POSTGREST_MAX_ROWS,
): Promise<{ data: T[]; error: { message: string } | null }> {
  // Guard before the loop: pageSize <= 0 never advances `from`, hanging the request path;
  // pageSize above the cap silently truncates at PostgREST's max_rows. Fail fast either way.
  if (!Number.isInteger(pageSize) || pageSize <= 0 || pageSize > POSTGREST_MAX_ROWS) {
    return {
      data: [],
      error: { message: `Invalid pageSize: expected integer 1..${POSTGREST_MAX_ROWS}` },
    }
  }

  const { count, error: countError } = await getCount()
  if (countError) return { data: [], error: countError }

  const total = count ?? 0
  const all: T[] = []
  for (let from = 0; from < total; from += pageSize) {
    const to = Math.min(from + pageSize, total) - 1
    const { data, error } = await getPage(from, to)
    // Discard partial pages on error: a half-fetched set is worse than an empty one —
    // callers treat an errored read as a failed (empty) section + log it, so returning the
    // accumulated rows would masquerade as a complete result (e.g. a silently truncated
    // GDPR export). Completeness is all-or-nothing per read.
    if (error) return { data: [], error }
    if (data) all.push(...data)
  }
  return { data: all, error: null }
}
