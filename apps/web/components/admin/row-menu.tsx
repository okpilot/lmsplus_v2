'use client'

import { MoreHorizontal } from 'lucide-react'
import type { ReactNode, Ref } from 'react'
import { Button } from '@/components/ui/button'
import { Menu, MenuContent, MenuTrigger } from '@/components/ui/menu'

type Props = {
  /** Accessible name, e.g. "Actions for Anna Novak". */
  label: string
  /** MenuItem / MenuSeparator children. */
  children: ReactNode
  /** Ref to the trigger button, e.g. to return focus to it after a dialog. */
  triggerRef?: Ref<HTMLButtonElement>
}

/** The one "⋯" button in a row's last cell. */
export function RowMenu({ label, children, triggerRef }: Readonly<Props>) {
  return (
    <Menu>
      <MenuTrigger
        render={<Button ref={triggerRef} variant="ghost" size="icon-sm" aria-label={label} />}
      >
        <MoreHorizontal className="size-icon" />
      </MenuTrigger>
      <MenuContent>{children}</MenuContent>
    </Menu>
  )
}
