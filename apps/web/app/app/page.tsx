import { redirect } from 'next/navigation'

/**
 * `/app` has no UI of its own. It exists so the bare path lands on the dashboard
 * instead of Next's built-in 404 (#1170).
 *
 * No admin gate is needed: `/app` is not an admin prefix, `proxy.ts` bounces
 * unauthenticated traffic before this renders, and the redirect target
 * `/app/dashboard` is itself gated by `app/app/layout.tsx`. (The proxy is the
 * guard HERE, not the layout — a layout and its page render concurrently, so a
 * layout is not a sequential gate on its own page.)
 */
export default function AppIndexPage() {
  redirect('/app/dashboard')
}
