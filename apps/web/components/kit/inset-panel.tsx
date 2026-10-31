import type * as React from 'react'
import { cn } from '@/lib/utils'

export function InsetPanel({ className, ...props }: Readonly<React.ComponentProps<'div'>>) {
  return (
    <div
      data-slot="inset-panel"
      className={cn('rounded-control bg-muted p-3', className)}
      {...props}
    />
  )
}
