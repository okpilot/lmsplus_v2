'use client'

import { Suspense, useState } from 'react'
import { BottomTabBar } from './bottom-tab-bar'
import type { SheetState } from './more-sheet'
import { useUser } from './user-context'

function RoleTabBar({ sheet }: Readonly<{ sheet: SheetState }>) {
  return <BottomTabBar userRole={useUser().userRole} sheet={sheet} />
}

export function MobileNav() {
  const sheet = useState<string | null>(null)
  return (
    <Suspense fallback={<BottomTabBar sheet={sheet} />}>
      <RoleTabBar sheet={sheet} />
    </Suspense>
  )
}
