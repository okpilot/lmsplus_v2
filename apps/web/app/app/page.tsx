import { redirect } from 'next/navigation'

/**
 * `/app` has no UI of its own. It exists so the bare path lands on the dashboard
 * instead of Next's built-in 404 (#1170).
 *
 * No admin gate is needed: `/app` is not an admin prefix, and `proxy.ts` bounces
 * unauthenticated traffic before this renders. The proxy is the guard — NOT
 * `app/app/layout.tsx`, which checks auth only and disclaims being access control
 * in its own comment, and which Next renders concurrently with its pages rather
 * than as a gate in front of them.
 */
export default function AppIndexPage() {
  redirect('/app/dashboard')
}
