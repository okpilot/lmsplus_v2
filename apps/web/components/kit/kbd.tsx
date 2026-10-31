import type { ReactNode } from 'react'

export function Kbd({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <kbd className="rounded-inner border-b-emphasis border-border bg-muted px-1.5 py-0.5 text-chip">
      {children}
    </kbd>
  )
}
