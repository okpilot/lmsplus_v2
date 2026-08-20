import { redirect } from 'next/navigation'

/**
 * `/app` has no UI of its own. It exists so the bare path lands on the dashboard
 * instead of Next's built-in 404 (#1170).
 *
 * No admin gate is needed: `/app` is not an admin prefix, and `proxy.ts` bounces
 * unauthenticated traffic before this renders. (The proxy is the guard here, not
 * `app/app/layout.tsx` — a layout and its page render concurrently, so a layout
 * is not a sequential gate on the page.)
 */
export default function AppIndexPage() {
  redirect('/app/dashboard')
}
