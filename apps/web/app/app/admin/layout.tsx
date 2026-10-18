import type { ReactNode } from 'react'
import { requireAdmin } from '@/lib/auth/require-admin'

/**
 * Admin role check for the segment. Each `page.tsx` keeps its own `requireAdmin()` because
 * layout and page render in one flight; `cache()` shares one verification. A redirect or
 * throw here propagates; do not wrap it in try/catch (code-style.md §6).
 */
export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireAdmin()
  return children
}
