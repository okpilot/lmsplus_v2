const TOKEN_PARAM = /([?&#]token_hash=)[^&#]*/g
const URL_FIELDS = ['url', 'to', 'from'] as const

/** Sentry `beforeBreadcrumb`: filters the one-time `token_hash` out of breadcrumb URLs. */
export function scrubBreadcrumbTokens<T extends { data?: Record<string, unknown> }>(
  breadcrumb: T,
): T {
  const data = breadcrumb.data
  if (!data) return breadcrumb
  const scrubbed = { ...data }
  for (const field of URL_FIELDS) {
    const value = scrubbed[field]
    if (typeof value === 'string') scrubbed[field] = value.replace(TOKEN_PARAM, '$1[Filtered]')
  }
  return { ...breadcrumb, data: scrubbed }
}
