import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type LookScopeProps = {
  children: ReactNode
  className?: string
}

/**
 * Turns on the redesign look for its subtree when NEXT_PUBLIC_REDESIGN_LOOK is 'on' (Decision 113);
 * must sit inside <html>/<body>, never on them.
 */
export function LookScope({ children, className }: Readonly<LookScopeProps>) {
  const lookOn = process.env.NEXT_PUBLIC_REDESIGN_LOOK === 'on'
  return (
    <div
      data-look={lookOn ? 'v2' : undefined}
      className={cn('bg-canvas text-foreground', className)}
    >
      {children}
    </div>
  )
}
