import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/require-admin'

/**
 * `/app/admin` has no UI of its own. It exists so the bare path lands somewhere
 * usable instead of Next's built-in 404 (#1170). `/app/admin/dashboard` is the
 * admin home: the first `ADMIN_NAV_ITEMS` entry, and the target the other admin
 * surfaces already bounce to.
 *
 * `requireAdmin()` here is required because `app/app/admin/layout.tsx` (Layer 1,
 * docs/security.md) does not gate its sibling page; `cache()` makes the second call free. It gates the RENDER path only —
 * this page also makes `/app/admin` a valid Server Action POST target. That path is
 * gated by the invariant every admin Server Action already carries: each one calls
 * `requireAdmin()` itself (docs/security.md Layer 2).
 *
 * No try/catch here: `requireAdmin()`'s redirects and the one below both work by
 * throwing, and catching would convert them into a 500 (code-style.md §6).
 */
export default async function AdminIndexPage() {
  await requireAdmin()
  redirect('/app/admin/dashboard')
}
