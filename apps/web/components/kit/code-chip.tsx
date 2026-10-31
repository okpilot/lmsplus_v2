import type * as React from 'react'
import { cn } from '@/lib/utils'

export function CodeChip({ className, ...props }: Readonly<React.ComponentProps<'span'>>) {
  return (
    <span
      data-slot="code-chip"
      className={cn(
        'inline-flex h-chip items-center rounded-inner bg-muted px-1.5 text-chip tabular-nums text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}
