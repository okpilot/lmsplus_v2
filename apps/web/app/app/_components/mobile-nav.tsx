'use client'

import { Suspense, useCallback, useLayoutEffect, useState } from 'react'
import { BottomTabBar } from './bottom-tab-bar'
import type { NavViewer } from './nav-items'
import { useUser } from './user-context'

/** Passes the resolved role up before paint; a state sync of an already-resolved context value, not a fetch. */
function RoleReporter({ onState }: Readonly<{ onState: (state: NavViewer) => void }>) {
  const { userRole, courseCodes } = useUser()
  useLayoutEffect(() => {
    onState({ userRole, courseCodes })
  }, [userRole, courseCodes, onState])
  return null
}

/** Keeps the state identity stable when a re-shown reporter reports the same viewer (no render loop). */
function sameViewer(a: NavViewer | undefined, b: NavViewer): boolean {
  return a?.userRole === b.userRole && a?.courseCodes === b.courseCodes
}

/** One always-mounted bar: only the role reporter suspends, so the role arriving never remounts the bar. */
export function MobileNav() {
  const [state, setState] = useState<NavViewer>()
  const report = useCallback(
    (next: NavViewer) => setState((prev) => (sameViewer(prev, next) ? prev : next)),
    [],
  )
  return (
    <>
      <BottomTabBar userRole={state?.userRole} courseCodes={state?.courseCodes} />
      <Suspense fallback={null}>
        <RoleReporter onState={report} />
      </Suspense>
    </>
  )
}
