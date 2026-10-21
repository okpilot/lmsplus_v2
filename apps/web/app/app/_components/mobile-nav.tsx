'use client'

import { Suspense, useLayoutEffect, useState } from 'react'
import { BottomTabBar } from './bottom-tab-bar'
import { useUser } from './user-context'

/** Passes the resolved role up before paint; a state sync of an already-resolved context value, not a fetch. */
function RoleReporter({ onRole }: Readonly<{ onRole: (role: string) => void }>) {
  const { userRole } = useUser()
  useLayoutEffect(() => {
    onRole(userRole)
  }, [userRole, onRole])
  return null
}

/** One always-mounted bar: only the role reporter suspends, so the role arriving never remounts the bar. */
export function MobileNav() {
  const [userRole, setUserRole] = useState<string>()
  return (
    <>
      <BottomTabBar userRole={userRole} />
      <Suspense fallback={null}>
        <RoleReporter onRole={setUserRole} />
      </Suspense>
    </>
  )
}
