'use client'

import { Suspense } from 'react'
import { BottomTabBar } from './bottom-tab-bar'
import { useUser } from './user-context'

function RoleTabBar() {
  return <BottomTabBar userRole={useUser()?.userRole} />
}

export function MobileNav() {
  return (
    <Suspense fallback={<BottomTabBar />}>
      <RoleTabBar />
    </Suspense>
  )
}
