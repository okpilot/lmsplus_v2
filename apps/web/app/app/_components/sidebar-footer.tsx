'use client'

import { usePathname } from 'next/navigation'
import { isActivePath, SETTINGS_ITEM } from './nav-items'
import { SidebarItem } from './sidebar-item'
import { SignOutButton } from './sign-out-button'
import { ThemeRow } from './theme-row'
import { UserChip } from './user-chip'

export function SidebarFooter({ displayName }: Readonly<{ displayName: string }>) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col gap-1 border-t border-foreground/[0.06] pt-3">
      {SETTINGS_ITEM && (
        <SidebarItem item={SETTINGS_ITEM} active={isActivePath(pathname, SETTINGS_ITEM.href)} />
      )}
      <ThemeRow />
      <SignOutButton variant="row" />
      <UserChip displayName={displayName} />
    </div>
  )
}
