const MAX_LENGTH = 512
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional — rejects control chars a browser/proxy could smuggle into a redirect target
const CONTROL_CHAR = /[\u0000-\u001f\u007f]/
const APP_PATH = /^\/app(\/|$)/
const DEFAULT_DESTINATIONS = new Set(['/app', '/app/dashboard'])
// Parse-only base: never fetched; a raw value resolving to any other origin is rejected.
const PARSE_BASE = 'https://next.invalid'

/** Validates an untrusted post-login `next` redirect target, returning a same-origin `/app/...` path (plus query) or null. */
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_LENGTH) return null
  if (CONTROL_CHAR.test(raw) || raw.includes('\\')) return null

  let url: URL
  try {
    url = new URL(raw, PARSE_BASE)
  } catch {
    return null
  }
  if (url.origin !== PARSE_BASE) return null
  if (!APP_PATH.test(url.pathname)) return null

  const result = url.pathname + url.search
  if (DEFAULT_DESTINATIONS.has(result)) return null

  return result
}
