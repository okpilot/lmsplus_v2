import { isRedirectError } from 'next/dist/client/components/redirect-error'

/**
 * Re-throw Next.js redirect errors so they propagate through catch blocks.
 * Wraps an undocumented internal import in a single location.
 */
export function rethrowRedirect(error: unknown): void {
  if (isRedirectError(error)) throw error
}
