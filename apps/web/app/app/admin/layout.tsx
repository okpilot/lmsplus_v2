import type { ReactNode } from 'react'
import { requireAdmin } from '@/lib/auth/require-admin'

/**
 * Admin role gate for every `/app/admin/*` render. `requireAdmin()` is React
 * `cache()`d, so the pages and query helpers beneath it reuse this verification.
 * A redirect or throw here propagates; do not wrap it in try/catch (code-style.md §6).
 */
export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireAdmin()
  return children
}
