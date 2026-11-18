'use client'

import { MoreHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Menu, MenuContent, MenuTrigger } from '@/components/ui/menu'

type Props = {
  /** Accessible name, e.g. "Actions for Anna Novak". */
  label: string
  /** MenuItem / MenuSeparator children. */
  children: ReactNode
}

/** The one "⋯" button in a row's last cell. */
export function RowMenu({ label, children }: Readonly<Props>) {
  return (
    <Menu>
      <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} />}>
        <MoreHorizontal className="size-icon" />
      </MenuTrigger>
      <MenuContent>{children}</MenuContent>
    </Menu>
  )
}
