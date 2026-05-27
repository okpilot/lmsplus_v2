type CountResult = { count: number | null; error: { message: string } | null }
type PageResult<T> = { data: T[] | null; error: { message: string } | null }

/**
 * Fetch ALL rows for a query that would otherwise truncate at PostgREST's max_rows cap (1000).
 * Counts first (an out-of-range `.range()` returns PostgREST 416, so we must know the total to
 * never request a page past the end), then pages with `.range()` until every row is read.
 *
 * @param getCount builds a `.select('*', { count: 'exact', head: true })` query for the total.
 * @param getPage  builds the same filtered query with a deterministic total order + `.range(from, to)`.
 * @param pageSize must be <= 1000 (PostgREST's hard cap); defaults to 1000.
 * @returns always resolves with a non-null `data` array; on any error (count, page, or invalid
 *   pageSize) `data` is `[]` and `error` is non-null — callers never need to null-guard `.data`.
 */
export async function fetchAllRows<T>(
  getCount: () => PromiseLike<CountResult>,
  getPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000,
): Promise<{ data: T[]; error: { message: string } | null }> {
  // Guard before the loop: pageSize <= 0 never advances `from`, hanging the request path;
  // pageSize > 1000 silently truncates at PostgREST's max_rows cap. Fail fast either way.
  if (!Number.isInteger(pageSize) || pageSize <= 0 || pageSize > 1000) {
    return { data: [], error: { message: 'Invalid pageSize: expected integer 1..1000' } }
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
