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
 * the count and the page, `null` included, and erroring is the only safe response.
 *
 * fetchAllRows now routes every page through this function, so the rejection happens
 * once whether or not a caller wraps its own getPage. Callers still wrap when they want
 * the error to NAME them — this takes a `source`, while the pager can only report the
 * page range. A genuinely empty page is `[]`, which passes THIS function's array check —
 * fetchAllRows still rejects it if the range it covers expected any rows.
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

// Discriminated on `error` so a caller that checks it narrows `total` to a number — the reason
// this is a union rather than `{ total: number | null }`, which would push a `?? 0` back onto
// the call site and reinstate the very coercion resolveTotal exists to remove.
type TotalResult = { total: number; error: null } | { total: null; error: { message: string } }

/**
 * Resolve the exact row total that bounds the paging loop.
 *
 * A null count is a count response carrying no parseable Content-Range, never a legitimate
 * "0 rows" — PostgREST answers an exact count over an empty set with a Content-Range whose
 * total is 0. Coercing null to 0 would skip the loop and hand back an empty list as a SUCCESS,
 * indistinguishable from a genuinely empty table.
 *
 * Mirrors `fetchExactCount` (lib/supabase-rpc.ts), which makes the same call for the RPC pager
 * and names the RPC in its message. A real count error is returned as-is, so a count-query
 * failure surfaces its own message rather than being relabelled as a missing count.
 */
async function resolveTotal(getCount: () => PromiseLike<CountResult>): Promise<TotalResult> {
  const { count, error } = await getCount()
  if (error) return { total: null, error }
  if (count === null) {
    return { total: null, error: { message: 'fetchAllRows: count query returned no exact count' } }
  }
  return { total: count, error: null }
}

/**
 * A SHORT page is the same count/page disagreement as a null one: the count already reported
 * rows across [from, to], so a successful page returning fewer than that range holds is an
 * inconsistent read, not an empty one. Accepting it returns a truncated set with `error: null`
 * — the silently-complete-looking result (#668/#673) this pager exists to prevent. Fail the
 * read instead; let the caller decide whether to retry.
 *
 * @returns the error to fail the read with, or `null` when the page is the expected size.
 */
function checkPageCardinality(
  rowCount: number,
  from: number,
  to: number,
): { message: string } | null {
  const expected = to - from + 1
  if (rowCount === expected) return null
  return {
    message: `fetchAllRows page [${from}, ${to}]: expected ${expected} rows, got ${rowCount}`,
  }
}

/**
 * Fetch ALL rows for a query that would otherwise truncate at PostgREST's max_rows cap.
 * Counts first (an out-of-range `.range()` returns PostgREST 416, so we must know the total to
 * never request a page past the end), then pages with `.range()` until every row is read.
 *
 * @param getCount builds a `.select('*', { count: 'exact', head: true })` query for the total.
 * @param getPage  builds the same filtered query with a deterministic total order + `.range(from, to)`.
 * @param pageSize must be <= `POSTGREST_MAX_ROWS` (PostgREST's hard cap); defaults to it.
 * @returns resolves with a non-null `data` array; on any error `data` is `[]` and `error`
 *   is non-null — callers never need to null-guard `.data`. "Error" covers an invalid pageSize, a
 *   failed count, a count reporting no exact total, a failed page, a page whose payload is not
 *   an array, and a page whose row count differs from the range it covers. That contract covers RESOLVED results only: if `getCount` or `getPage` REJECTS
 *   (a transport fault, or a thunk that throws), the rejection PROPAGATES out of this function
 *   rather than being normalized into `error`. That is deliberate: how a transport fault should
 *   surface differs by caller chain, so this helper does not decide it.
 *   Three of those are newly rejected. A short page — fewer rows than its range holds — used
 *   to be spread as-is, quietly truncating the result; it is now the same count/page
 *   disagreement as a null page. A count reporting no exact total used to become
 *   `total = 0`, so the loop never ran and an incomplete read came back as a success. A non-array
 *   page met only a bare truthiness check, whose outcome varied by value: falsy was skipped,
 *   quietly shortening the result, while anything truthy was spread — raising a `TypeError` out of
 *   the pager when it was not iterable, and silently decomposing it into elements when it was. An
 *   invalid pageSize, a failed count and a failed page each short-circuited before, and are
 *   unchanged.
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

  const counted = await resolveTotal(getCount)
  if (counted.error !== null) return { data: [], error: counted.error }

  const total = counted.total
  const all: T[] = []
  for (let from = 0; from < total; from += pageSize) {
    const to = Math.min(from + pageSize, total) - 1
    const { data, error } = await getPage(from, to)
    // toPageResult passes a real page error through unchanged and turns any non-array
    // payload — `null` included — into one, so it covers both rejection paths here.
    const page = toPageResult<T>(data, error, `fetchAllRows page [${from}, ${to}]`)
    // Discard partial pages on error: callers treat an errored read as a failed (empty)
    // section + log it, so returning the accumulated rows would masquerade as a complete
    // result (e.g. a silently truncated GDPR export). Completeness is all-or-nothing per read.
    if (page.error) return { data: [], error: page.error }
    const rows = page.data ?? []
    const shortPage = checkPageCardinality(rows.length, from, to)
    if (shortPage !== null) return { data: [], error: shortPage }
    all.push(...rows)
  }
  return { data: all, error: null }
}
