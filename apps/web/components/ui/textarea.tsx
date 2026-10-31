import type * as React from 'react'

import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: Readonly<React.ComponentProps<'textarea'>>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-control border border-input bg-field-fill px-2.5 py-2 text-body transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-focus focus-visible:ring-ring focus-visible:ring-offset-focus focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:bg-field-disabled disabled:opacity-disabled aria-invalid:border-invalid-border aria-invalid:ring-focus aria-invalid:ring-invalid-ring',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
