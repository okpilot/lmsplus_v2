import { Input as InputPrimitive } from '@base-ui/react/input'
import type * as React from 'react'

import { cn } from '@/lib/utils'

const SIZE_CLASSES = {
  sm: 'h-7 rounded-inner px-2 py-0 text-body',
  default: 'h-(--control-h) rounded-control px-2.5 py-1 text-body',
  lg: 'h-12 rounded-control px-4 py-3 text-body',
} as const

type InputProps = Omit<React.ComponentProps<'input'>, 'size'> & {
  size?: keyof typeof SIZE_CLASSES
}

function Input({ className, type, size = 'default', ...props }: Readonly<InputProps>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'w-full min-w-0 border border-input bg-field-fill transition-colors outline-none file:mr-2 file:inline-flex file:h-6 file:rounded-inner file:border file:border-input file:bg-card file:px-2 file:text-label file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-field-disabled disabled:opacity-disabled aria-invalid:border-invalid-border aria-invalid:ring-3 aria-invalid:ring-invalid-ring',
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    />
  )
}

export { Input }
