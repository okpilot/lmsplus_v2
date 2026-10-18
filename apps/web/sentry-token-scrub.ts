const TOKEN_PARAM = /([?&#]token_hash=)[^&#]*/g
/** Filters the one-time `token_hash` out of a URL string. */
export function scrubTokenParam(value: string): string {
  return value.replace(TOKEN_PARAM, '$1[Filtered]')
}

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
    if (typeof value === 'string') scrubbed[field] = scrubTokenParam(value)
  }
  return { ...breadcrumb, data: scrubbed }
}

/** Sentry `beforeSend` / `beforeSendTransaction`: filters `token_hash` out of `event.request.url`. */
export function scrubEventTokens<T extends { request?: { url?: string } }>(event: T): T {
  const url = event.request?.url
  if (!event.request || typeof url !== 'string') return event
  return { ...event, request: { ...event.request, url: scrubTokenParam(url) } }
}
