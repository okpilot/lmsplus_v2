const TOKEN_PARAM = /((?:^|[?&#\s]|%3F|%26|%23)token_hash(?:=|%3D))[^&#\s%]*/gi

function scrubTokenParam(s: string): string {
  return s.replace(TOKEN_PARAM, '$1[Filtered]')
}

const TOKEN_KEY = /^token_?hash$/i

function isPlain(value: object): boolean {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function walk(value: unknown, copies: WeakMap<object, unknown>): unknown {
  if (typeof value === 'string') return scrubTokenParam(value)
  if (typeof value !== 'object' || value === null) return value
  if (value instanceof URL || value instanceof URLSearchParams) {
    return scrubTokenParam(value.toString())
  }
  if (!Array.isArray(value) && !isPlain(value)) return value
  if (copies.has(value)) return copies.get(value)
  const copy: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : {}
  copies.set(value, copy)
  for (const [k, v] of Object.entries(value)) {
    const scrubbed = typeof v === 'string' && TOKEN_KEY.test(k) ? '[Filtered]' : walk(v, copies)
    Reflect.set(copy, k, scrubbed)
  }
  return copy
}

/** Deep copy of plain objects/arrays with `token_hash` values filtered out of every string. */
export function scrubTokens<T>(value: T): T {
  return walk(value, new WeakMap()) as T
}

// Shared by client, server and edge: events, streamed spans and breadcrumbs. Also the Vercel Analytics / Speed Insights `beforeSend`.
export const SENTRY_TOKEN_SCRUB = {
  beforeBreadcrumb: scrubTokens,
  beforeSend: scrubTokens,
  beforeSendSpan: scrubTokens,
}
