import type * as React from 'react'
import { cn } from '@/lib/utils'

export function CodeChip({ className, ...props }: Readonly<React.ComponentProps<'span'>>) {
  return (
    <span
      data-slot="code-chip"
      className={cn(
        'rounded bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}
