'use client'

import { createContext, type ReactNode, use, useContext } from 'react'
import type { ShellUser } from '../_lib/load-shell-user'

type UserPromise = Promise<ShellUser | null>

const UserContext = createContext<UserPromise | null>(null)

/** Suspends until the shell user lookup settles; null when unknown. */
export function useUser(): ShellUser | null {
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
