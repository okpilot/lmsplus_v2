'use client'

import { createContext, type ReactNode, useContext, useMemo } from 'react'

type UserContextValue = {
  displayName: string
  userRole?: string
}

const UserContext = createContext<UserContextValue | null>(null)

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useUser must be used within UserProvider')
  return ctx
}

type UserProviderProps = UserContextValue & { children: ReactNode }

export function UserProvider({ displayName, userRole, children }: UserProviderProps) {
  const value = useMemo(() => ({ displayName, userRole }), [displayName, userRole])
  return <UserContext value={value}>{children}</UserContext>
}
