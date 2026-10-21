'use client'

import { createContext, type ReactNode, use, useContext } from 'react'
import type { ShellUser } from '../_lib/shell-user'

type UserPromise = Promise<ShellUser>

const UserContext = createContext<UserPromise | null>(null)

/**
 * Suspends until the shell user lookup settles. Call only under a `<Suspense>` boundary of its
 * own: an unbounded caller suspends up to the nearest ancestor boundary and blocks everything
 * under it, the streamed frame included.
 */
export function useUser(): ShellUser {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useUser must be used within UserProvider')
  return use(ctx)
}

export function UserProvider({
  user,
  children,
}: Readonly<{ user: UserPromise; children: ReactNode }>) {
  return <UserContext value={user}>{children}</UserContext>
}
