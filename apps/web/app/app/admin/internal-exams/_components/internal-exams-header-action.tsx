'use client'

import { Plus } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button-variants'

/** The page's one primary action; shown on the Sittings tab only. */
export function InternalExamsHeaderAction() {
  const sp = useSearchParams()
  const pathname = usePathname()
  const tab = sp.get('tab')
  if (tab !== 'sittings') return null
  const params = new URLSearchParams(sp.toString())
  params.set('tab', 'sittings')
  params.set('dlg', 'new')
  return (
    <Link href={`${pathname}?${params.toString()}`} scroll={false} className={buttonVariants()}>
      <Plus className="size-icon" />
      New sitting
    </Link>
  )
}
