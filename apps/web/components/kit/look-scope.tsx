import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type LookScopeProps = {
  children: ReactNode
  className?: string
}

/** Turns on the redesign look for its subtree; must sit inside <html>/<body>, never on them. */
export function LookScope({ children, className }: Readonly<LookScopeProps>) {
  return (
    <div data-look="v2" className={cn('bg-canvas text-foreground', className)}>
      {children}
    </div>
  )
}
